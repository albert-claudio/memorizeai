import JSZip from 'jszip';
import { DOCUMENT_LIMITS } from './limits';
import { DocumentValidationError } from './validate-buffer';

type ZipFileMeta = {
  dir: boolean;
  /** Present on entries from JSZip when loaded from buffer */
  _data?: { uncompressedSize?: number };
};

function getUncompressedSize(file: ZipFileMeta): number {
  const size = file._data?.uncompressedSize;
  if (typeof size === 'number' && Number.isSafeInteger(size) && size >= 0) return size;
  throw new DocumentValidationError('Arquivo Office possui metadados ZIP inválidos');
}

/**
 * Loads ZIP metadata for a DOCX/PPTX and rejects oversized entries before
 * extracting any XML content.
 */
export async function loadSafeZip(buffer: Buffer): Promise<JSZip> {
  let zip: JSZip;
  try {
    // CRC validation makes JSZip decompress every entry while loading. For
    // untrusted OOXML input, only extract bounded XML entries after metadata checks.
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new DocumentValidationError('Não foi possível ler o arquivo Office (ZIP inválido)');
  }

  const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (fileNames.length > DOCUMENT_LIMITS.maxZipEntries) {
    throw new DocumentValidationError('Arquivo contém entradas demais');
  }

  let totalUncompressed = 0;
  for (const name of fileNames) {
    const entry = zip.files[name] as ZipFileMeta;
    const uncompressed = getUncompressedSize(entry);
    if (uncompressed > DOCUMENT_LIMITS.maxZipEntryUncompressedBytes) {
      throw new DocumentValidationError(`Entrada "${name}" excede o tamanho permitido`);
    }
    totalUncompressed += uncompressed;
    if (totalUncompressed > DOCUMENT_LIMITS.maxZipTotalUncompressedBytes) {
      throw new DocumentValidationError('Arquivo descomprimido excede o limite de segurança');
    }
  }

  return zip;
}

export async function readZipEntryAsString(zip: JSZip, path: string): Promise<string | null> {
  const normalized = path.replace(/\\/g, '/');
  const file = zip.file(normalized);
  if (!file) return null;

  const meta = file as ZipFileMeta;
  const uncompressed = getUncompressedSize(meta);
  if (uncompressed > DOCUMENT_LIMITS.maxXmlEntryBytes) {
    throw new DocumentValidationError(`Arquivo interno "${path}" é grande demais`);
  }

  const content = await file.async('string');
  if (content.length > DOCUMENT_LIMITS.maxXmlEntryBytes) {
    throw new DocumentValidationError(`Conteúdo de "${path}" excede o limite permitido`);
  }
  return content;
}
