import { extractWordTextRuns } from './xml-text';
import { loadSafeZip, readZipEntryAsString } from './safe-zip';
import { DocumentValidationError, EmptyDocumentTextError } from './validate-buffer';
import type { ExtractionResult } from './types';

const DOCUMENT_XML = 'word/document.xml';

export async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  const zip = await loadSafeZip(buffer);

  if (!zip.file(DOCUMENT_XML)) {
    throw new DocumentValidationError('DOCX inválido: documento principal ausente');
  }

  const xml = await readZipEntryAsString(zip, DOCUMENT_XML);
  if (!xml) {
    throw new DocumentValidationError('Não foi possível ler o conteúdo do DOCX');
  }

  const runs = extractWordTextRuns(xml);
  const text = runs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) {
    throw new EmptyDocumentTextError();
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const pageCount = Math.max(1, Math.ceil(wordCount / 500));

  return { text, pageCount };
}
