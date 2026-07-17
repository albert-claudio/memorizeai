import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import {
  decodeXmlEntities,
  extractDrawingTextRuns,
  extractWordTextRuns,
} from '../xml-text';
import {
  validateBufferMatchesType,
  DocumentValidationError,
  EmptyDocumentTextError,
} from '../validate-buffer';
import { extractDocx } from '../extract-docx';
import { extractPptx } from '../extract-pptx';
import { DOCUMENT_LIMITS } from '../limits';
import { loadSafeZip } from '../safe-zip';

describe('document-extraction security', () => {
  it('decodeXmlEntities decodes basic entities', () => {
    expect(decodeXmlEntities('a &amp; b')).toBe('a & b');
  });

  it('extractWordTextRuns pulls w:t nodes', () => {
    const xml = '<w:document><w:p><w:t>Hello</w:t><w:t> world</w:t></w:p></w:document>';
    expect(extractWordTextRuns(xml)).toEqual(['Hello', 'world']);
  });

  it('extractDrawingTextRuns pulls a:t nodes', () => {
    const xml = '<p:slide><a:t>Title</a:t><a:t>Body</a:t></p:slide>';
    expect(extractDrawingTextRuns(xml)).toEqual(['Title', 'Body']);
  });

  it('validateBufferMatchesType rejects PDF masquerading as zip', () => {
    const buf = Buffer.from('%PDF-1.4 fake');
    expect(() => validateBufferMatchesType(buf, 'docx')).toThrow(DocumentValidationError);
  });

  it('extractDocx rejects zip without word/document.xml', async () => {
    const zip = new JSZip();
    zip.file('readme.txt', 'not a docx');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(extractDocx(buffer)).rejects.toThrow(/documento principal ausente/i);
  });

  it('extractDocx reads minimal valid structure', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document><w:body><w:p><w:t>Teste DOCX</w:t></w:p></w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await extractDocx(buffer);
    expect(result.text).toContain('Teste DOCX');
    expect(result.pageCount).toBeGreaterThan(0);
  });

  it('extractDocx rejects documents without useful text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document><w:body /></w:document>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(extractDocx(buffer)).rejects.toThrow(EmptyDocumentTextError);
  });

  it('loadSafeZip does not enable CRC decompression during metadata validation', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document />');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const loadAsync = vi.spyOn(JSZip, 'loadAsync');

    try {
      await loadSafeZip(buffer);

      expect(loadAsync).toHaveBeenCalledWith(buffer);
      expect(loadAsync).not.toHaveBeenCalledWith(
        buffer,
        expect.objectContaining({ checkCRC32: true }),
      );
    } finally {
      loadAsync.mockRestore();
    }
  });

  it('extractDocx rejects oversized XML before extracting its text', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', 'x'.repeat(DOCUMENT_LIMITS.maxXmlEntryBytes + 1));
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    await expect(extractDocx(buffer)).rejects.toThrow(/grande demais/i);
  });

  it('extractPptx reads slides', async () => {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<?xml version="1.0"?><p:sld><a:t>Slide A</a:t><a:t>Content</a:t></p:sld>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await extractPptx(buffer);
    expect(result.slides).toHaveLength(1);
    expect(result.slides![0].title).toBe('Slide A');
    expect(result.text).toContain('Slide A');
  });

  it('extractPptx preserves source slide numbers when earlier slides have no text', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld />');
    zip.file(
      'ppt/slides/slide2.xml',
      '<?xml version="1.0"?><p:sld><a:t>Slide B</a:t><a:t>Content</a:t></p:sld>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await extractPptx(buffer);

    expect(result.slides).toHaveLength(1);
    expect(result.slides![0].slideNumber).toBe(2);
  });
});
