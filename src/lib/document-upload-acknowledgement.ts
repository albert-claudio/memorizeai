export const DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION = '2026-03-16';

export const DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_ERROR =
  'Antes de enviar, confirme que voce tem direito ou autorizacao para usar este material e base legal adequada para dados pessoais de terceiros.';

export const DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_CODE =
  'DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_REQUIRED';

export function isDocumentUploadAcknowledged(value: unknown): boolean {
  if (value === true) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  return ['true', '1', 'on', 'yes'].includes(value.trim().toLowerCase());
}
