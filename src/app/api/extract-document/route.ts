import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthSuccess } from '@/lib/auth/auth-guard';
import { canUploadDocument } from '@/lib/billing/tier-limits';
import {
  extractDocument,
  DOCUMENT_LIMITS,
  DocumentValidationError,
  EmptyDocumentTextError,
  ExtractionTimeoutError,
  EMPTY_DOCUMENT_TEXT_MESSAGE,
  type FileType,
} from '@/lib/document-extraction';
import { internalServerErrorResponse } from '@/lib/security/api-error';
import {
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_CODE,
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_ERROR,
  DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
  isDocumentUploadAcknowledged,
} from '@/lib/document-upload-acknowledgement';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
} as const;

function preprocessText(rawText: string): string {
  let text = rawText.normalize('NFC');

  text = text.replace(/\r\n?/g, '\n');
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/(\w)-\s*\n\s*(\w)/g, '$1$2');
  text = text.replace(/^\s*\d+\s*$/gm, '');
  text = text.replace(/^(página|page)\s+\d+\s*$/gim, '');
  text = text.replace(/\s+([\.,:!?])/g, '$1');
  text = text.replace(/([\.,;:!?])([^\s\n])/g, '$1 $2');
  text = text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .join('\n');

  return text.trim();
}

function hasUsefulText(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function chunkText(text: string, maxChars: number = 50000): string[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  if (normalizedText.length <= maxChars) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  const paragraphs = normalizedText.split('\n\n');
  let currentChunk = '';

  const pushBounded = (value: string) => {
    let remaining = value.trim();

    while (remaining.length > maxChars) {
      let splitAt = remaining.lastIndexOf('\n', maxChars);
      if (splitAt < maxChars * 0.5) {
        splitAt = remaining.lastIndexOf('. ', maxChars);
      }
      if (splitAt < maxChars * 0.5) {
        splitAt = maxChars;
      }

      const chunk = remaining.slice(0, splitAt).trim();
      if (chunk) chunks.push(chunk);
      remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) chunks.push(remaining);
  };

  for (const paragraph of paragraphs) {
    const nextPart = `${paragraph}\n\n`;

    if (paragraph.length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      pushBounded(paragraph);
    } else if (currentChunk.length + nextPart.length <= maxChars) {
      currentChunk += nextPart;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = nextPart;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks;
}

function detectFileType(file: File): FileType | null {
  const mimeType = file.type as keyof typeof SUPPORTED_TYPES;
  if (SUPPORTED_TYPES[mimeType]) {
    return SUPPORTED_TYPES[mimeType];
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || ext === 'docx' || ext === 'pptx') {
    return ext;
  }

  return null;
}

function extractionErrorResponse(error: unknown): NextResponse {
  if (error instanceof EmptyDocumentTextError) {
    return NextResponse.json(
      { error: error.message, code: 'EMPTY_EXTRACTED_TEXT' },
      { status: 422 },
    );
  }

  if (error instanceof DocumentValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof ExtractionTimeoutError) {
    return NextResponse.json(
      { error: 'O documento demorou demais para processar. Tente um arquivo menor.' },
      { status: 408 },
    );
  }

  console.error('Erro ao processar documento:', error);
  return internalServerErrorResponse();
}

/**
 * POST /api/extract-document
 * Extrai texto de PDF, DOCX e PPTX sem mammoth/officeparser (OOXML via JSZip + regex limitado).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if (!isAuthSuccess(authResult)) {
      return authResult;
    }

    const uploadCheck = await canUploadDocument(authResult.user.id);
    if (!uploadCheck.allowed) {
      return NextResponse.json(
        {
          error: uploadCheck.reason,
          code: 'UPLOAD_LIMIT_REACHED',
          upgradeUrl: '/upgrade',
        },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const uploadAcknowledged = formData.get('uploadAcknowledged');
    const uploadAcknowledgementVersion = formData.get('uploadAcknowledgementVersion');

    if (!isDocumentUploadAcknowledged(uploadAcknowledged)) {
      return NextResponse.json(
        {
          error: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_ERROR,
          code: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_CODE,
          requiredVersion: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
        },
        { status: 400 },
      );
    }

    if (
      typeof uploadAcknowledgementVersion === 'string'
      && uploadAcknowledgementVersion !== DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION
    ) {
      console.warn('[extract-document] Unexpected upload acknowledgement version:', {
        userId: authResult.user.id,
        uploadAcknowledgementVersion,
        expectedVersion: DOCUMENT_UPLOAD_ACKNOWLEDGEMENT_VERSION,
      });
    }

    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nenhum arquivo fornecido' }, { status: 400 });
    }

    const fileType = detectFileType(file);
    if (!fileType) {
      return NextResponse.json(
        { error: 'Tipo de arquivo não suportado. Use PDF, DOCX ou PPTX.' },
        { status: 400 },
      );
    }

    if (file.size > DOCUMENT_LIMITS.maxUploadBytes) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Máximo: ${DOCUMENT_LIMITS.maxUploadBytes / (1024 * 1024)}MB` },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extractedData = await extractDocument(buffer, fileType);
    const cleanedText = preprocessText(extractedData.text);
    if (!hasUsefulText(cleanedText)) {
      throw new EmptyDocumentTextError(EMPTY_DOCUMENT_TEXT_MESSAGE);
    }

    const chunks = chunkText(cleanedText);

    const stats = {
      fileType,
      totalPages: extractedData.pageCount,
      totalCharacters: cleanedText.length,
      totalWords: cleanedText.match(/\S+/g)?.length ?? 0,
      chunks: chunks.length,
    };

    console.log('Documento processado:', {
      userId: authResult.user.id,
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
    return extractionErrorResponse(error);
  }
}
