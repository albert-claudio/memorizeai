import type { Card } from '@/lib/types';

type CardReferenceRow = {
  card_id: string;
  source_id: string;
  page_number: number | null;
  excerpt: string | null;
};

type SourceRow = {
  id: string;
  filename: string | null;
};

export async function attachCardSourceReferences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cards: Card[],
  logPrefix = 'cards',
): Promise<Card[]> {
  if (cards.length === 0) return cards;

  const cardIds = cards.map((card) => card.id);
  const cardSourceIds = cards
    .map((card) => card.source_id)
    .filter((sourceId): sourceId is string => Boolean(sourceId));

  const { data: references, error: referencesError } = await supabase
    .from('card_references')
    .select('card_id, source_id, page_number, excerpt')
    .in('card_id', cardIds);

  if (referencesError) {
    console.warn(`[${logPrefix}] failed to load card references:`, referencesError.message);
  }

  const referenceRows = (references ?? []) as CardReferenceRow[];
  const sourceIds = Array.from(new Set([
    ...cardSourceIds,
    ...referenceRows.map((reference) => reference.source_id),
  ]));

  let sourceRows: SourceRow[] = [];
  if (sourceIds.length > 0) {
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id, filename')
      .in('id', sourceIds);

    if (sourcesError) {
      console.warn(`[${logPrefix}] failed to load source names:`, sourcesError.message);
    }

    sourceRows = (sources ?? []) as SourceRow[];
  }

  const referencesByCard = new Map(referenceRows.map((reference) => [reference.card_id, reference]));
  const sourceNamesById = new Map(sourceRows.map((source) => [source.id, source.filename || 'Material de origem']));

  return cards.map((card) => {
    const reference = referencesByCard.get(card.id);
    const sourceId = reference?.source_id ?? card.source_id;

    if (!sourceId) return card;

    return {
      ...card,
      sourceReference: {
        sourceId,
        sourceName: sourceNamesById.get(sourceId) ?? 'Material de origem',
        pageNumber: reference?.page_number ?? null,
        excerpt: reference?.excerpt || card.citation_text,
      },
    };
  });
}
