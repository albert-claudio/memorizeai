/**
 * Extract visible text from OOXML XML using bounded regex (no DOM/XML parser).
 */

export function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}

/** WordprocessingML <w:t> */
export function extractWordTextRuns(xml: string): string[] {
  const parts: string[] = [];
  const re = /<(?:w:)?t(?:\s[^>]*)?>([^<]*)<\/(?:w:)?t>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1]).trim();
    if (text) parts.push(text);
  }
  return parts;
}

/** DrawingML <a:t> (PowerPoint) */
export function extractDrawingTextRuns(xml: string): string[] {
  const parts: string[] = [];
  const re = /<(?:a:)?t(?:\s[^>]*)?>([^<]*)<\/(?:a:)?t>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[1]).trim();
    if (text) parts.push(text);
  }
  return parts;
}

export function joinTextRuns(runs: string[], paragraphSep = '\n'): string {
  return runs.join(paragraphSep).replace(/[ \t]{2,}/g, ' ').trim() || '';
}
