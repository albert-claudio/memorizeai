
import { useState, useRef, useCallback } from 'react';

interface UseSwipeProps {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  disabled?: boolean;
}

export function useSwipe({ onSwipeLeft, onSwipeRight, disabled }: UseSwipeProps) {
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    if (disabled) return;
    setIsDragging(true);
    startPos.current = { x: clientX, y: clientY };
  }, [disabled]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || disabled) return;
    const deltaX = clientX - startPos.current.x;
    const deltaY = clientY - startPos.current.y;
    setDragOffset({ x: deltaX, y: deltaY * 0.3 });
  }, [isDragging, disabled]);

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    
    const threshold = 100;
    if (dragOffset.x > threshold) {
      setSwipeDirection('right');
      onSwipeRight();
    } else if (dragOffset.x < -threshold) {
      setSwipeDirection('left');
      onSwipeLeft();
    } else {
      setDragOffset({ x: 0, y: 0 });
    }
  }, [isDragging, dragOffset.x, onSwipeRight, onSwipeLeft]);

  const resetSwipe = useCallback(() => {
    setSwipeDirection(null);
    setDragOffset({ x: 0, y: 0 });
  }, []);

  return {
    dragOffset,
    isDragging,
    swipeDirection,
    handlers: {
      handleDragStart,
      handleDragMove,
      handleDragEnd
    },
    resetSwipe
  };
}
