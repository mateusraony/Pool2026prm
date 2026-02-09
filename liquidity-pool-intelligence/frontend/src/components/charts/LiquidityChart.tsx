import { useRef, useState, useCallback, useEffect } from 'react';
import clsx from 'clsx';

interface LiquidityBar {
  price: number;
  liquidity: number;
}

interface LiquidityChartProps {
  // Dados
  data: LiquidityBar[];
  currentPrice: number;

  // Range atual
  rangeLower: number;
  rangeUpper: number;

  // Callbacks
  onRangeChange: (lower: number, upper: number) => void;

  // Opcionais
  height?: number;
  disabled?: boolean;
}

export default function LiquidityChart({
  data,
  currentPrice,
  rangeLower,
  rangeUpper,
  onRangeChange,
  height = 200,
  disabled = false,
}: LiquidityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState<'lower' | 'upper' | 'range' | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; lowerPrice: number; upperPrice: number } | null>(null);

  // Calcula limites do gráfico
  const prices = data.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  // Encontra a liquidez máxima para escala
  const maxLiquidity = Math.max(...data.map(d => d.liquidity));

  // Converte preço para posição X (0-100%)
  const priceToPercent = useCallback((price: number) => {
    if (priceRange === 0) return 50;
    return ((price - minPrice) / priceRange) * 100;
  }, [minPrice, priceRange]);


  // Posições atuais
  const lowerPercent = priceToPercent(rangeLower);
  const upperPercent = priceToPercent(rangeUpper);
  const currentPricePercent = priceToPercent(currentPrice);

  // Handler para início do drag
  const handleMouseDown = (type: 'lower' | 'upper' | 'range', e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(type);
    setDragStart({
      x: e.clientX,
      lowerPrice: rangeLower,
      upperPrice: rangeUpper,
    });
  };

  // Handler para movimento do mouse
  useEffect(() => {
    if (!isDragging || !dragStart || !containerRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const deltaX = e.clientX - dragStart.x;
      const deltaPercent = (deltaX / rect.width) * 100;
      const deltaPrice = (deltaPercent / 100) * priceRange;

      let newLower = dragStart.lowerPrice;
      let newUpper = dragStart.upperPrice;

      if (isDragging === 'lower') {
        newLower = Math.max(minPrice, Math.min(dragStart.lowerPrice + deltaPrice, dragStart.upperPrice - priceRange * 0.01));
      } else if (isDragging === 'upper') {
        newUpper = Math.min(maxPrice, Math.max(dragStart.upperPrice + deltaPrice, dragStart.lowerPrice + priceRange * 0.01));
      } else if (isDragging === 'range') {
        const rangeWidth = dragStart.upperPrice - dragStart.lowerPrice;
        newLower = dragStart.lowerPrice + deltaPrice;
        newUpper = dragStart.upperPrice + deltaPrice;

        // Limita aos bounds
        if (newLower < minPrice) {
          newLower = minPrice;
          newUpper = minPrice + rangeWidth;
        }
        if (newUpper > maxPrice) {
          newUpper = maxPrice;
          newLower = maxPrice - rangeWidth;
        }
      }

      onRangeChange(newLower, newUpper);
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      setDragStart(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, minPrice, maxPrice, priceRange, onRangeChange]);

  // Verifica se preço atual está no range
  const isCurrentPriceInRange = currentPrice >= rangeLower && currentPrice <= rangeUpper;

  return (
    <div className="select-none">
      {/* Container principal */}
      <div
        ref={containerRef}
        className="relative bg-dark-800 rounded-lg overflow-hidden"
        style={{ height }}
      >
        {/* Barras de liquidez */}
        <div className="absolute inset-0 flex items-end px-1">
          {data.map((bar, index) => {
            const barHeight = maxLiquidity > 0 ? (bar.liquidity / maxLiquidity) * 100 : 0;
            const isInRange = bar.price >= rangeLower && bar.price <= rangeUpper;

            return (
              <div
                key={index}
                className="flex-1 mx-px"
                style={{ height: '100%' }}
              >
                <div
                  className={clsx(
                    'w-full rounded-t transition-colors duration-150',
                    isInRange ? 'bg-primary-500' : 'bg-dark-600'
                  )}
                  style={{
                    height: `${barHeight}%`,
                    marginTop: 'auto',
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Área do range selecionado (overlay) */}
        <div
          className={clsx(
            'absolute top-0 bottom-0 bg-primary-500/20 border-x-2 border-primary-500',
            isDragging === 'range' ? 'cursor-grabbing' : 'cursor-grab'
          )}
          style={{
            left: `${lowerPercent}%`,
            width: `${upperPercent - lowerPercent}%`,
          }}
          onMouseDown={(e) => handleMouseDown('range', e)}
        />

        {/* Handle esquerdo (lower) */}
        <div
          className={clsx(
            'absolute top-0 bottom-0 w-3 -ml-1.5 flex items-center justify-center',
            isDragging === 'lower' ? 'cursor-grabbing' : 'cursor-ew-resize',
            'group'
          )}
          style={{ left: `${lowerPercent}%` }}
          onMouseDown={(e) => handleMouseDown('lower', e)}
        >
          <div className={clsx(
            'w-1 h-16 rounded-full transition-colors',
            isDragging === 'lower' ? 'bg-primary-400' : 'bg-primary-500 group-hover:bg-primary-400'
          )} />
        </div>

        {/* Handle direito (upper) */}
        <div
          className={clsx(
            'absolute top-0 bottom-0 w-3 -ml-1.5 flex items-center justify-center',
            isDragging === 'upper' ? 'cursor-grabbing' : 'cursor-ew-resize',
            'group'
          )}
          style={{ left: `${upperPercent}%` }}
          onMouseDown={(e) => handleMouseDown('upper', e)}
        >
          <div className={clsx(
            'w-1 h-16 rounded-full transition-colors',
            isDragging === 'upper' ? 'bg-primary-400' : 'bg-primary-500 group-hover:bg-primary-400'
          )} />
        </div>

        {/* Linha do preço atual */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none"
          style={{ left: `${currentPricePercent}%` }}
        >
          {/* Tooltip do preço atual */}
          <div className={clsx(
            'absolute -top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap',
            isCurrentPriceInRange ? 'bg-success-500 text-white' : 'bg-dark-600 text-dark-200'
          )}>
            Atual
          </div>
        </div>

        {/* Labels de preço nos handles */}
        <div
          className="absolute -bottom-6 text-xs text-primary-400 font-medium whitespace-nowrap"
          style={{ left: `${lowerPercent}%`, transform: 'translateX(-50%)' }}
        >
          {rangeLower.toFixed(rangeLower < 1 ? 6 : 2)}
        </div>
        <div
          className="absolute -bottom-6 text-xs text-primary-400 font-medium whitespace-nowrap"
          style={{ left: `${upperPercent}%`, transform: 'translateX(-50%)' }}
        >
          {rangeUpper.toFixed(rangeUpper < 1 ? 6 : 2)}
        </div>
      </div>

      {/* Escala de preços */}
      <div className="flex justify-between mt-8 text-xs text-dark-400">
        <span>{minPrice.toFixed(minPrice < 1 ? 6 : 2)}</span>
        <span className="text-white">{currentPrice.toFixed(currentPrice < 1 ? 6 : 2)}</span>
        <span>{maxPrice.toFixed(maxPrice < 1 ? 6 : 2)}</span>
      </div>

      {/* Status do range */}
      <div className="mt-4 text-center">
        {isCurrentPriceInRange ? (
          <span className="text-success-400 text-sm">
            ✓ Preço atual está dentro do range
          </span>
        ) : (
          <span className="text-warning-400 text-sm">
            ⚠ Preço atual está fora do range
          </span>
        )}
      </div>
    </div>
  );
}
