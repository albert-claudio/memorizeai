import { DOCUMENT_LIMITS } from './limits';
import { extractDocx } from './extract-docx';
import { extractPdf } from './extract-pdf';
import { extractPptx } from './extract-pptx';
import type { ExtractionResult, FileType } from './types';
import {
  validateBufferMatchesType,
  DocumentValidationError,
  EmptyDocumentTextError,
  EMPTY_DOCUMENT_TEXT_MESSAGE,
} from './validate-buffer';
import { withExtractionTimeout, ExtractionTimeoutError } from './with-timeout';

export {
  DOCUMENT_LIMITS,
  DocumentValidationError,
  EmptyDocumentTextError,
  ExtractionTimeoutError,
  EMPTY_DOCUMENT_TEXT_MESSAGE,
};
export type { ExtractionResult, FileType, SlideContent } from './types';

function hasUsefulText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export async function extractDocument(
  buffer: Buffer,
  fileType: FileType,
): Promise<ExtractionResult> {
  validateBufferMatchesType(buffer, fileType);

  const work = (async () => {
    switch (fileType) {
      case 'pdf':
        return extractPdf(buffer);
      case 'docx':
        return extractDocx(buffer);
      case 'pptx':
        return extractPptx(buffer);
    }
  })();

  const result = await withExtractionTimeout(work);
  if (!hasUsefulText(result.text)) {
    throw new EmptyDocumentTextError();
  }

  return result;
}
