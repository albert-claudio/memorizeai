import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { requireAuth, requireAuthAndOwnership, isAuthSuccess } from '@/lib/auth/auth-guard';
import { generateAIText, getDefaultModelForProvider } from '@/lib/ai/provider-router';
import { emitContentReadyNotification } from '@/lib/notifications/emitters';
import { isSafeEntityId } from '@/lib/security/input-validation';
import type { AIProvider } from '@/lib/ai/types';
import {
  buildFallbackSourceDigestContent,
  buildSourceDigestRequest,
  buildSourceDigestRow,
  normalizeSourceDigestContent,
  type DigestChunk,
} from '@/lib/source-digest';
import { SOURCE_DIGEST_VERSION } from '@/lib/source-digest-prompts';
import { captureApiError, setSentryUser } from '@/lib/sentry';
import { internalServerErrorResponse } from '@/lib/security/api-error';
import {
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_CODE,
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_ERROR,
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
  isDocumentUploadAcknowledged,
} from '@/lib/document-upload-acknowledgement';

export const maxDuration = 120; // 2 minutes timeout
export const dynamic = 'force-dynamic';

const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;
const MAX_SLIDES = 500;

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

function resolveSourceDigestProvider(): AIProvider | null {
  const preferred = (process.env.SOURCE_DIGEST_PROVIDER || 'openai').toLowerCase();
  const candidates = [preferred, 'openai', 'gemini', 'groq'];

  for (const candidate of candidates) {
    if (candidate === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
    if (candidate === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
    if (candidate === 'groq' && process.env.GROQ_API_KEY) return 'groq';
  }

  return null;
}

// Split text into chunks with overlap
function chunkText(text: string, chunkSize = 1000, overlap = 100): Array<{ content: string; charStart: number; charEnd: number }> {
  const chunks: Array<{ content: string; charStart: number; charEnd: number }> = [];

  if (!text.trim()) {
    return chunks;
  }
  
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

// Semantic chunking: group consecutive slides with the same title prefix
interface SlideInput {
  slideNumber: number;
  title: string;
  body: string;
}

function chunkBySlides(
  slides: SlideInput[],
  maxChunkSize = 2000,
): Array<{ content: string; charStart: number; charEnd: number; topic?: string }> {
  if (slides.length === 0) return [];

  const chunks: Array<{ content: string; charStart: number; charEnd: number; topic?: string }> = [];
  let charOffset = 0;

  let currentGroup: SlideInput[] = [slides[0]];
  let currentTitle = slides[0].title;

  /**
   * Flush accumulated slides into one or more chunks.
   */
  function flush() {
    if (currentGroup.length === 0) return;

    // Build combined text: "[Topic] Title\n\nbody1\n\nbody2..."
    const topic = currentTitle;
    let combined = `[${topic}]\n`;
    for (const slide of currentGroup) {
      const slideText = [slide.title, slide.body].filter(Boolean).join('\n');
      combined += `\n${slideText}\n`;
    }
    combined = combined.trim();

    // If combined exceeds max, split into sub-chunks
    if (combined.length <= maxChunkSize) {
      const charStart = charOffset;
      charOffset += combined.length;
      chunks.push({ content: combined, charStart, charEnd: charOffset, topic });
    } else {
      // Simple split at paragraph boundaries
      const subChunks = chunkText(combined, maxChunkSize, 50);
      for (const sub of subChunks) {
        chunks.push({
          content: sub.content,
          charStart: charOffset + sub.charStart,
          charEnd: charOffset + sub.charEnd,
          topic,
        });
      }
      charOffset += combined.length;
    }

    currentGroup = [];
  }

  // Group consecutive slides with similar titles
  for (let i = 1; i < slides.length; i++) {
    const slide = slides[i];
    const titlePrefix = slide.title.split(/[:\-–—]/)[0].trim().toLowerCase();
    const currentPrefix = currentTitle.split(/[:\-–—]/)[0].trim().toLowerCase();

    if (titlePrefix === currentPrefix && titlePrefix.length > 2) {
      // Same topic group
      currentGroup.push(slide);
    } else {
      // New topic — flush current group
      flush();
      currentGroup = [slide];
      currentTitle = slide.title;
    }
  }

  flush();
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

    const {
      sourceId,
      extractedText,
      slides,
      uploadAcknowledged,
      uploadAcknowledgementVersion,
    } = await request.json();
    
    if (!sourceId || !extractedText) {
      return NextResponse.json(
        { error: 'sourceId and extractedText are required' },
        { status: 400 }
      );
    }

    if (typeof extractedText !== 'string') {
      return NextResponse.json(
        { error: 'extractedText must be a string' },
        { status: 400 }
      );
    }

    if (extractedText.length > MAX_EXTRACTED_TEXT_CHARS) {
      return NextResponse.json(
        { error: 'Documento excede o limite de texto processavel. Envie um arquivo menor.' },
        { status: 413 }
      );
    }

    if (slides !== undefined && (!Array.isArray(slides) || slides.length > MAX_SLIDES)) {
      return NextResponse.json(
        { error: 'slides invalido ou acima do limite permitido' },
        { status: 400 }
      );
    }

    if (!isSafeEntityId(sourceId)) {
      return NextResponse.json(
        { error: 'Invalid sourceId format' },
        { status: 400 }
      );
    }

    if (!isDocumentUploadAcknowledged(uploadAcknowledged)) {
      return NextResponse.json(
        {
          error: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_ERROR,
          code: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_CODE,
          requiredVersion: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
        },
        { status: 400 }
      );
    }

    if (
      typeof uploadAcknowledgementVersion === 'string'
      && uploadAcknowledgementVersion !== DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION
    ) {
      console.warn('[process-source] Unexpected upload acknowledgement version:', {
        sourceId,
        userId: authCheck.user.id,
        uploadAcknowledgementVersion,
        expectedVersion: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
      });
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

    if (!supabaseServiceKey) {
      console.error('[process-source] SUPABASE_SERVICE_ROLE_KEY is not configured');
      return internalServerErrorResponse();
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: sourceRow } = await supabase
      .from('sources')
      .select('filename, status')
      .eq('id', sourceId)
      .single();

    const sourceFilename = sourceRow?.filename ?? 'Seu documento';

    if (sourceRow?.status === 'processando') {
      return NextResponse.json(
        { error: 'Fonte ja esta em processamento' },
        { status: 409 }
      );
    }

    if (sourceRow?.status === 'concluido') {
      return NextResponse.json({
        ok: true,
        skipped: true,
        status: 'concluido',
        message: 'Fonte ja processada',
      });
    }

    console.log(`[process-source] Starting processing for source ${sourceId} by user ${authResult.user.id}`);
    setSentryUser({ id: authResult.user.id, email: authResult.user.email });

    // Update status to processing (processando)
    await supabase
      .from('sources')
      .update({ status: 'processando', updated_at: Date.now() })
      .eq('id', sourceId);

    try {
      // Normalize and chunk the text
      const normalizedText = normalizeText(extractedText);
      if (!normalizedText) {
        const errorMessage = 'Documento sem conteúdo textual útil para processamento.';
        await supabase
          .from('sources')
          .update({
            status: 'erro',
            error_message: errorMessage,
            updated_at: Date.now(),
          })
          .eq('id', sourceId);

        return NextResponse.json(
          { error: errorMessage, code: 'EMPTY_EXTRACTED_TEXT' },
          { status: 422 }
        );
      }

      // Use semantic chunking for PPTX slides, fixed chunking for others
      let chunks: Array<{ content: string; charStart: number; charEnd: number; topic?: string }>;
      if (Array.isArray(slides) && slides.length > 0) {
        console.log(`[process-source] Using semantic chunking for ${slides.length} slides`);
        chunks = chunkBySlides(slides, 2000);
        // Fallback if slide chunking produced nothing
        if (chunks.length === 0) {
          chunks = chunkText(normalizedText, 1000, 100);
        }
      } else {
        chunks = chunkText(normalizedText, 1000, 100);
      }

      if (chunks.length === 0) {
        const errorMessage = 'Documento sem conteúdo textual útil para processamento.';
        await supabase
          .from('sources')
          .update({
            status: 'erro',
            error_message: errorMessage,
            updated_at: Date.now(),
          })
          .eq('id', sourceId);

        return NextResponse.json(
          { error: errorMessage, code: 'EMPTY_EXTRACTED_TEXT' },
          { status: 422 }
        );
      }
      
      console.log(`[process-source] Created ${chunks.length} chunks from ${normalizedText.length} chars`);
      
      let processedChunks = 0;
      let reusedChunks = 0;
      const totalChunks = chunks.length;
      const resolvedChunks: Array<DigestChunk | undefined> = new Array(chunks.length);

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

          resolvedChunks[i] = {
            id: chunkId,
            content: chunk.content,
            position: i,
            pageNumber: null,
          };
          processedChunks++;
        }));

        // Update progress after each batch
        const progress = Math.round((Math.min(batchStart + BATCH_SIZE, chunks.length) / totalChunks) * 100);
        await supabase
          .from('sources')
          .update({ progress, updated_at: Date.now() })
          .eq('id', sourceId);
      }

      let digestGenerated = false;
      let digestVersion: string | null = null;
      let digestError: string | null = null;

      if ((process.env.SOURCE_DIGEST_ENABLED || 'true').toLowerCase() !== 'false') {
        try {
          const digestProvider = resolveSourceDigestProvider();
          const digestChunks = resolvedChunks.filter((chunk): chunk is DigestChunk => Boolean(chunk));

          if (digestProvider && digestChunks.length > 0) {
            const digestModel = process.env.SOURCE_DIGEST_MODEL || getDefaultModelForProvider(digestProvider, 'flashcards');
            const digestRequest = buildSourceDigestRequest(digestChunks);
            const digestResult = await generateAIText({
              provider: digestProvider,
              model: digestModel,
              system: digestRequest.system,
              user: digestRequest.user,
              promptCacheKey: digestRequest.promptCacheKey,
              maxOutputTokens: digestRequest.maxOutputTokens,
            });

            const parsedDigest = JSON.parse(
              digestResult.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            );
            const normalizedDigest = normalizeSourceDigestContent(parsedDigest);

            if (normalizedDigest.flashcard_context.length > 0) {
              const digestRow = buildSourceDigestRow({
                sourceId,
                provider: digestProvider,
                model: digestModel,
                result: digestResult,
                content: normalizedDigest,
              });

              const { error: digestInsertError } = await supabase
                .from('source_digests')
                .upsert(digestRow, {
                  onConflict: 'source_id,version',
                });

              if (digestInsertError) {
                throw digestInsertError;
              }

              digestGenerated = true;
              digestVersion = SOURCE_DIGEST_VERSION;
            } else {
              digestError = 'Digest vazio apos normalizacao';
            }
          } else {
            digestError = 'Nenhum provider de digest configurado';
          }
        } catch (digestGenerationError) {
          digestError = digestGenerationError instanceof Error
            ? digestGenerationError.message
            : 'Erro desconhecido ao gerar digest';
          console.error('[process-source] Digest generation error:', digestGenerationError);
        }
      }

      if (!digestGenerated) {
        const fallbackChunks = resolvedChunks.filter((chunk): chunk is DigestChunk => Boolean(chunk));
        if (fallbackChunks.length > 0) {
          try {
            const fallbackDigest = buildFallbackSourceDigestContent(fallbackChunks);
            if (fallbackDigest.flashcard_context.length > 0) {
              const { error: fallbackDigestError } = await supabase
                .from('source_digests')
                .upsert(
                  buildSourceDigestRow({
                    sourceId,
                    provider: null,
                    model: null,
                    result: null,
                    content: fallbackDigest,
                  }),
                  {
                    onConflict: 'source_id,version',
                  }
                );

              if (fallbackDigestError) {
                throw fallbackDigestError;
              }

              digestGenerated = true;
              digestVersion = SOURCE_DIGEST_VERSION;
              console.warn(
                `[process-source] Using fallback digest for source ${sourceId}${
                  digestError ? ` after AI digest failure: ${digestError}` : ''
                }`
              );
            }
          } catch (fallbackDigestError) {
            const fallbackMessage = fallbackDigestError instanceof Error
              ? fallbackDigestError.message
              : 'Erro desconhecido ao persistir digest fallback';
            digestError = digestError
              ? `${digestError}; fallback: ${fallbackMessage}`
              : fallbackMessage;
            console.error('[process-source] Fallback digest error:', fallbackDigestError);
          }
        }
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

      await emitContentReadyNotification({
        userId: authResult.user.id,
        type: 'content_ready',
        title: 'Conteúdo processado',
        body: `${sourceFilename} terminou de ser processado e já pode gerar cards ou questões.`,
        ctaLabel: 'Abrir gerador',
        ctaUrl: '/dashboard/runs',
        metadata: {
          sourceId,
          filename: sourceFilename,
          chunks: processedChunks,
          reusedChunks,
          digestGenerated,
          digestVersion,
        },
        dedupeKey: `content-ready:${sourceId}`,
      }).catch((notificationError) => {
        console.error('[process-source] Notification error:', notificationError);
      });

      return NextResponse.json({ 
        success: true, 
        chunks: processedChunks,
        reused: reusedChunks,
        digestGenerated,
        digestVersion,
        digestError,
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
      captureApiError(processingError, {
        route: '/api/process-source',
        userId: authResult.user.id,
        tags: { sourceId, action: 'processing' },
      });
      return NextResponse.json(
        { error: 'Falha ao processar a fonte. Tente novamente.' },
        { status: 500 }
      );
    }

  } catch (error) {
    captureApiError(error, { route: '/api/process-source', tags: { action: 'request' } });
    return internalServerErrorResponse();
  }
}
