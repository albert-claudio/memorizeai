import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireAuth, requireAuthAndOwnership, isAuthSuccess } from '@/lib/auth/auth-guard';

export const maxDuration = 120; // 2 minutes timeout
export const dynamic = 'force-dynamic';

// Generate cryptographically secure random ID
function generateId(): string {
  return crypto.randomUUID();
}

// Generate SHA-256 hash for content
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Normalize text for consistent hashing
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .trim();
}

// Split text into chunks with overlap
function chunkText(text: string, chunkSize = 1000, overlap = 100): Array<{ content: string; charStart: number; charEnd: number }> {
  const chunks: Array<{ content: string; charStart: number; charEnd: number }> = [];
  
  if (text.length <= chunkSize) {
    return [{ content: text, charStart: 0, charEnd: text.length }];
  }
  
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkEnd = end;
    
    // Try to break at paragraph or sentence boundary
    if (end < text.length) {
      const remaining = text.slice(start, end);
      const lastParagraph = remaining.lastIndexOf('\n\n');
      const lastSentence = remaining.lastIndexOf('. ');
      
      if (lastParagraph > chunkSize * 0.7) {
        chunkEnd = start + lastParagraph;
      } else if (lastSentence > chunkSize * 0.8) {
        chunkEnd = start + lastSentence + 1;
      }
    }
    
    const chunkContent = text.slice(start, chunkEnd).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        charStart: start,
        charEnd: chunkEnd,
      });
    }
    
    // Move start, accounting for overlap
    start = chunkEnd - overlap;
    if (start >= text.length - overlap) break;
  }
  
  return chunks;
}

/**
 * LOCAL Processing API - processes sources without Edge Function
 * POST /api/process-source
 * Body: { sourceId: string, extractedText: string }
 * 
 * SECURITY:
 * - Requires authenticated user with Pro subscription
 * - Validates source ownership (IDOR protection)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // ============================================================
    // SECURITY: Auth check FIRST — before any body validation
    // ============================================================
    const authCheck = await requireAuth(request);
    if (!isAuthSuccess(authCheck)) {
      return authCheck; // Returns 401 error response
    }

    const { sourceId, extractedText } = await request.json();
    
    if (!sourceId || !extractedText) {
      return NextResponse.json(
        { error: 'sourceId and extractedText are required' },
        { status: 400 }
      );
    }

    // ============================================================
    // SECURITY: Require auth + ownership validation (no Pro gate —
    // upload quota was checked at extract-document step)
    // ============================================================
    const authResult = await requireAuthAndOwnership(sourceId, 'sources', request);
    if (!isAuthSuccess(authResult)) {
      return authResult; // Returns 401/403 error response
    }

    // Create Supabase client with service role for database operations
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    // Use service key if available, otherwise use anon key
    const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

    console.log(`[process-source] Starting processing for source ${sourceId} by user ${authResult.user.id}`);

    // Update status to processing (processando)
    await supabase
      .from('sources')
      .update({ status: 'processando', updated_at: Date.now() })
      .eq('id', sourceId);

    try {
      // Normalize and chunk the text
      const normalizedText = normalizeText(extractedText);
      const chunks = chunkText(normalizedText, 1000, 100);
      
      console.log(`[process-source] Created ${chunks.length} chunks from ${normalizedText.length} chars`);
      
      let processedChunks = 0;
      let reusedChunks = 0;
      const totalChunks = chunks.length;

      // Process chunks in batches for better performance
      const BATCH_SIZE = 10;
      
      for (let batchStart = 0; batchStart < chunks.length; batchStart += BATCH_SIZE) {
        const batch = chunks.slice(batchStart, batchStart + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.all(batch.map(async (chunk, batchIndex) => {
          const i = batchStart + batchIndex;
          const contentHash = hashContent(chunk.content);

          // Check if chunk already exists
          const { data: existingChunk } = await supabase
            .from('chunks')
            .select('id')
            .eq('content_hash', contentHash)
            .single();

          let chunkId: string;

          if (existingChunk) {
            // Chunk exists, reuse it
            chunkId = existingChunk.id;
            reusedChunks++;
          } else {
            // Create new chunk
            chunkId = generateId();
            const { error: insertError } = await supabase
              .from('chunks')
              .insert({
                id: chunkId,
                content_hash: contentHash,
                content: chunk.content,
                page_number: null,
                char_start: chunk.charStart,
                char_end: chunk.charEnd,
                created_at: Date.now(),
              });

            if (insertError) {
              console.error('[process-source] Error inserting chunk:', insertError);
              return;
            }
          }

          // Create source_chunks relation (upsert to handle duplicates)
          await supabase
            .from('source_chunks')
            .upsert({
              source_id: sourceId,
              chunk_id: chunkId,
              position: i,
              created_at: Date.now(),
            });

          processedChunks++;
        }));

        // Update progress after each batch
        const progress = Math.round((Math.min(batchStart + BATCH_SIZE, chunks.length) / totalChunks) * 100);
        await supabase
          .from('sources')
          .update({ progress, updated_at: Date.now() })
          .eq('id', sourceId);
      }

      // Mark as completed (concluido)
      await supabase
        .from('sources')
        .update({ 
          status: 'concluido', 
          progress: 100, 
          updated_at: Date.now() 
        })
        .eq('id', sourceId);

      const duration = Date.now() - startTime;
      console.log(`[process-source] Completed in ${duration}ms: ${processedChunks} chunks (${reusedChunks} reused)`);

      return NextResponse.json({ 
        success: true, 
        chunks: processedChunks,
        reused: reusedChunks,
        duration: `${duration}ms`,
        message: `Processado: ${processedChunks} chunks (${reusedChunks} reutilizados)`
      });

    } catch (processingError) {
      // Mark as failed
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : 'Erro desconhecido no processamento';
      
      await supabase
        .from('sources')
        .update({ 
          status: 'erro', 
          error_message: errorMessage,
          updated_at: Date.now() 
        })
        .eq('id', sourceId);

      console.error('[process-source] Processing error:', processingError);
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('[process-source] Request error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
