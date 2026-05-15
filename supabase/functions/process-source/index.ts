// Supabase Edge Function: process-source
// Processes uploaded PDFs, extracts text, creates chunks with hash-based deduplication

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate cryptographically secure random ID (Deno compatible)
function generateId(): string {
  return crypto.randomUUID();
}

// Generate SHA-256 hash for content
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// Normalize text for consistent hashing
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")           // Normalize line endings
    .replace(/\n{3,}/g, "\n\n")        // Max 2 newlines
    .replace(/[ \t]{2,}/g, " ")        // Single spaces
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2") // Join hyphenated words
    .trim();
}

function hasProAccess(profile: {
  is_pro?: boolean | null;
  subscription_status?: string | null;
  subscription_period_end?: number | null;
  admin_override_pro?: boolean | null;
  cancel_at_period_end?: boolean | null;
} | null | undefined): boolean {
  if (!profile?.is_pro) return false;
  if (profile.cancel_at_period_end) return false;

  const status = profile.subscription_status ?? 'free';
  if (status !== 'active' && status !== 'past_due') return false;

  const periodEnd = profile.subscription_period_end;
  if (typeof periodEnd === 'number') {
    return periodEnd > Date.now();
  }

  return false;
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
      const lastParagraph = remaining.lastIndexOf("\n\n");
      const lastSentence = remaining.lastIndexOf(". ");
      
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

// Simple PDF text extraction (basic implementation)
// In production, you'd use a proper PDF library
async function extractTextFromPDF(pdfBytes: Uint8Array): Promise<{ text: string; pages: number }> {
  // Convert to string and extract readable text
  // This is a simplified extraction - for production use pdf-lib or similar
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let text = "";
  
  try {
    // Try to decode as UTF-8 text (works for text-based PDFs)
    const rawText = decoder.decode(pdfBytes);
    
    // Extract text between BT (Begin Text) and ET (End Text) markers
    const textMatches = rawText.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
    for (const match of textMatches) {
      const textBlock = match[1];
      // Extract text from Tj and TJ operators
      const tjMatches = textBlock.matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const tj of tjMatches) {
        text += tj[1] + " ";
      }
    }
    
    // Also try to extract plain text content
    const streamMatches = rawText.matchAll(/stream\s*([\s\S]*?)\s*endstream/g);
    for (const match of streamMatches) {
      const content = match[1];
      // Filter for readable ASCII text
      const readable = content.replace(/[^\x20-\x7E\n]/g, " ").trim();
      if (readable.length > 50) {
        text += readable + "\n";
      }
    }
    
    // Count pages
    const pageCount = (rawText.match(/\/Type\s*\/Page[^s]/g) || []).length;
    
    return {
      text: normalizeText(text) || "Não foi possível extrair texto do PDF.",
      pages: Math.max(1, pageCount),
    };
  } catch {
    return { text: "", pages: 0 };
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { sourceId } = await req.json();
    
    if (!sourceId) {
      return new Response(
        JSON.stringify({ error: "sourceId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ================================================================
    // SECURITY: Validate caller authorization
    // ================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Check if caller is using service role (internal call) or user token
    const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
    
    // Create client - service role for processing, user client for auth check
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // If NOT service role, validate user owns the source
    if (!isServiceRole) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify user owns this source
      const { data: ownedSource } = await supabase
        .from("sources")
        .select("id")
        .eq("id", sourceId)
        .eq("user_id", user.id)
        .single();

      if (!ownedSource) {
        return new Response(
          JSON.stringify({ error: "Forbidden - you do not own this source" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ================================================================
      // PRO TIER VALIDATION - Processing requires Pro subscription
      // ================================================================
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_pro, subscription_status, subscription_period_end, admin_override_pro")
        .eq("id", user.id)
        .single();
      const { data: subscription } = await supabase
        .from("subscriptions")
        .select("status, cancel_at_period_end, current_period_end")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const isPro = hasProAccess({
        ...profile,
        subscription_status: subscription?.status ?? profile?.subscription_status,
        subscription_period_end: subscription?.current_period_end ?? profile?.subscription_period_end,
        cancel_at_period_end: subscription?.cancel_at_period_end,
      });

      if (!isPro) {
        return new Response(
          JSON.stringify({ error: "Processing requires Pro subscription" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get source record (with service role client)
    const { data: source, error: sourceError } = await supabase
      .from("sources")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (sourceError || !source) {
      return new Response(
        JSON.stringify({ error: "Source not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("sources")
      .update({ status: "processando", updated_at: Date.now() })
      .eq("id", sourceId);

    try {
      // Download PDF from Storage
      const { data: pdfData, error: downloadError } = await supabase.storage
        .from("pdfs")
        .download(source.storage_path);

      if (downloadError || !pdfData) {
        throw new Error(`Failed to download PDF: ${downloadError?.message}`);
      }

      // Extract text from PDF
      const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
      const { text, pages } = await extractTextFromPDF(pdfBytes);

      if (!text || text.length < 10) {
        throw new Error("Não foi possível extrair texto do PDF. Verifique se o arquivo contém texto selecionável.");
      }

      // Update total pages
      await supabase
        .from("sources")
        .update({ total_pages: pages, updated_at: Date.now() })
        .eq("id", sourceId);

      // Normalize and chunk the text
      const normalizedText = normalizeText(text);
      const chunks = chunkText(normalizedText, 1000, 100);
      
      let processedChunks = 0;
      const totalChunks = chunks.length;

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const contentHash = await hashContent(chunk.content);

        // Check if chunk already exists
        const { data: existingChunk } = await supabase
          .from("chunks")
          .select("id")
          .eq("content_hash", contentHash)
          .single();

        let chunkId: string;

        if (existingChunk) {
          // Chunk exists, reuse it
          chunkId = existingChunk.id;
        } else {
          // Create new chunk
          chunkId = generateId();
          const { error: insertError } = await supabase
            .from("chunks")
            .insert({
              id: chunkId,
              content_hash: contentHash,
              content: chunk.content,
              page_number: null, // Would need page tracking during extraction
              char_start: chunk.charStart,
              char_end: chunk.charEnd,
              created_at: Date.now(),
            });

          if (insertError) {
            console.error("Error inserting chunk:", insertError);
            continue;
          }
        }

        // Create source_chunks relation
        await supabase
          .from("source_chunks")
          .upsert({
            source_id: sourceId,
            chunk_id: chunkId,
            position: i,
            created_at: Date.now(),
          });

        processedChunks++;

        // Update progress
        const progress = Math.round((processedChunks / totalChunks) * 100);
        await supabase
          .from("sources")
          .update({ progress, updated_at: Date.now() })
          .eq("id", sourceId);
      }

      // Mark as completed
      await supabase
        .from("sources")
        .update({ 
          status: "concluido",
          progress: 100, 
          updated_at: Date.now() 
        })
        .eq("id", sourceId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          chunks: processedChunks,
          message: `Processado com sucesso: ${processedChunks} chunks criados`
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (processingError) {
      // Mark as failed
      const errorMessage = processingError instanceof Error 
        ? processingError.message 
        : "Erro desconhecido no processamento";
      
      await supabase
        .from("sources")
        .update({ 
          status: "erro",
          error_message: errorMessage,
          updated_at: Date.now() 
        })
        .eq("id", sourceId);

      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
