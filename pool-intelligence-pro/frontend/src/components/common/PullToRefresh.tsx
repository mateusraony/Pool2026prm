/**
 * Pull-to-Refresh wrapper for mobile pages.
 * Shows a spinner indicator when pulling down from the top.
 * Only active on touch devices (lg:hidden indicator).
 */
import { useRef, useState, useCallback, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 70;

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget;
    if (el.scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      setPullY(Math.min(delta * 0.4, THRESHOLD * 1.3));
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullY >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(THRESHOLD * 0.5);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullY(0);
      }
    } else {
      setPullY(0);
    }
  }, [pullY, refreshing, onRefresh]);

  const showIndicator = pullY > 0 || refreshing;
  const progress = Math.min(pullY / THRESHOLD, 1);

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showIndicator && (
        <div
          className="lg:hidden flex items-center justify-center overflow-hidden transition-all"
          style={{ height: `${Math.max(pullY, refreshing ? 40 : 0)}px` }}
        >
          <RefreshCw
            className={`h-5 w-5 text-primary transition-transform ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={{ transform: `rotate(${progress * 360}deg)`, opacity: progress }}
          />
        </div>
      )}
      {children}
    </div>
  );
}
