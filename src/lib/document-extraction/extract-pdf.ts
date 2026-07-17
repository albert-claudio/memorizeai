import { DOCUMENT_LIMITS } from './limits';
import { DocumentValidationError, EmptyDocumentTextError } from './validate-buffer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFParser = require('pdf2json');

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

export async function extractPdf(buffer: Buffer): Promise<{ text: string; pageCount: number }> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: { parserError: unknown }) => {
      const message = errData.parserError instanceof Error
        ? errData.parserError.message
        : String(errData.parserError || 'PDF inválido ou corrompido');
      reject(new DocumentValidationError(message));
    });

    pdfParser.on(
      'pdfParser_dataReady',
      (pdfData: { Pages?: Array<{ Texts?: Array<{ R?: Array<{ T?: string }> }> }> }) => {
        try {
          let text = '';
          const pages = pdfData.Pages ?? [];
          const pageCount = Math.min(pages.length, DOCUMENT_LIMITS.maxPdfPages);

          if (pages.length > DOCUMENT_LIMITS.maxPdfPages) {
            reject(
              new DocumentValidationError(
                `PDF excede o limite de ${DOCUMENT_LIMITS.maxPdfPages} páginas`,
              ),
            );
            return;
          }

          for (let p = 0; p < pageCount; p++) {
            const page = pages[p];
            if (page.Texts && Array.isArray(page.Texts)) {
              for (const textItem of page.Texts) {
                if (textItem.R && Array.isArray(textItem.R)) {
                  for (const run of textItem.R) {
                    if (run.T) {
                      text += safeDecodeURIComponent(run.T) + ' ';
                    }
                  }
                }
              }
              text += '\n';
            }
          }

          const extractedText = text.trim();
          if (!extractedText) {
            reject(new EmptyDocumentTextError(
              'Não foi possível extrair texto do PDF. O arquivo pode estar escaneado ou protegido.',
            ));
            return;
          }

          resolve({ text: extractedText, pageCount });
        } catch (error) {
          reject(error);
        }
      },
    );

    try {
      pdfParser.parseBuffer(buffer);
    } catch (error) {
      reject(error);
    }
  });
}
