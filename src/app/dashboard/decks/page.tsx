'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CSSProperties } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Deck } from '@/lib/types';
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats';
import { useDecks } from '@/features/dashboard/hooks/useDecks';
import { useTierLimits } from '@/features/dashboard/hooks/useTierLimits';
import { stabilityLabel } from '@/features/dashboard/utils/dashboardPresentation';
import { Icons } from '../components/Icons';
import { Modal } from '../components/Modal';
import {
  getDeckColor,
  globalStyles,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
} from '../components/styles';

type DeckSort = 'active' | 'name' | 'cards';

interface DeckRowModel {
  deck: Deck;
  title: string;
  subtitle: string;
  cards: number;
  dueCards: number;
  retention: number;
  stability: string;
  color: string;
}

const FLASHCARDS_PAGE_STYLES = `
  .flashcards-page {
    min-height: 100vh;
    background:
      radial-gradient(circle at 18% 0%, rgba(124, 58, 237, 0.16), transparent 32%),
      radial-gradient(circle at 88% 12%, rgba(59, 130, 246, 0.08), transparent 30%),
      linear-gradient(180deg, #0b0e16 0%, #0e111a 46%, #090b12 100%);
    color: #f8fafc;
  }

  .flashcards-main {
    width: min(100%, 1440px);
    margin: 0 auto;
    padding: 34px 18px 56px;
  }

  .flashcards-main *,
  .flashcards-main *::before,
  .flashcards-main *::after {
    box-sizing: border-box;
  }

  .flashcards-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 26px;
  }

  .flashcards-title h1 {
    margin: 0 0 8px;
    font-size: 40px;
    line-height: 1.08;
    font-weight: 850;
    letter-spacing: 0;
  }

  .flashcards-title p {
    margin: 0;
    color: #a8b0c2;
    font-size: 15px;
  }

  .flashcards-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .flashcards-primary,
  .flashcards-secondary,
  .flashcards-row-primary,
  .flashcards-row-secondary,
  .flashcards-link-button,
  .flashcards-rating-button,
  .flashcards-menu-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 8px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  }

  .flashcards-primary {
    min-height: 48px;
    padding: 0 22px;
    border: none;
    color: #ffffff;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    box-shadow: 0 18px 42px rgba(91, 33, 182, 0.28);
  }

  .flashcards-secondary {
    min-height: 48px;
    padding: 0 20px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    color: #ffffff;
    background: rgba(15, 17, 27, 0.66);
  }

  .flashcards-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 16px;
  }

  .flashcards-metric-card,
  .flashcards-panel {
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    background:
      linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.012)),
      rgba(15, 18, 30, 0.76);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.045), 0 22px 70px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }

  .flashcards-metric-card {
    min-height: 112px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 16px;
    align-items: center;
    padding: 20px;
  }

  .flashcards-icon-tile {
    width: 56px;
    height: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #a78bfa;
    background: rgba(124, 58, 237, 0.2);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
  }

  .flashcards-metric-card span {
    display: block;
    color: #a8b0c2;
    font-size: 13px;
    font-weight: 700;
  }

  .flashcards-metric-card strong {
    display: block;
    margin-top: 5px;
    color: #ffffff;
    font-size: 25px;
    line-height: 1;
    font-weight: 850;
  }

  .flashcards-metric-card small {
    display: block;
    margin-top: 8px;
    color: #8b96aa;
    font-size: 12px;
  }

  .flashcards-metric-trend {
    color: #34d399 !important;
    font-weight: 800;
  }

  .flashcards-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.03fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }

  .flashcards-stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .flashcards-panel {
    min-width: 0;
    overflow: hidden;
    padding: 18px;
  }

  .flashcards-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }

  .flashcards-panel-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .flashcards-panel-title svg {
    color: #8b5cf6;
    flex-shrink: 0;
  }

  .flashcards-panel-title h2 {
    margin: 0;
    color: #ffffff;
    font-size: 16px;
    line-height: 1.25;
    font-weight: 850;
  }

  .flashcards-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .flashcards-search {
    width: 210px;
    min-height: 38px;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 8px;
    padding: 0 12px;
    color: #e5e7eb;
    background: rgba(2, 6, 23, 0.34);
    outline: none;
  }

  .flashcards-sort {
    min-height: 38px;
    border: 1px solid transparent;
    color: #a8b0c2;
    background: transparent;
    outline: none;
    cursor: pointer;
    font-size: 13px;
  }

  .flashcards-sort option {
    color: #111827;
  }

  .flashcards-deck-list,
  .flashcards-reinforce-list,
  .flashcards-history-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .flashcards-deck-row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) 150px auto;
    gap: 14px;
    align-items: center;
    min-height: 86px;
    padding: 14px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.025);
  }

  .flashcards-deck-icon {
    width: 54px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .flashcards-deck-copy {
    min-width: 0;
  }

  .flashcards-deck-copy strong {
    display: block;
    overflow: hidden;
    color: #ffffff;
    font-size: 15px;
    font-weight: 850;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flashcards-deck-copy span {
    display: block;
    overflow: hidden;
    margin-top: 6px;
    color: #9aa4b8;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flashcards-due {
    color: #f59e0b;
    font-weight: 800;
  }

  .flashcards-progress-wrap {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .flashcards-progress-label {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: #dbe4f0;
    font-size: 13px;
    font-weight: 800;
  }

  .flashcards-progress {
    height: 10px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.13);
  }

  .flashcards-progress i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #8b5cf6, #5b21b6);
    box-shadow: 0 0 18px rgba(139, 92, 246, 0.42);
  }

  .flashcards-row-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-width: 128px;
  }

  .flashcards-row-primary,
  .flashcards-row-secondary {
    min-height: 32px;
    padding: 0 12px;
    font-size: 12px;
  }

  .flashcards-row-primary {
    border: none;
    color: #ffffff;
    background: linear-gradient(135deg, #7c3aed, #5b21b6);
  }

  .flashcards-row-secondary {
    border: 1px solid rgba(148, 163, 184, 0.16);
    color: #dbe4f0;
    background: rgba(255,255,255,0.03);
  }

  .flashcards-menu-button {
    width: 32px;
    height: 32px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    color: #9aa4b8;
    background: rgba(255,255,255,0.025);
    padding: 0;
  }

  .flashcards-row-menu {
    position: absolute;
    right: 14px;
    top: 54px;
    z-index: 20;
    min-width: 142px;
    padding: 6px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 8px;
    background: #111827;
    box-shadow: 0 18px 48px rgba(0,0,0,0.42);
  }

  .flashcards-row-menu button {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    color: #dbe4f0;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .flashcards-row-menu button.delete {
    color: #f87171;
  }

  .flashcards-more-link,
  .flashcards-link-button {
    border: none;
    color: #a78bfa;
    background: transparent;
    font-size: 13px;
  }

  .flashcards-more-link {
    width: 100%;
    justify-content: flex-end;
    min-height: 38px;
  }

  .flashcards-review-session {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .flashcards-session-box {
    padding: 16px;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 8px;
    background: rgba(255,255,255,0.025);
  }

  .flashcards-session-top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 18px;
    align-items: start;
    margin-bottom: 14px;
  }

  .flashcards-session-top span {
    color: #a78bfa;
    font-size: 12px;
    font-weight: 800;
  }

  .flashcards-session-top strong {
    display: block;
    margin-top: 3px;
    color: #ffffff;
    font-size: 15px;
  }

  .flashcards-session-progress {
    min-width: 170px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    color: #ffffff;
    font-size: 13px;
    font-weight: 800;
  }

  .flashcards-question-box {
    min-height: 112px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    border: 1px dashed rgba(148, 163, 184, 0.22);
    border-radius: 8px;
    text-align: center;
    padding: 18px;
  }

  .flashcards-question-box h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 18px;
    line-height: 1.35;
  }

  .flashcards-rating-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .flashcards-rating-button {
    min-height: 36px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    color: #a8b0c2;
    background: rgba(255,255,255,0.025);
  }

  .flashcards-rating-button.error {
    color: #fb7185;
    border-color: rgba(239, 68, 68, 0.32);
    background: rgba(239, 68, 68, 0.08);
  }

  .flashcards-rating-button.warn {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.32);
    background: rgba(245, 158, 11, 0.08);
  }

  .flashcards-rating-button.good {
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.32);
    background: rgba(59, 130, 246, 0.08);
  }

  .flashcards-rating-button.easy {
    color: #4ade80;
    border-color: rgba(34, 197, 94, 0.32);
    background: rgba(34, 197, 94, 0.08);
  }

  .flashcards-session-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.12);
    border-radius: 8px;
  }

  .flashcards-session-stats div {
    min-height: 56px;
    display: grid;
    align-content: center;
    padding: 0 16px;
    border-right: 1px solid rgba(148, 163, 184, 0.12);
  }

  .flashcards-session-stats div:last-child {
    border-right: none;
  }

  .flashcards-session-stats span,
  .flashcards-history-copy span {
    color: #9aa4b8;
    font-size: 12px;
  }

  .flashcards-session-stats strong {
    color: #ffffff;
    font-size: 18px;
    line-height: 1;
  }

  .flashcards-reinforce-item,
  .flashcards-history-item {
    min-height: 48px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 8px;
    background: rgba(255,255,255,0.02);
  }

  .flashcards-reinforce-item strong,
  .flashcards-history-copy strong {
    color: #ffffff;
    font-size: 14px;
  }

  .flashcards-badge {
    min-width: 122px;
    justify-self: end;
    padding: 5px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
  }

  .flashcards-badge.low {
    color: #fb7185;
    background: rgba(239, 68, 68, 0.11);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .flashcards-badge.medium {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.11);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .flashcards-empty {
    padding: 28px;
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    color: #a8b0c2;
    text-align: center;
  }

  .flashcards-empty button {
    margin-top: 16px;
  }

  .flashcards-loading {
    min-height: calc(100vh - 64px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .flashcards-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @media (max-width: 1120px) {
    .flashcards-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .flashcards-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 760px) {
    .flashcards-main {
      padding: 24px 12px 36px;
    }

    .flashcards-header,
    .flashcards-panel-header {
      flex-direction: column;
      align-items: stretch;
    }

    .flashcards-actions,
    .flashcards-toolbar {
      justify-content: stretch;
    }

    .flashcards-title h1 {
      font-size: 32px;
    }

    .flashcards-primary,
    .flashcards-secondary,
    .flashcards-search,
    .flashcards-sort {
      width: 100%;
    }

    .flashcards-deck-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: start;
    }

    .flashcards-progress-wrap,
    .flashcards-row-actions {
      grid-column: 2 / -1;
      width: 100%;
    }

    .flashcards-row-actions {
      flex-direction: row;
      min-width: 0;
    }

    .flashcards-row-actions button {
      flex: 1;
    }

    .flashcards-session-top,
    .flashcards-rating-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .flashcards-metrics,
    .flashcards-session-stats {
      grid-template-columns: 1fr;
    }

    .flashcards-session-stats div {
      border-right: none;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }

    .flashcards-session-stats div:last-child {
      border-bottom: none;
    }

    .flashcards-reinforce-item,
    .flashcards-history-item {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .flashcards-badge,
    .flashcards-link-button {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }
`;

function cleanTitle(title: string): string {
  return title.replace(/\.(pdf|docx|pptx|txt)$/i, '');
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function isSameWeek(timestamp: number): boolean {
  const now = new Date();
  const date = new Date(timestamp);
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(now.getDate() - day + 1);
  return date.getTime() >= start.getTime();
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function formatDeckSubtitle(deck: Deck, cards: number, dueCards: number, retention: number): string {
  const tags = [deck.materia, deck.tema, deck.concurso].filter(Boolean);
  const dueLabel = dueCards > 0 ? `${dueCards} para revisar` : 'nenhum pendente';
  return `${cards} cards · ${dueLabel} · retenção ${retention}%${tags.length ? ` · ${tags[0]}` : ''}`;
}

function buildDeckRows(
  decks: Deck[],
  cardCounts: Record<string, number>,
  stats: ReturnType<typeof useDashboardStats>['stats'],
): DeckRowModel[] {
  return decks.map((deck) => {
    const focus = stats?.focusDecks.find((item) => item.deckId === deck.id);
    const cards = cardCounts[deck.id] || 0;
    const dueCards = focus?.overdueCards ?? 0;
    const retention = focus ? clamp(Math.round(100 - focus.riskScore * 8)) : cards > 0 ? 86 : 0;
    const stability = focus ? stabilityLabel(focus.avgStability) : cards > 0 ? 'estabilidade alta' : 'sem histórico';

    return {
      deck,
      title: cleanTitle(deck.title),
      subtitle: formatDeckSubtitle(deck, cards, dueCards, retention),
      cards,
      dueCards,
      retention,
      stability,
      color: getDeckColor(deck.id),
    };
  });
}

function DashboardMetric({
  icon,
  label,
  value,
  detail,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  trend?: string;
}) {
  return (
    <div className="flashcards-metric-card">
      <span className="flashcards-icon-tile">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>
          {detail}
          {trend && <span className="flashcards-metric-trend"> {trend}</span>}
        </small>
      </div>
    </div>
  );
}

function DecksPageInner() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const { decks, cardCounts, loading: loadingDecks, addDeck, updateDeck, removeDeck } = useDecks(user?.id);
  const { stats, loading: loadingStats } = useDashboardStats(user?.id);
  const { tierLimits, incrementDeckCount } = useTierLimits();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [deckTitle, setDeckTitle] = useState('');
  const [deckDescription, setDeckDescription] = useState('');
  const [deckConcurso, setDeckConcurso] = useState('');
  const [deckMateria, setDeckMateria] = useState('');
  const [deckTema, setDeckTema] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<DeckSort>('active');

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        window.location.href = '/login';
        return;
      }
      setUser(authUser);
      setLoadingUser(false);
    };
    checkUser();
  }, []);

  const deckRows = useMemo(() => buildDeckRows(decks, cardCounts, stats), [cardCounts, decks, stats]);
  const totalCards = useMemo(() => Object.values(cardCounts).reduce((sum, count) => sum + count, 0), [cardCounts]);
  const decksCreatedThisWeek = useMemo(() => decks.filter((deck) => isSameWeek(deck.created_at)).length, [decks]);
  const dueToday = stats?.today.dueCards ?? deckRows.reduce((sum, row) => sum + row.dueCards, 0);
  const reviewedToday = stats?.today.reviewedToday ?? 0;
  const averageRetention = stats?.performance.recentPerformance7d != null
    ? Math.round(stats.performance.recentPerformance7d * 100)
    : deckRows.length > 0
      ? Math.round(deckRows.reduce((sum, row) => sum + row.retention, 0) / deckRows.length)
      : 0;

  const filteredDeckRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = deckRows.filter((row) => {
      if (!q) return true;
      const haystack = [
        row.title,
        row.deck.description,
        row.deck.concurso,
        row.deck.materia,
        row.deck.tema,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title, 'pt-BR');
      if (sortBy === 'cards') return b.cards - a.cards;
      return (b.dueCards - a.dueCards) || (b.cards - a.cards);
    });
  }, [deckRows, searchQuery, sortBy]);

  const currentDeck = filteredDeckRows[0] ?? deckRows[0] ?? null;
  const reviewTotal = Math.max(currentDeck?.dueCards ?? dueToday, reviewedToday + dueToday, 1);
  const reviewProgress = clamp(Math.round((reviewedToday / reviewTotal) * 100));
  const reinforceItems = (stats?.weakTopics.filter((topic) => topic.isWeak).slice(0, 3) ?? [])
    .map((topic) => ({
      id: topic.key,
      label: topic.label,
      badge: topic.avgStability < 2 ? 'estabilidade baixa' : 'estabilidade média',
      level: topic.avgStability < 2 ? 'low' : 'medium',
    }));

  const historyRows = [
    { id: 'today', icon: <Icons.Calendar />, title: 'Hoje', detail: `${reviewedToday} cards revisados`, time: formatTime(Date.now()) },
    { id: 'deck', icon: <Icons.Check />, title: currentDeck ? cleanTitle(currentDeck.deck.title) : 'Último deck', detail: currentDeck ? `${currentDeck.cards} cards disponíveis` : 'Nenhum deck concluído ainda', time: '21:15' },
    { id: 'import', icon: <Icons.Layers />, title: 'Esta semana', detail: `+${decksCreatedThisWeek} decks criados`, time: '14:03' },
  ];

  const resetForm = () => {
    setDeckTitle('');
    setDeckDescription('');
    setDeckConcurso('');
    setDeckMateria('');
    setDeckTema('');
    setSelectedDeck(null);
    setError('');
  };

  const openCreateModal = () => {
    if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) {
      alert('Limite atingido.');
      router.push('/upgrade');
      return;
    }
    setShowCreateModal(true);
  };

  const openEditModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setDeckTitle(deck.title);
    setDeckDescription(deck.description || '');
    setDeckConcurso(deck.concurso || '');
    setDeckMateria(deck.materia || '');
    setDeckTema(deck.tema || '');
    setShowEditModal(true);
    setActiveMenu(null);
  };

  const openDeleteModal = (deck: Deck) => {
    setSelectedDeck(deck);
    setShowDeleteModal(true);
    setActiveMenu(null);
  };

  const handleCreateDeck = async () => {
    if (!deckTitle.trim() || !user) return;
    if (tierLimits && !tierLimits.isPro && decks.length >= tierLimits.maxDecks) {
      setError(`Limite de ${tierLimits.maxDecks} decks atingido. Faça upgrade para Pro.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await addDeck(deckTitle, deckDescription, deckConcurso, deckMateria, deckTema);
      setShowCreateModal(false);
      resetForm();
      incrementDeckCount();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar deck');
    } finally {
      setSaving(false);
    }
  };

  const handleEditDeck = async () => {
    if (!deckTitle.trim() || !selectedDeck) return;
    setSaving(true);
    setError('');
    try {
      await updateDeck(selectedDeck.id, deckTitle, deckDescription, deckConcurso, deckMateria, deckTema);
      setShowEditModal(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar deck');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeck = async () => {
    if (!selectedDeck || !user) return;
    setSaving(true);
    try {
      await removeDeck(selectedDeck.id);
      setShowDeleteModal(false);
      setSelectedDeck(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const startReview = (deckId?: string) => {
    const targetDeckId = deckId ?? currentDeck?.deck.id ?? decks[0]?.id;
    router.push(targetDeckId ? `/estudar/${targetDeckId}` : '/dashboard/upload');
  };

  const isLoading = loadingUser || loadingDecks || loadingStats;

  if (isLoading) {
    return (
      <div className="flashcards-loading">
        <style>{`${globalStyles}\n${FLASHCARDS_PAGE_STYLES}`}</style>
        <div className="flashcards-spinner" />
      </div>
    );
  }

  return (
    <div className="flashcards-page">
      <style>{`${globalStyles}\n${FLASHCARDS_PAGE_STYLES}`}</style>
      <main className="flashcards-main">
        <header className="flashcards-header">
          <div className="flashcards-title">
            <h1>Flashcards</h1>
            <p>Revise com inteligência e mantenha sua retenção alta.</p>
          </div>
          <div className="flashcards-actions">
            <button type="button" className="flashcards-primary" onClick={() => startReview()}>
              <Icons.Play />
              Começar revisão inteligente
            </button>
            <button type="button" className="flashcards-secondary" onClick={openCreateModal}>
              <Icons.Plus />
              Criar deck
            </button>
          </div>
        </header>

        <section className="flashcards-metrics" aria-label="Resumo de flashcards">
          <DashboardMetric
            icon={<Icons.Calendar />}
            label="Para revisar hoje"
            value={`${dueToday} cards`}
            detail={`Distribuídos em ${Math.max(1, deckRows.filter((row) => row.dueCards > 0).length)} decks`}
          />
          <DashboardMetric
            icon={<Icons.Cards />}
            label="Revisados hoje"
            value={`${reviewedToday} cards`}
            detail={`${totalCards} cards no acervo`}
          />
          <DashboardMetric
            icon={<Icons.TrendingUp />}
            label="Retenção média"
            value={averageRetention ? `${averageRetention}%` : '--'}
            detail="Nos últimos 14 dias"
            trend={averageRetention ? '↗ 5%' : undefined}
          />
          <DashboardMetric
            icon={<Icons.Layers />}
            label="Decks ativos"
            value={String(decks.length)}
            detail={`+${decksCreatedThisWeek} criados esta semana`}
          />
        </section>

        <div className="flashcards-grid">
          <div className="flashcards-stack">
            <section className="flashcards-panel">
              <div className="flashcards-panel-header">
                <div className="flashcards-panel-title">
                  <Icons.Layers />
                  <h2>Seus decks</h2>
                </div>
                <div className="flashcards-toolbar">
                  <input
                    className="flashcards-search"
                    type="search"
                    placeholder="Buscar decks"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  <select
                    className="flashcards-sort"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as DeckSort)}
                    aria-label="Ordenar decks"
                  >
                    <option value="active">Ordenar: Ativos</option>
                    <option value="name">Ordenar: Nome</option>
                    <option value="cards">Ordenar: Cards</option>
                  </select>
                </div>
              </div>

              {filteredDeckRows.length === 0 ? (
                <div className="flashcards-empty">
                  <p>Nenhum deck encontrado com os filtros atuais.</p>
                  <button type="button" className="flashcards-secondary" onClick={() => setSearchQuery('')}>
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className="flashcards-deck-list">
                  {filteredDeckRows.slice(0, 5).map((row) => (
                    <article className="flashcards-deck-row" key={row.deck.id}>
                      <span
                        className="flashcards-deck-icon"
                        style={{ color: row.color, background: `${row.color}24` }}
                      >
                        <Icons.Cards />
                      </span>

                      <div className="flashcards-deck-copy">
                        <strong>{row.title}</strong>
                        <span>
                          {row.cards} cards
                          {' · '}
                          <span className={row.dueCards > 0 ? 'flashcards-due' : undefined}>
                            {row.dueCards > 0 ? `${row.dueCards} para revisar` : 'nenhum pendente'}
                          </span>
                          {' · '}
                          retenção {row.retention}%
                        </span>
                      </div>

                      <div className="flashcards-progress-wrap">
                        <div className="flashcards-progress-label">
                          <span>{row.retention}%</span>
                          <span>{row.stability}</span>
                        </div>
                        <div className="flashcards-progress">
                          <i style={{ width: `${row.retention}%` }} />
                        </div>
                      </div>

                      <div className="flashcards-row-actions">
                        <button type="button" className="flashcards-row-primary" onClick={() => startReview(row.deck.id)}>
                          <Icons.Play />
                          Revisar agora
                        </button>
                        <button type="button" className="flashcards-row-secondary" onClick={() => router.push(`/deck/${row.deck.id}`)}>
                          <Icons.Cards />
                          Ver cards
                        </button>
                      </div>

                      <button
                        type="button"
                        className="flashcards-menu-button"
                        aria-label={`Abrir ações de ${row.title}`}
                        onClick={() => setActiveMenu(activeMenu === row.deck.id ? null : row.deck.id)}
                      >
                        <Icons.MoreVertical />
                      </button>

                      {activeMenu === row.deck.id && (
                        <div className="flashcards-row-menu">
                          <button type="button" onClick={() => openEditModal(row.deck)}>
                            <Icons.Edit />
                            Editar
                          </button>
                          <button type="button" className="delete" onClick={() => openDeleteModal(row.deck)}>
                            <Icons.Trash />
                            Excluir
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {filteredDeckRows.length > 5 && (
                <button type="button" className="flashcards-more-link" onClick={() => setSearchQuery('')}>
                  Ver todos os decks
                  <Icons.ArrowRight />
                </button>
              )}
            </section>

            <section className="flashcards-panel">
              <div className="flashcards-panel-header">
                <div className="flashcards-panel-title">
                  <Icons.Target />
                  <h2>Pontos para reforçar</h2>
                </div>
              </div>

              {reinforceItems.length === 0 ? (
                <div className="flashcards-empty">
                  Nenhum ponto crítico detectado agora. Continue revisando para manter a curva forte.
                </div>
              ) : (
                <div className="flashcards-reinforce-list">
                  {reinforceItems.map((item) => (
                    <div className="flashcards-reinforce-item" key={item.id}>
                      <span className="flashcards-icon-tile" style={{ width: 34, height: 34 }}>
                        <Icons.Cards />
                      </span>
                      <strong>{item.label}</strong>
                      <span className={`flashcards-badge ${item.level}`}>{item.badge}</span>
                      <button type="button" className="flashcards-link-button" onClick={() => router.push('/dashboard/performance')}>
                        Revisar <Icons.ArrowRight />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="flashcards-stack">
            <section className="flashcards-panel">
              <div className="flashcards-panel-header">
                <div className="flashcards-panel-title">
                  <Icons.Target />
                  <h2>Sessão de revisão</h2>
                </div>
              </div>

              <div className="flashcards-review-session">
                <div className="flashcards-session-box">
                  <div className="flashcards-session-top">
                    <div>
                      <span>Sessão atual</span>
                      <strong>{currentDeck ? currentDeck.title : 'Crie um deck para começar'}</strong>
                    </div>
                    <div className="flashcards-session-progress">
                      <span>{reviewedToday}/{reviewTotal}</span>
                      <div className="flashcards-progress">
                        <i style={{ width: `${reviewProgress}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="flashcards-question-box">
                    <h3>{currentDeck ? `Qual ponto você vai revisar em ${currentDeck.title}?` : 'Nenhum deck ativo ainda'}</h3>
                    <button
                      type="button"
                      className="flashcards-row-secondary"
                      onClick={() => currentDeck ? router.push(`/deck/${currentDeck.deck.id}`) : openCreateModal()}
                    >
                      <Icons.Cards />
                      {currentDeck ? 'Mostrar cards' : 'Criar deck'}
                    </button>
                  </div>
                </div>

                <div className="flashcards-rating-grid" aria-label="Controles de avaliação">
                  <button type="button" className="flashcards-rating-button error">Errei</button>
                  <button type="button" className="flashcards-rating-button warn">Difícil</button>
                  <button type="button" className="flashcards-rating-button good">Bom</button>
                  <button type="button" className="flashcards-rating-button easy">Fácil</button>
                </div>

                <div className="flashcards-session-stats">
                  <div>
                    <span>Tempo</span>
                    <strong>{Math.max(1, Math.ceil((reviewedToday || dueToday || 1) * 0.6))} min</strong>
                  </div>
                  <div>
                    <span>Acertos</span>
                    <strong>{averageRetention ? `${averageRetention}%` : '--'}</strong>
                  </div>
                  <div>
                    <span>Restantes</span>
                    <strong>{dueToday}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="flashcards-panel">
              <div className="flashcards-panel-header">
                <div className="flashcards-panel-title">
                  <Icons.TrendingUp />
                  <h2>Histórico de revisão</h2>
                </div>
                <button type="button" className="flashcards-link-button" onClick={() => router.push('/dashboard/performance')}>
                  Ver histórico completo
                </button>
              </div>

              <div className="flashcards-history-list">
                {historyRows.map((row) => (
                  <div className="flashcards-history-item" key={row.id}>
                    <span className="flashcards-icon-tile" style={{ width: 36, height: 36 }}>
                      {row.icon}
                    </span>
                    <div className="flashcards-history-copy">
                      <strong>{row.title}</strong>
                      <span>{row.detail}</span>
                    </div>
                    <span style={{ color: '#8b96aa', fontSize: 12 }}>{row.time}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      {showCreateModal && (
        <Modal title="Criar novo deck" onClose={() => { setShowCreateModal(false); resetForm(); }}>
          <form onSubmit={(event) => { event.preventDefault(); handleCreateDeck(); }}>
            <DeckFormFields
              error={error}
              deckTitle={deckTitle}
              deckDescription={deckDescription}
              deckConcurso={deckConcurso}
              deckMateria={deckMateria}
              deckTema={deckTema}
              setDeckTitle={setDeckTitle}
              setDeckDescription={setDeckDescription}
              setDeckConcurso={setDeckConcurso}
              setDeckMateria={setDeckMateria}
              setDeckTema={setDeckTema}
            />
            <ModalActions
              submitLabel="Criar deck"
              saving={saving}
              disabled={!deckTitle.trim()}
              onCancel={() => { setShowCreateModal(false); resetForm(); }}
            />
          </form>
        </Modal>
      )}

      {showEditModal && selectedDeck && (
        <Modal title="Editar deck" onClose={() => { setShowEditModal(false); resetForm(); }}>
          <form onSubmit={(event) => { event.preventDefault(); handleEditDeck(); }}>
            <DeckFormFields
              error={error}
              deckTitle={deckTitle}
              deckDescription={deckDescription}
              deckConcurso={deckConcurso}
              deckMateria={deckMateria}
              deckTema={deckTema}
              setDeckTitle={setDeckTitle}
              setDeckDescription={setDeckDescription}
              setDeckConcurso={setDeckConcurso}
              setDeckMateria={setDeckMateria}
              setDeckTema={setDeckTema}
            />
            <ModalActions
              submitLabel="Salvar"
              saving={saving}
              disabled={!deckTitle.trim()}
              onCancel={() => { setShowEditModal(false); resetForm(); }}
            />
          </form>
        </Modal>
      )}

      {showDeleteModal && selectedDeck && (
        <Modal title="Excluir deck" onClose={() => { setShowDeleteModal(false); setSelectedDeck(null); }}>
          <p style={{ color: '#a1a1aa', marginBottom: 28, lineHeight: 1.7, fontSize: 15 }}>
            Tem certeza que deseja excluir o deck <strong style={{ color: '#f4f4f5' }}>&ldquo;{selectedDeck.title}&rdquo;</strong>?
            Esta ação não pode ser desfeita e todos os cards serão perdidos.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" onClick={() => { setShowDeleteModal(false); setSelectedDeck(null); }} style={secondaryButtonStyle}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDeleteDeck}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                boxShadow: '0 0 24px rgba(239, 68, 68, 0.3)',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Icons.Loader /> : 'Excluir'}
            </button>
          </div>
        </Modal>
      )}

      {activeMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setActiveMenu(null)} />}
    </div>
  );
}

function DeckFormFields({
  error,
  deckTitle,
  deckDescription,
  deckConcurso,
  deckMateria,
  deckTema,
  setDeckTitle,
  setDeckDescription,
  setDeckConcurso,
  setDeckMateria,
  setDeckTema,
}: {
  error: string;
  deckTitle: string;
  deckDescription: string;
  deckConcurso: string;
  deckMateria: string;
  deckTema: string;
  setDeckTitle: (value: string) => void;
  setDeckDescription: (value: string) => void;
  setDeckConcurso: (value: string) => void;
  setDeckMateria: (value: string) => void;
  setDeckTema: (value: string) => void;
}) {
  return (
    <>
      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 14, color: '#f87171', marginBottom: 20 }}>
          {error}
        </div>
      )}
      <div style={{ marginBottom: 20 }}>
        <label style={modalLabelStyle}>Título do deck *</label>
        <input
          type="text"
          placeholder="Ex: Direito Civil - OAB"
          value={deckTitle}
          onChange={(event) => setDeckTitle(event.target.value)}
          style={inputStyle}
          required
          autoFocus
        />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={modalLabelStyle}>Descrição</label>
        <textarea
          placeholder="Uma breve descrição..."
          value={deckDescription}
          onChange={(event) => setDeckDescription(event.target.value)}
          style={{ ...inputStyle, height: 88, resize: 'none' } as CSSProperties}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div>
          <label style={modalLabelStyle}>Concurso</label>
          <input type="text" placeholder="Ex: OAB" value={deckConcurso} onChange={(event) => setDeckConcurso(event.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={modalLabelStyle}>Matéria</label>
          <input type="text" placeholder="Ex: Direito Civil" value={deckMateria} onChange={(event) => setDeckMateria(event.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={modalLabelStyle}>Tema</label>
          <input type="text" placeholder="Ex: Contratos" value={deckTema} onChange={(event) => setDeckTema(event.target.value)} style={inputStyle} />
        </div>
      </div>
    </>
  );
}

function ModalActions({
  submitLabel,
  saving,
  disabled,
  onCancel,
}: {
  submitLabel: string;
  saving: boolean;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
        Cancelar
      </button>
      <button type="submit" disabled={saving || disabled} style={{ ...primaryButtonStyle, opacity: saving || disabled ? 0.6 : 1 }}>
        {saving ? <Icons.Loader /> : submitLabel}
      </button>
    </div>
  );
}

const modalLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 10,
  color: '#e4e4e7',
};

export default function DecksPage() {
  return (
    <Suspense>
      <DecksPageInner />
    </Suspense>
  );
}
