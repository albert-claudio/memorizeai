import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hasProAccess } from '@/lib/billing/pro-access';

// Route Segment Config (App Router format)
export const maxDuration = 120; // 120 segundos de timeout
export const dynamic = 'force-dynamic';

// pdf2json funciona nativamente no Node.js sem problemas de canvas/DOM
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

/**
 * Decodifica texto URI-encoded de forma segura
 */
function safeDecodeURIComponent(str: string): string {
  try {
    return decodeURIComponent(str);
  } catch {
    // Se falhar, tenta substituir caracteres problemáticos e decodificar novamente
    try {
      // Remove % seguido de caracteres inválidos
      const cleaned = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
      return decodeURIComponent(cleaned);
    } catch {
      // Se ainda falhar, retorna a string original
      return str;
    }
  }
}

/**
 * Limpa e pré-processa o texto extraído do PDF antes de enviar para a IA
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
  text = text.replace(/[^\w\s\.\,\;\:\!\?\(\)\[\]\-\"\'\/\náéíóúàèìòùâêîôûãõçñ]/gi, ' ');
  
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
 * (útil para PDFs longos que excedem o limite de tokens)
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
 * Extrai texto do PDF usando pdf2json
 */
async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);
    
    pdfParser.on('pdfParser_dataError', (errData: { parserError: string }) => {
      reject(new Error(errData.parserError));
    });
    
    pdfParser.on('pdfParser_dataReady', (pdfData: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
      try {
        let text = '';
        let pageCount = 0;
        
        // Extrai texto de todas as páginas
        if (pdfData.Pages && Array.isArray(pdfData.Pages)) {
          pageCount = pdfData.Pages.length;
          
          for (const page of pdfData.Pages) {
            if (page.Texts && Array.isArray(page.Texts)) {
              for (const textItem of page.Texts) {
                if (textItem.R && Array.isArray(textItem.R)) {
                  for (const run of textItem.R) {
                    if (run.T) {
                      // Decodifica o texto URI-encoded de forma segura
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
          numpages: pageCount,
        });
      } catch (error) {
        reject(error);
      }
    });
    
    // Parseia o PDF a partir do buffer
    pdfParser.parseBuffer(buffer);
  });
}

export async function POST(request: NextRequest) {
  try {
    // ================================================================
    // AUTHENTICATION CHECK - Prevent anonymous abuse
    // ================================================================
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ================================================================
    // PRO TIER VALIDATION - PDF extraction requires Pro subscription
    // ================================================================
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_pro, subscription_status, subscription_period_end, admin_override_pro')
      .eq('id', user.id)
      .single();

    const isPro = hasProAccess(profile);

    if (!isPro) {
      return NextResponse.json(
        { error: 'PDF extraction requires Pro subscription' },
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
    
    // Validar tipo de arquivo
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Arquivo deve ser um PDF' },
        { status: 400 }
      );
    }
    
    // Validar tamanho (max 50MB para suportar PDFs grandes)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'Arquivo muito grande. Máximo: 50MB' },
        { status: 400 }
      );
    }
    
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Extract text using pdf2json (Node.js compatible, sem DOMMatrix)
    const pdfData = await extractTextFromPDF(buffer);
    
    // Pré-processa o texto extraído
    const cleanedText = preprocessText(pdfData.text);
    
    // Divide em chunks se necessário
    const chunks = chunkText(cleanedText);
    
    // Estatísticas do texto
    const stats = {
      totalPages: pdfData.numpages,
      totalCharacters: cleanedText.length,
      totalWords: cleanedText.split(/\s+/).length,
      chunks: chunks.length,
    };
    
    console.log('PDF processado:', {
      fileName: file.name,
      ...stats,
    });
    
    return NextResponse.json({ 
      text: cleanedText,
      chunks,
      stats,
    });
    
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    return NextResponse.json(
      { 
        error: 'Falha ao processar PDF',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}
