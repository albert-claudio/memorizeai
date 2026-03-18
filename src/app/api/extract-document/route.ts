import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { requireAuth, isAuthSuccess } from '@/lib/auth/auth-guard';
import { canUploadDocument } from '@/lib/billing/tier-limits';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const officeParser = require('officeparser');

// Route Segment Config (App Router format)
export const maxDuration = 120; // 120 segundos de timeout
export const dynamic = 'force-dynamic';

// pdf2json funciona nativamente no Node.js sem problemas de canvas/DOM
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

// Supported MIME types
const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
} as const;

type FileType = 'pdf' | 'docx' | 'pptx';

/**
 * Decodifica texto URI-encoded de forma segura
 */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    try {
      const cleaned = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
      return decodeURIComponent(cleaned);
    } catch {
      return str;
    }
  }
}

/**
 * Limpa e pré-processa o texto extraído antes de enviar para a IA
 */
function preprocessText(rawText: string): string {
  let text = rawText;
  
  // 1. Remove quebras de linha excessivas
  text = text.replace(/\n{3,}/g, '\n\n');
  
  // 2. Remove espaços em branco múltiplos
  text = text.replace(/[ \t]{2,}/g, ' ');
  
  // 3. Remove hífens de quebra de linha (palavras separadas)
  text = text.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');
  
  // 4. Remove caracteres especiais desnecessários (mantém pontuação básica e acentos)
  text = text.replace(/[^\w\s\.\,\;\:\!\?\(\)\[\]\-\"\'\\/\náéíóúàéìòùâêîôûãõçñ]/gi, ' ');
  
  // 5. Remove números de página isolados
  text = text.replace(/^\s*\d+\s*$/gm, '');
  
  // 6. Remove cabeçalhos/rodapés repetitivos comuns
  text = text.replace(/^(página|page)\s+\d+\s*$/gim, '');
  
  // 7. Normaliza espaços em torno de pontuação
  text = text.replace(/\s+([\.,:!?])/g, '$1');
  text = text.replace(/([\.,;:!?])([^\s\n])/g, '$1 $2');
  
  // 8. Remove linhas muito curtas (provavelmente ruído)
  text = text
    .split('\n')
    .filter(line => line.trim().length > 3)
    .join('\n');
  
  // 9. Limpa espaços no início/fim
  text = text.trim();
  
  return text;
}

/**
 * Divide o texto em chunks se for muito grande
 * (útil para documentos longos que excedem o limite de tokens)
 */
function chunkText(text: string, maxChars: number = 50000): string[] {
  if (text.length <= maxChars) {
    return [text];
  }
  
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length < maxChars) {
      currentChunk += paragraph + '\n\n';
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = paragraph + '\n\n';
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks;
}

/**
 * Detecta o tipo de arquivo pelo MIME type ou extensão
 */
function detectFileType(file: File): FileType | null {
  // Check by MIME type first
  const mimeType = file.type as keyof typeof SUPPORTED_TYPES;
  if (SUPPORTED_TYPES[mimeType]) {
    return SUPPORTED_TYPES[mimeType];
  }
  
  // Fallback to extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'docx' || ext === 'pptx') {
    return ext;
  }
  
  return null;
}

/**
 * Extrai texto do PDF usando pdf2json
 */
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    
    pdfParser.on('pdfParser_dataError', (errData: { parserError: string }) => {
      reject(new Error(errData.parserError));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      try {
        let text = '';
        let pageCount = 0;
        
        if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
          pageCount = pdfData.Pages.length;
          
          for (const page of pdfData.Pages) {
            if (page.Texts && Array.isArray(page.Texts)) {
              for (const textItem of page.Texts) {
                if (textItem.R && Array.isArray(textItem.R)) {
                  for (const run of textItem.R) {
                    if (run.T) {
                      const decodedText = safeDecodeURIComponent(run.T);
                      text += decodedText + ' ';
                    }
                  }
                }
              }
              text += '\n';
            }
          }
        }
        
        resolve({
          text: text.trim(),
          pageCount,
        });
      } catch (error) {
        reject(error);
      }
    });
    
    pdfParser.parseBuffer(buffer);
  });
}

/**
 * Extrai texto do DOCX usando Mammoth
 * Mammoth foca em extrair texto limpo, ignorando estilos complexos
 */
async function extractTextFromDOCX(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const result = await mammoth.extractRawText({ buffer });
  
  // DOCX doesn't have page information readily available
  // Estimate ~500 words per page
  const wordCount = result.value.split(/\s+/).length;
  const estimatedPages = Math.max(1, Math.ceil(wordCount / 500));
  
  return {
    text: result.value,
    pageCount: estimatedPages,
  };
}

/**
 * Structured slide content extracted from PPTX
 */
interface SlideContent {
  slideNumber: number;
  title: string;
  body: string;
}

/**
 * Extrai texto do PPTX usando officeparser
 * Retorna o texto de cada slide + estrutura de slides
 */
async function extractTextFromPPTX(buffer: Buffer): Promise<{ text: string; pageCount: number; slides: SlideContent[] }> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  // Create temp file because officeparser works better with file paths
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `pptx-${Date.now()}.pptx`);
  
  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, buffer);
    
    return new Promise((resolve, reject) => {
      // officeParser.parseOffice callback signature varies - handle both cases
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      officeParser.parseOffice(tempFile, (firstArg: any, secondArg?: any) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }
        
        // Determine which argument is the data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any = null;
        
        if (firstArg && typeof firstArg.toText === 'function') {
          data = firstArg;
        } else if (firstArg instanceof Error) {
          reject(firstArg);
          return;
        } else if (secondArg && typeof secondArg.toText === 'function') {
          data = secondArg;
        } else if (firstArg && firstArg.type === 'pptx') {
          data = firstArg;
        }
        
        if (!data) {
          reject(new Error('Não foi possível extrair texto do PPTX'));
          return;
        }
        
        // Get flat text for backwards compat
        const text = typeof data.toText === 'function' ? data.toText() : '';
        
        // Extract per-slide structure from AST
        const slides: SlideContent[] = [];
        let slideNumber = 0;
        
        if (Array.isArray(data.content)) {
          for (const item of data.content) {
            if (item.type === 'slide') {
              slideNumber++;
              
              // Collect text boxes from the slide
              const textParts: string[] = [];
              if (Array.isArray(item.content)) {
                for (const child of item.content) {
                  if (child.type === 'text' && typeof child.value === 'string' && child.value.trim()) {
                    textParts.push(child.value.trim());
                  } else if (Array.isArray(child.content)) {
                    // Nested content (e.g., text inside shapes)
                    for (const nested of child.content) {
                      if (typeof nested === 'string' && nested.trim()) {
                        textParts.push(nested.trim());
                      } else if (nested && typeof nested.value === 'string' && nested.value.trim()) {
                        textParts.push(nested.value.trim());
                      }
                    }
                  }
                }
              }
              
              // First meaningful text part is the title, rest is body
              const title = textParts.length > 0 ? textParts[0] : `Slide ${slideNumber}`;
              const body = textParts.slice(1).join('\n');
              
              if (title || body) {
                slides.push({ slideNumber, title, body });
              }
            }
          }
        }
        
        // Fallback: if AST parsing didn't yield slides, split flat text
        if (slides.length === 0 && text.trim()) {
          const paragraphs = text.split('\n\n').filter((p: string) => p.trim());
          slides.push({
            slideNumber: 1,
            title: 'Documento',
            body: paragraphs.join('\n'),
          });
        }
        
        resolve({
          text,
          pageCount: slideNumber || 1,
          slides,
        });
      });
    });
  } catch (error) {
    // Clean up temp file on error
    try {
      const fs = await import('fs');
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * POST /api/extract-document
 * Extrai texto de documentos PDF, DOCX e PPTX
 * 
 * SECURITY:
 * - Requires authenticated user
 * - Free users: limited to 3 uploads/week
 * - Pro users: unlimited
 */
export async function POST(request: NextRequest) {
  try {
    // ============================================================
    // SECURITY: Require authentication
    // ============================================================
    const authResult = await requireAuth(request);
    if (!isAuthSuccess(authResult)) {
      return authResult; // Returns 401 error response
    }

    // ============================================================
    // UPLOAD QUOTA: Free users limited to 3/week
    // ============================================================
    const uploadCheck = await canUploadDocument(authResult.user.id);
    if (!uploadCheck.allowed) {
      return NextResponse.json(
        { 
          error: uploadCheck.reason,
          code: 'UPLOAD_LIMIT_REACHED',
          upgradeUrl: '/upgrade'
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo fornecido' },
        { status: 400 }
      );
    }
    
    // Detect file type
    const fileType = detectFileType(file);
    if (!fileType) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não suportado. Use PDF, DOCX ou PPTX.' },
        { status: 400 }
      );
    }
    
    // Validate size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 50MB' },
        { status: 400 }
      );
    }
    
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extract text based on file type
    let extractedData: { text: string; pageCount: number; slides?: SlideContent[] };
    
    switch (fileType) {
      case 'pdf':
        extractedData = await extractTextFromPDF(buffer);
        break;
      case 'docx':
        extractedData = await extractTextFromDOCX(buffer);
        break;
      case 'pptx':
        extractedData = await extractTextFromPPTX(buffer);
        break;
    }
    
    // Preprocess the extracted text
    const cleanedText = preprocessText(extractedData.text);
    
    // Chunk if necessary
    const chunks = chunkText(cleanedText);
    
    // Stats
    const stats = {
      fileType,
      totalPages: extractedData.pageCount,
      totalCharacters: cleanedText.length,
      totalWords: cleanedText.split(/\s+/).length,
      chunks: chunks.length,
    };
    
    console.log('Documento processado:', {
      fileName: file.name,
      ...stats,
      slides: extractedData.slides?.length ?? 0,
    });
    
    return NextResponse.json({ 
      text: cleanedText,
      chunks,
      stats,
      fileType,
      ...(extractedData.slides ? { slides: extractedData.slides } : {}),
    });
    
  } catch (error) {
    console.error('Erro ao processar documento:', error);
    return NextResponse.json(
      { 
        error: 'Falha ao processar documento',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}
