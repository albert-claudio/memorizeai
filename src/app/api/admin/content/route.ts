import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAdminSuccess } from '@/lib/auth/admin-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

type DeckRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  created_at: number;
  updated_at: number;
};

async function countByDeck(table: string, deckId: string) {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);
  return count ?? 0;
}

async function countReviewsForDeck(deckId: string) {
  const supabase = getSupabaseAdmin();
  const { data: cards } = await supabase.from('cards').select('id').eq('deck_id', deckId);
  const cardRows = (cards ?? []) as Array<{ id: string }>;
  const cardIds = cardRows.map((card) => card.id);
  if (cardIds.length === 0) return 0;
  const { count } = await supabase
    .from('card_reviews')
    .select('id', { count: 'exact', head: true })
    .in('card_id', cardIds);
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin(request);
  if (!isAdminSuccess(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '15', 10)));
  const search = searchParams.get('search')?.trim() ?? '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from('decks')
    .select('id, user_id, title, description, created_at, updated_at', { count: 'exact' })
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });

  if (search) query = query.ilike('title', `%${search}%`);

  const { data: decks, count, error } = await query.range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deckRows = (decks ?? []) as DeckRow[];
  const userIds = Array.from(new Set(deckRows.map((deck) => deck.user_id)));
  const emailMap = new Map<string, string>();
  await Promise.all(userIds.map(async (userId) => {
    const { data } = await supabase.auth.admin.getUserById(userId);
    if (data.user?.email) emailMap.set(userId, data.user.email);
  }));

  const rows = await Promise.all(deckRows.map(async (deck) => ({
    id: deck.id,
    userId: deck.user_id,
    userEmail: emailMap.get(deck.user_id) ?? '',
    title: deck.title,
    description: deck.description,
    createdAt: deck.created_at,
    updatedAt: deck.updated_at,
    cards: await countByDeck('cards', deck.id),
    reviews: await countReviewsForDeck(deck.id),
  })));

  const { data: recentRuns } = await supabase
    .from('runs')
    .select('id, user_id, deck_id, objective, status, model_used, token_count, items_generated, error_message, last_error_code, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({
    decks: rows,
    total: count ?? 0,
    page,
    limit,
    recentGenerations: recentRuns ?? [],
  });
}
