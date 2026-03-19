import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pool } from '@/types/pool';
import { cn } from '@/lib/utils';
import { fetchLiquidityDistribution } from '@/api/client';

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

  // Fetch real liquidity distribution from backend
  const { data: liquidityData } = useQuery({
    queryKey: ['liquidity-distribution', pool.chain, pool.poolAddress],
    queryFn: () => fetchLiquidityDistribution(pool.chain || '', pool.poolAddress || '', 50),
    enabled: !!(pool.chain && pool.poolAddress),
    staleTime: 300000, // 5 min cache
    refetchInterval: 300000,
  });

  const rangeWidth = pool.ranges.defensive.max - pool.ranges.defensive.min;

  // Use real liquidity data from backend, fallback to Gaussian estimate
  const liquidityBars = useMemo(() => {
    if (rangeWidth <= 0) return [];

    // Real data from backend
    if (liquidityData?.bars && liquidityData.bars.length > 0) {
      const viewMin = pool.ranges.defensive.min;
      const viewMax = pool.ranges.defensive.max;
      return liquidityData.bars
        .filter(b => b.price >= viewMin && b.price <= viewMax)
        .map(bar => ({
          price: bar.price,
          height: Math.max(5, bar.liquidity),
          isInRange: bar.price >= activeRange.min && bar.price <= activeRange.max,
          isCurrent: Math.abs(bar.price - pool.currentPrice) < rangeWidth / 50,
        }));
    }

    // Fallback: Gaussian-based distribution (NOT random)
    const bars = [];
    const numBars = 50;
    const step = rangeWidth / numBars;
    const sigma = rangeWidth * 0.25;

    for (let i = 0; i < numBars; i++) {
      const price = pool.ranges.defensive.min + (i + 0.5) * step;
      const z = (price - pool.currentPrice) / sigma;
      const gaussian = Math.exp(-0.5 * z * z);
      // Deterministic noise based on price (no Math.random)
      const seed = Math.sin(price * 12345.6789) * 0.5 + 0.5;
      const noise = 1 + (seed - 0.5) * 0.2;
      const height = Math.max(5, gaussian * noise * 100);

      const isInRange = price >= activeRange.min && price <= activeRange.max;
      const isCurrent = Math.abs(price - pool.currentPrice) < step;

      bars.push({ price, height, isInRange, isCurrent });
    }
    return bars;
  }, [pool, activeRange, rangeWidth, liquidityData]);

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
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Distribuicao de Liquidez & Range</h3>
          {liquidityData ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">LIVE</span>
          ) : (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono cursor-help"
              title="Distribuição estimada — dados de liquidez por tick não disponíveis para este pool"
            >
              Est.
            </span>
          )}
        </div>
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
