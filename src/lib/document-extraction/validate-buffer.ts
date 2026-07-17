import type { FileType } from './types';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const;
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const; // %PDF

export class DocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentValidationError';
  }
}

export const EMPTY_DOCUMENT_TEXT_MESSAGE = 'Documento sem conteúdo textual útil para processamento.';

export class EmptyDocumentTextError extends DocumentValidationError {
  constructor(message: string = EMPTY_DOCUMENT_TEXT_MESSAGE) {
    super(message);
    this.name = 'EmptyDocumentTextError';
  }
}

function hasMagic(buffer: Buffer, magic: readonly number[]): boolean {
  if (buffer.length < magic.length) return false;
  return magic.every((byte, i) => buffer[i] === byte);
}

/**
 * Validates file content by magic bytes (no file-type dependency).
 */
export function validateBufferMatchesType(buffer: Buffer, expected: FileType): void {
  if (buffer.length < 4) {
    throw new DocumentValidationError('Arquivo inválido ou corrompido');
  }

  switch (expected) {
    case 'pdf':
      if (!hasMagic(buffer, PDF_MAGIC)) {
        throw new DocumentValidationError('O conteúdo não corresponde a um PDF válido');
      }
      break;
    case 'docx':
    case 'pptx':
      if (!hasMagic(buffer, ZIP_MAGIC)) {
        throw new DocumentValidationError('O conteúdo não corresponde a um documento Office válido');
      }
      break;
    default:
      throw new DocumentValidationError('Tipo de arquivo não suportado');
  }
}
