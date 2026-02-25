
import type { Card } from '@/lib/types';
import { CardItem } from './CardItem';
import { Icons } from './Icons';

interface CardListProps {
  cards: Card[];
  loading: boolean;
  onEdit: (card: Card) => void;
  onDelete: (card: Card) => void;
}

export function CardList({ cards, loading, onEdit, onDelete }: CardListProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Icons.Loader />
        <style jsx global>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: 16,
    }}>
      {cards.map(card => (
        <CardItem
          key={card.id}
          card={card}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
