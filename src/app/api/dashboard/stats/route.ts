import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tzOffset = parseInt(url.searchParams.get('tzOffset') || '0', 10); // in minutes
  const startOfDay = parseInt(url.searchParams.get('startOfDay') || Date.now().toString(), 10);
  const currentMs = Date.now();

  try {
    // 1. Fetch decks
    const { data: decks } = await supabase
      .from('decks')
      .select('id, title, concurso, materia, tema')
      .eq('user_id', user.id)
      .is('deleted_at', null);

    const deckIds = (decks || []).map(d => d.id);

    // 2. Compute dueCards and focusDecks
    let totalDueCards = 0;
    const deckStats: Record<string, { overdue: number, leech: number }> = {};
    deckIds.forEach(id => { deckStats[id] = { overdue: 0, leech: 0 } });

    if (deckIds.length > 0) {
      const { data: cardsData } = await supabase
        .from('cards')
        .select('deck_id, next_review_at, is_leech')
        .in('deck_id', deckIds)
        .is('deleted_at', null);

      (cardsData || []).forEach(card => {
        let isOverdue = false;
        if (card.next_review_at && card.next_review_at <= currentMs) {
          totalDueCards++;
          isOverdue = true;
        }
        
        if (deckStats[card.deck_id]) {
          if (isOverdue) deckStats[card.deck_id].overdue++;
          if (card.is_leech) deckStats[card.deck_id].leech++;
        }
      });
    }

    const focusDecks = (decks || []).map(deck => {
      const stats = deckStats[deck.id] || { overdue: 0, leech: 0 };
      const riskScore = stats.overdue + (stats.leech * 2);
      return {
        deckId: deck.id,
        deckTitle: deck.title,
        concurso: deck.concurso,
        materia: deck.materia,
        tema: deck.tema,
        overdueCards: stats.overdue,
        leechCards: stats.leech,
        riskScore
      };
    })
    .filter(d => d.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 5); // Limit to top 5 most urgent

    // 3. Reviewed Today
    const { count: reviewedToday } = await supabase
      .from('card_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('reviewed_at', startOfDay);

    // 4. Recent Performance & Streak
    const sixtyDaysAgo = currentMs - 60 * 24 * 60 * 60 * 1000;
    const { data: recentReviews } = await supabase
      .from('card_reviews')
      .select('grade, reviewed_at')
      .eq('user_id', user.id)
      .gte('reviewed_at', sixtyDaysAgo)
      .order('reviewed_at', { ascending: false });

    const reviewsList = recentReviews || [];
    
    // Performance: last 7 days only
    const sevenDaysAgo = currentMs - 7 * 24 * 60 * 60 * 1000;
    const perfReviews = reviewsList.filter(r => r.reviewed_at >= sevenDaysAgo);
    const positiveReviews = perfReviews.filter(r => r.grade >= 3).length;
    const recentPerformance7d = perfReviews.length > 0 
      ? (positiveReviews / perfReviews.length) 
      : null;

    // Streak
    const getDayString = (ms: number) => {
      const d = new Date(ms - tzOffset * 60000); // tzOffset in minutes (JS uses negative offset for positive timezones)
      return d.toISOString().split('T')[0];
    };

    const reviewDays = Array.from(new Set(reviewsList.map(r => getDayString(r.reviewed_at))));
    const todayStr = getDayString(currentMs);
    const yesterdayStr = getDayString(currentMs - 24 * 60 * 60 * 1000);
    
    let studyStreakDays = 0;
    
    if (reviewDays.includes(todayStr) || reviewDays.includes(yesterdayStr)) {
      const checkDateObj = new Date(currentMs - tzOffset * 60000);
      if (!reviewDays.includes(todayStr)) {
        checkDateObj.setDate(checkDateObj.getDate() - 1);
      }
      
      while(true) {
        const checkStr = checkDateObj.toISOString().split('T')[0];
        if (reviewDays.includes(checkStr)) {
          studyStreakDays++;
          checkDateObj.setDate(checkDateObj.getDate() - 1);
        } else {
          break;
        }
      }
    }

    // 5. Simulados
    const { data: simuladosData } = await supabase
      .from('simulados')
      .select('status, acertos, total_questoes')
      .eq('user_id', user.id)
      .eq('status', 'concluido')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    let recentAverage = null;
    let lastScore = null;

    if (simuladosData && simuladosData.length > 0) {
      const scores = simuladosData
        .filter(s => s.total_questoes > 0)
        .map(s => (s.acertos || 0) / s.total_questoes);
      
      if (scores.length > 0) {
        lastScore = scores[0];
        recentAverage = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    return NextResponse.json({
      today: { dueCards: totalDueCards, reviewedToday: reviewedToday || 0 },
      performance: { recentPerformance7d, studyStreakDays },
      focusDecks,
      simulados: { recentAverage, lastScore }
    });

  } catch (error) {
    console.error('Error in stats route:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
