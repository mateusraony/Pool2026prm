import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface InteractiveRangeChartProps {
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  onRangeChange: (min: number, max: number) => void;
  className?: string;
}

export function InteractiveRangeChart({
  currentPrice,
  minPrice,
  maxPrice,
  onRangeChange,
  className,
}: InteractiveRangeChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'min' | 'max' | null>(null);
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);

  // Sync with external values
  useEffect(() => {
    if (!isDragging) {
      setLocalMin(minPrice);
      setLocalMax(maxPrice);
    }
  }, [minPrice, maxPrice, isDragging]);

  // Chart bounds - 50% above and below current price for context
  const chartBounds = useMemo(() => {
    const spread = currentPrice * 0.5;
    return {
      min: Math.max(0, currentPrice - spread),
      max: currentPrice + spread,
    };
  }, [currentPrice]);

  // Generate mock liquidity distribution
  const liquidityBars = useMemo(() => {
    const bars = [];
    const numBars = 60;
    const rangeWidth = chartBounds.max - chartBounds.min;
    const step = rangeWidth / numBars;
    
    for (let i = 0; i < numBars; i++) {
      const price = chartBounds.min + (i * step);
      const distanceFromCurrent = Math.abs(price - currentPrice);
      const normalizedDistance = distanceFromCurrent / (rangeWidth / 2);
      const height = Math.max(5, 100 - (normalizedDistance * 70) + (Math.random() * 15));
      
      const isInRange = price >= localMin && price <= localMax;
      const isCurrent = Math.abs(price - currentPrice) < step / 2;
      
      bars.push({
        price,
        height,
        isInRange,
        isCurrent,
      });
    }
    return bars;
  }, [currentPrice, chartBounds, localMin, localMax]);

  const formatPrice = (price: number) => {
    if (price < 0.001) return price.toFixed(6);
    if (price < 1) return price.toFixed(4);
    if (price < 100) return price.toFixed(2);
    return price.toFixed(0);
  };

  const getPosition = (price: number) => {
    return ((price - chartBounds.min) / (chartBounds.max - chartBounds.min)) * 100;
  };

  const getPriceFromPosition = (positionPercent: number) => {
    return chartBounds.min + (positionPercent / 100) * (chartBounds.max - chartBounds.min);
  };

  const handleMouseDown = useCallback((type: 'min' | 'max') => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(type);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newPrice = getPriceFromPosition(percent);

    if (isDragging === 'min') {
      const newMin = Math.min(newPrice, localMax - (chartBounds.max - chartBounds.min) * 0.02);
      setLocalMin(Math.max(chartBounds.min, newMin));
    } else {
      const newMax = Math.max(newPrice, localMin + (chartBounds.max - chartBounds.min) * 0.02);
      setLocalMax(Math.min(chartBounds.max, newMax));
    }
  }, [isDragging, localMin, localMax, chartBounds]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onRangeChange(localMin, localMax);
      setIsDragging(null);
    }
  }, [isDragging, localMin, localMax, onRangeChange]);

  // Touch events for mobile
  const handleTouchStart = useCallback((type: 'min' | 'max') => (e: React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(type);
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging || !chartRef.current) return;

    const rect = chartRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newPrice = getPriceFromPosition(percent);

    if (isDragging === 'min') {
      const newMin = Math.min(newPrice, localMax - (chartBounds.max - chartBounds.min) * 0.02);
      setLocalMin(Math.max(chartBounds.min, newMin));
    } else {
      const newMax = Math.max(newPrice, localMin + (chartBounds.max - chartBounds.min) * 0.02);
      setLocalMax(Math.min(chartBounds.max, newMax));
    }
  }, [isDragging, localMin, localMax, chartBounds]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  const rangeWidth = ((localMax - localMin) / currentPrice) * 100;
  const distanceToMin = ((currentPrice - localMin) / currentPrice) * 100;
  const distanceToMax = ((localMax - currentPrice) / currentPrice) * 100;

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Gráfico Interativo de Range</h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Preço atual:</span>
          <span className="font-mono text-primary">{formatPrice(currentPrice)}</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        Arraste as bordas <GripVertical className="inline h-3 w-3" /> para ajustar o range
      </p>

      {/* Chart */}
      <div className="relative h-48 mt-4 select-none" ref={chartRef}>
        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {liquidityBars.map((bar, i) => (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-t transition-colors duration-150',
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
          className="absolute bottom-0 top-0 bg-primary/10 pointer-events-none"
          style={{
            left: `${getPosition(localMin)}%`,
            width: `${getPosition(localMax) - getPosition(localMin)}%`,
          }}
        />

        {/* Min handle */}
        <div
          className={cn(
            'absolute bottom-0 top-0 w-1 cursor-ew-resize transition-all group',
            isDragging === 'min' ? 'bg-primary' : 'bg-primary hover:bg-primary/80'
          )}
          style={{ left: `${getPosition(localMin)}%`, transform: 'translateX(-50%)' }}
          onMouseDown={handleMouseDown('min')}
          onTouchStart={handleTouchStart('min')}
        >
          <div className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 rounded flex items-center justify-center transition-all',
            isDragging === 'min' 
              ? 'bg-primary scale-110' 
              : 'bg-primary/80 group-hover:bg-primary group-hover:scale-105'
          )}>
            <GripVertical className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className={cn(
            'absolute -bottom-8 left-1/2 -translate-x-1/2 rounded bg-primary px-2 py-0.5 text-[10px] font-mono text-primary-foreground whitespace-nowrap transition-opacity',
            isDragging === 'min' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
          )}>
            Min: {formatPrice(localMin)}
          </div>
        </div>

        {/* Max handle */}
        <div
          className={cn(
            'absolute bottom-0 top-0 w-1 cursor-ew-resize transition-all group',
            isDragging === 'max' ? 'bg-primary' : 'bg-primary hover:bg-primary/80'
          )}
          style={{ left: `${getPosition(localMax)}%`, transform: 'translateX(-50%)' }}
          onMouseDown={handleMouseDown('max')}
          onTouchStart={handleTouchStart('max')}
        >
          <div className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-10 rounded flex items-center justify-center transition-all',
            isDragging === 'max' 
              ? 'bg-primary scale-110' 
              : 'bg-primary/80 group-hover:bg-primary group-hover:scale-105'
          )}>
            <GripVertical className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className={cn(
            'absolute -bottom-8 left-1/2 -translate-x-1/2 rounded bg-primary px-2 py-0.5 text-[10px] font-mono text-primary-foreground whitespace-nowrap transition-opacity',
            isDragging === 'max' ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
          )}>
            Max: {formatPrice(localMax)}
          </div>
        </div>

        {/* Current price line */}
        <div
          className="absolute bottom-0 top-0 w-0.5 bg-warning z-10 pointer-events-none"
          style={{ left: `${getPosition(currentPrice)}%` }}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-warning px-2 py-0.5 text-[10px] font-mono text-warning-foreground whitespace-nowrap">
            {formatPrice(currentPrice)}
          </div>
        </div>
      </div>

      {/* Range Info */}
      <div className="mt-10 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Min</p>
          <p className="font-mono text-lg">{formatPrice(localMin)}</p>
          <p className="text-xs text-muted-foreground">-{distanceToMin.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Largura</p>
          <p className="font-mono text-lg">{rangeWidth.toFixed(1)}%</p>
          <p className={cn(
            'text-xs',
            rangeWidth > 30 ? 'text-success' : rangeWidth < 10 ? 'text-destructive' : 'text-warning'
          )}>
            {rangeWidth > 30 ? 'Conservador' : rangeWidth < 10 ? 'Agressivo' : 'Moderado'}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Max</p>
          <p className="font-mono text-lg">{formatPrice(localMax)}</p>
          <p className="text-xs text-muted-foreground">+{distanceToMax.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
