import { useMemo } from 'react';
import { Pool } from '@/types/pool';
import { cn } from '@/lib/utils';

interface RangeChartProps {
  pool: Pool;
  selectedRange: 'defensive' | 'optimized' | 'aggressive' | 'custom';
  customRange?: { min: number; max: number };
  onRangeChange?: (range: { min: number; max: number }) => void;
  className?: string;
}

export function RangeChart({
  pool,
  selectedRange,
  customRange,
  className,
}: RangeChartProps) {
  const activeRange = useMemo(() => {
    if (selectedRange === 'custom' && customRange) return customRange;
    return pool.ranges[selectedRange as keyof typeof pool.ranges] || pool.ranges.optimized;
  }, [selectedRange, customRange, pool.ranges]);

  const rangeWidth = pool.ranges.defensive.max - pool.ranges.defensive.min;

  // Generate mock liquidity distribution
  const liquidityBars = useMemo(() => {
    if (rangeWidth <= 0) return [];
    const bars = [];
    const numBars = 40;
    const step = rangeWidth / numBars;

    for (let i = 0; i < numBars; i++) {
      const price = pool.ranges.defensive.min + (i * step);
      const distanceFromCurrent = Math.abs(price - pool.currentPrice);
      const normalizedDistance = distanceFromCurrent / (rangeWidth / 2);
      const height = Math.max(10, 100 - (normalizedDistance * 80) + (Math.random() * 20));

      const isInRange = price >= activeRange.min && price <= activeRange.max;
      const isCurrent = Math.abs(price - pool.currentPrice) < step / 2;

      bars.push({ price, height, isInRange, isCurrent });
    }
    return bars;
  }, [pool, activeRange, rangeWidth]);

  const formatPrice = (price: number) => {
    if (price < 0.001) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toFixed(0);
  };

  const getPosition = (price: number) => {
    if (rangeWidth <= 0) return 50;
    return ((price - pool.ranges.defensive.min) / rangeWidth) * 100;
  };

  // Guard: if ranges are invalid, show a message instead of crashing
  if (rangeWidth <= 0) {
    return (
      <div className={cn('glass-card p-6 text-center', className)}>
        <p className="text-muted-foreground">Dados de range indisponiveis para esta pool</p>
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Distribuicao de Liquidez & Range</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Preco atual:</span>
          <span className="font-mono text-primary">{formatPrice(pool.currentPrice)}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-48 mt-4">
        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {liquidityBars.map((bar, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-t transition-all duration-300',
                bar.isInRange
                  ? 'bg-primary/60'
                  : 'bg-muted-foreground/20',
                bar.isCurrent && 'bg-warning'
              )}
              style={{ height: `${bar.height}%` }}
            />
          ))}
        </div>

        {/* Range overlay */}
        <div
          className="absolute bottom-0 top-0 border-l-2 border-r-2 border-primary bg-primary/10 pointer-events-none"
          style={{
            left: `${getPosition(activeRange.min)}%`,
            width: `${getPosition(activeRange.max) - getPosition(activeRange.min)}%`,
          }}
        />

        {/* Current price line */}
        <div
          className="absolute bottom-0 top-0 w-0.5 bg-warning z-10"
          style={{ left: `${getPosition(pool.currentPrice)}%` }}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-warning px-2 py-0.5 text-[10px] font-mono text-warning-foreground whitespace-nowrap">
            {formatPrice(pool.currentPrice)}
          </div>
        </div>
      </div>

      {/* Range Labels */}
      <div className="relative h-8 mt-2">
        <div
          className="absolute text-xs font-mono text-primary"
          style={{ left: `${getPosition(activeRange.min)}%`, transform: 'translateX(-50%)' }}
        >
          {formatPrice(activeRange.min)}
        </div>
        <div
          className="absolute text-xs font-mono text-primary"
          style={{ left: `${getPosition(activeRange.max)}%`, transform: 'translateX(-50%)' }}
        >
          {formatPrice(activeRange.max)}
        </div>
      </div>

      {/* Range Info */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Min</p>
          <p className="font-mono text-lg">{formatPrice(activeRange.min)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Largura</p>
          <p className="font-mono text-lg">
            {pool.currentPrice > 0 ? (((activeRange.max - activeRange.min) / pool.currentPrice) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Max</p>
          <p className="font-mono text-lg">{formatPrice(activeRange.max)}</p>
        </div>
      </div>

      {/* Time in Range Estimate */}
      <div className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-border/50 p-3">
        <span className="text-sm text-muted-foreground">Tempo estimado em range:</span>
        <span className="font-mono text-lg text-success">{pool.metrics.timeInRange}%</span>
      </div>
    </div>
  );
}
