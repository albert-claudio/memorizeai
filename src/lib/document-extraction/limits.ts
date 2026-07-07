/** Hard limits for untrusted document parsing */
export const DOCUMENT_LIMITS = {
  /** Max uploaded file size (bytes) */
  maxUploadBytes: 50 * 1024 * 1024,
  /** Wall-clock limit per extraction */
  extractionTimeoutMs: 60_000,
  /** PDF */
  maxPdfPages: 300,
  /** ZIP / OOXML */
  maxZipEntries: 2_000,
  maxZipEntryUncompressedBytes: 10 * 1024 * 1024,
  maxZipTotalUncompressedBytes: 80 * 1024 * 1024,
  maxXmlEntryBytes: 5 * 1024 * 1024,
  maxPptxSlides: 500,
} as const;
