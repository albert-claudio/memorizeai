import { DOCUMENT_LIMITS } from './limits';
import { extractDrawingTextRuns } from './xml-text';
import { loadSafeZip, readZipEntryAsString } from './safe-zip';
import { DocumentValidationError, EmptyDocumentTextError } from './validate-buffer';
import type { ExtractionResult, SlideContent } from './types';

const SLIDE_PATH_RE = /^ppt\/slides\/slide(\d+)\.xml$/i;

function listSlidePaths(zip: import('jszip')): Array<{ path: string; slideNumber: number }> {
  const paths: Array<{ path: string; num: number }> = [];
  for (const name of Object.keys(zip.files)) {
    const match = name.replace(/\\/g, '/').match(SLIDE_PATH_RE);
    if (match) {
      paths.push({ path: name, num: parseInt(match[1], 10) });
    }
  }
  paths.sort((a, b) => a.num - b.num);
  return paths.map((p) => ({ path: p.path, slideNumber: p.num }));
}

export async function extractPptx(buffer: Buffer): Promise<ExtractionResult> {
  const zip = await loadSafeZip(buffer);
  const slidePaths = listSlidePaths(zip);

  if (slidePaths.length === 0) {
    throw new DocumentValidationError('PPTX inválido: nenhum slide encontrado');
  }
  if (slidePaths.length > DOCUMENT_LIMITS.maxPptxSlides) {
    throw new DocumentValidationError('Apresentação contém slides demais');
  }

  const slides: SlideContent[] = [];
  const flatParts: string[] = [];

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    const xml = await readZipEntryAsString(zip, slidePath.path);
    if (!xml) continue;

    const runs = extractDrawingTextRuns(xml);
    if (runs.length === 0) continue;

    const title = runs[0] ?? `Slide ${slidePath.slideNumber}`;
    const body = runs.slice(1).join('\n');
    slides.push({ slideNumber: slidePath.slideNumber, title, body });
    flatParts.push(runs.join(' '));
  }

  if (slides.length === 0) {
    throw new EmptyDocumentTextError('Não foi possível extrair texto do PPTX');
  }

  return {
    text: flatParts.join('\n\n'),
    pageCount: slides.length,
    slides,
  };
}
