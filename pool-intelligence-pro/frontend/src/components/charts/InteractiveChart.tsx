import { useState, useRef, useCallback, useMemo, useEffect } from 'react';

interface PricePoint {
  price: number;
  liquidity: number;
}

interface InteractiveChartProps {
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  rangeLower: number;
  rangeUpper: number;
  onRangeChange: (lower: number, upper: number) => void;
  token0Symbol: string;
  token1Symbol: string;
}

function generateLiquidityDistribution(currentPrice: number, minPrice: number, maxPrice: number): PricePoint[] {
  const points: PricePoint[] = [];
  const steps = 50;
  const priceStep = (maxPrice - minPrice) / steps;

  for (let i = 0; i <= steps; i++) {
    const price = minPrice + (i * priceStep);
    // Gaussian-like distribution centered around current price
    const distance = Math.abs(price - currentPrice) / currentPrice;
    const liquidity = Math.exp(-distance * distance * 8) * 100;
    points.push({ price, liquidity: Math.max(5, liquidity) });
  }

  return points;
}

export default function InteractiveChart({
  currentPrice,
  minPrice,
  maxPrice,
  rangeLower,
  rangeUpper,
  onRangeChange,
  token0Symbol,
  token1Symbol,
}: InteractiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'lower' | 'upper' | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<'lower' | 'upper' | null>(null);

  const width = 600;
  const height = 300;
  const padding = { top: 20, right: 60, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const liquidityData = useMemo(() =>
    generateLiquidityDistribution(currentPrice, minPrice, maxPrice),
    [currentPrice, minPrice, maxPrice]
  );

  const priceToX = useCallback((price: number) => {
    return padding.left + ((price - minPrice) / (maxPrice - minPrice)) * chartWidth;
  }, [minPrice, maxPrice, chartWidth]);

  const xToPrice = useCallback((clientX: number) => {
    if (!containerRef.current) return currentPrice;
    const rect = containerRef.current.getBoundingClientRect();
    const svgWidth = rect.width;
    const scale = width / svgWidth;
    const x = (clientX - rect.left) * scale;
    const ratio = (x - padding.left) / chartWidth;
    return minPrice + ratio * (maxPrice - minPrice);
  }, [minPrice, maxPrice, chartWidth, currentPrice]);

  const liquidityToY = useCallback((liquidity: number) => {
    const maxLiquidity = Math.max(...liquidityData.map(d => d.liquidity));
    return padding.top + chartHeight - (liquidity / maxLiquidity) * chartHeight;
  }, [liquidityData, chartHeight]);

  // Create path for liquidity area
  const areaPath = useMemo(() => {
    const points = liquidityData.map(d => `${priceToX(d.price)},${liquidityToY(d.liquidity)}`);
    const baseline = `${priceToX(maxPrice)},${padding.top + chartHeight} ${priceToX(minPrice)},${padding.top + chartHeight}`;
    return `M ${points.join(' L ')} L ${baseline} Z`;
  }, [liquidityData, priceToX, liquidityToY, minPrice, maxPrice, chartHeight]);

  // Create path for selected range area
  const selectedAreaPath = useMemo(() => {
    const rangePoints = liquidityData
      .filter(d => d.price >= rangeLower && d.price <= rangeUpper)
      .map(d => `${priceToX(d.price)},${liquidityToY(d.liquidity)}`);

    if (rangePoints.length < 2) return '';

    const baseline = `${priceToX(rangeUpper)},${padding.top + chartHeight} ${priceToX(rangeLower)},${padding.top + chartHeight}`;
    return `M ${rangePoints.join(' L ')} L ${baseline} Z`;
  }, [liquidityData, rangeLower, rangeUpper, priceToX, liquidityToY, chartHeight]);

  const handleStart = useCallback((handle: 'lower' | 'upper', e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(handle);
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!dragging) return;

    let newPrice = xToPrice(clientX);

    // Clamp to valid range
    newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

    if (dragging === 'lower') {
      // Don't let lower go above upper - 1%
      const maxLower = rangeUpper * 0.99;
      newPrice = Math.min(newPrice, maxLower);
      onRangeChange(newPrice, rangeUpper);
    } else {
      // Don't let upper go below lower + 1%
      const minUpper = rangeLower * 1.01;
      newPrice = Math.max(newPrice, minUpper);
      onRangeChange(rangeLower, newPrice);
    }
  }, [dragging, xToPrice, minPrice, maxPrice, rangeLower, rangeUpper, onRangeChange]);

  const handleEnd = useCallback(() => {
    setDragging(null);
  }, []);

  // Global mouse/touch event listeners for smooth dragging
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      handleMove(e.clientX);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };

    const onEnd = () => {
      handleEnd();
    };

    // Add listeners to window for smooth dragging even outside SVG
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);

    // Change cursor while dragging
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, handleMove, handleEnd]);

  const rangePercent = ((rangeUpper - rangeLower) / currentPrice * 100).toFixed(1);
  const inRangePercent = useMemo(() => {
    const rangeWidth = (rangeUpper - rangeLower) / currentPrice;
    return Math.min(98, 70 + rangeWidth * 100).toFixed(0);
  }, [rangeLower, rangeUpper, currentPrice]);

  // Format price for display
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(0);
    if (price >= 1) return price.toFixed(2);
    return price.toFixed(6);
  };

  return (
    <div className="bg-dark-800 rounded-xl p-4 border border-dark-600" ref={containerRef}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          📊 Distribuicao de Liquidez
          <span className="text-xs text-dark-400">({token0Symbol}/{token1Symbol})</span>
        </h3>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-primary-500/30" />
            <span className="text-dark-400">Total</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-primary-500" />
            <span className="text-dark-400">Seu Range</span>
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none touch-none"
        style={{ cursor: dragging ? 'ew-resize' : 'default' }}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(percent => {
          const y = padding.top + (chartHeight * (100 - percent) / 100);
          return (
            <g key={percent}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#374151"
                strokeDasharray="4"
                opacity={0.5}
              />
            </g>
          );
        })}

        {/* Total liquidity area */}
        <path
          d={areaPath}
          fill="url(#liquidityGradient)"
          opacity={0.3}
        />

        {/* Selected range area */}
        <path
          d={selectedAreaPath}
          fill="url(#selectedGradient)"
          opacity={0.8}
        />

        {/* Current price line */}
        <line
          x1={priceToX(currentPrice)}
          x2={priceToX(currentPrice)}
          y1={padding.top}
          y2={padding.top + chartHeight}
          stroke="#10b981"
          strokeWidth={2}
          strokeDasharray="6,4"
        />
        <text
          x={priceToX(currentPrice)}
          y={padding.top - 5}
          textAnchor="middle"
          className="fill-success-400 text-xs font-medium"
        >
          ${formatPrice(currentPrice)}
        </text>

        {/* Lower range handle - bigger touch target */}
        <g
          onMouseDown={(e) => handleStart('lower', e)}
          onTouchStart={(e) => handleStart('lower', e)}
          onMouseEnter={() => setHoveredHandle('lower')}
          onMouseLeave={() => setHoveredHandle(null)}
          style={{ cursor: 'ew-resize' }}
        >
          {/* Invisible larger touch target */}
          <rect
            x={priceToX(rangeLower) - 25}
            y={padding.top}
            width={50}
            height={chartHeight}
            fill="transparent"
          />
          <line
            x1={priceToX(rangeLower)}
            x2={priceToX(rangeLower)}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
            strokeWidth={hoveredHandle === 'lower' || dragging === 'lower' ? 4 : 2}
          />
          <rect
            x={priceToX(rangeLower) - 24}
            y={padding.top + chartHeight - 32}
            width={48}
            height={28}
            rx={6}
            fill={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
            className="drop-shadow-lg"
          />
          <text
            x={priceToX(rangeLower)}
            y={padding.top + chartHeight - 13}
            textAnchor="middle"
            className="fill-white text-xs font-bold pointer-events-none"
          >
            MIN
          </text>
          {/* Drag handle circle */}
          <circle
            cx={priceToX(rangeLower)}
            cy={padding.top + chartHeight / 2}
            r={hoveredHandle === 'lower' || dragging === 'lower' ? 14 : 10}
            fill={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
            stroke="#1f2937"
            strokeWidth={3}
            className="drop-shadow-lg"
          />
          {/* Inner circle */}
          <circle
            cx={priceToX(rangeLower)}
            cy={padding.top + chartHeight / 2}
            r={4}
            fill="#1f2937"
          />
        </g>

        {/* Upper range handle - bigger touch target */}
        <g
          onMouseDown={(e) => handleStart('upper', e)}
          onTouchStart={(e) => handleStart('upper', e)}
          onMouseEnter={() => setHoveredHandle('upper')}
          onMouseLeave={() => setHoveredHandle(null)}
          style={{ cursor: 'ew-resize' }}
        >
          {/* Invisible larger touch target */}
          <rect
            x={priceToX(rangeUpper) - 25}
            y={padding.top}
            width={50}
            height={chartHeight}
            fill="transparent"
          />
          <line
            x1={priceToX(rangeUpper)}
            x2={priceToX(rangeUpper)}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
            strokeWidth={hoveredHandle === 'upper' || dragging === 'upper' ? 4 : 2}
          />
          <rect
            x={priceToX(rangeUpper) - 24}
            y={padding.top + chartHeight - 32}
            width={48}
            height={28}
            rx={6}
            fill={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
            className="drop-shadow-lg"
          />
          <text
            x={priceToX(rangeUpper)}
            y={padding.top + chartHeight - 13}
            textAnchor="middle"
            className="fill-white text-xs font-bold pointer-events-none"
          >
            MAX
          </text>
          {/* Drag handle circle */}
          <circle
            cx={priceToX(rangeUpper)}
            cy={padding.top + chartHeight / 2}
            r={hoveredHandle === 'upper' || dragging === 'upper' ? 14 : 10}
            fill={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
            stroke="#1f2937"
            strokeWidth={3}
            className="drop-shadow-lg"
          />
          {/* Inner circle */}
          <circle
            cx={priceToX(rangeUpper)}
            cy={padding.top + chartHeight / 2}
            r={4}
            fill="#1f2937"
          />
        </g>

        {/* Price labels at handles */}
        <text
          x={priceToX(rangeLower)}
          y={height - 8}
          textAnchor="middle"
          className="fill-primary-400 text-xs font-mono"
        >
          ${formatPrice(rangeLower)}
        </text>
        <text
          x={priceToX(rangeUpper)}
          y={height - 8}
          textAnchor="middle"
          className="fill-primary-400 text-xs font-mono"
        >
          ${formatPrice(rangeUpper)}
        </text>

        {/* X-axis labels (min/max) */}
        <text x={padding.left} y={height - 8} className="fill-dark-400 text-xs">${formatPrice(minPrice)}</text>
        <text x={width - padding.right} y={height - 8} textAnchor="end" className="fill-dark-400 text-xs">${formatPrice(maxPrice)}</text>

        {/* Gradients */}
        <defs>
          <linearGradient id="liquidityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="selectedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
          </linearGradient>
        </defs>
      </svg>

      {/* Range info */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-center">
        <div className="bg-dark-700/50 rounded-lg p-3">
          <div className="text-xs text-dark-400 mb-1">Preco Min</div>
          <div className="font-mono font-bold text-primary-400">${formatPrice(rangeLower)}</div>
        </div>
        <div className="bg-dark-700/50 rounded-lg p-3">
          <div className="text-xs text-dark-400 mb-1">Range Width</div>
          <div className="font-mono font-bold text-warning-400">±{rangePercent}%</div>
        </div>
        <div className="bg-dark-700/50 rounded-lg p-3">
          <div className="text-xs text-dark-400 mb-1">Preco Max</div>
          <div className="font-mono font-bold text-primary-400">${formatPrice(rangeUpper)}</div>
        </div>
      </div>

      <div className="mt-3 text-center text-sm text-dark-400">
        <span className="text-success-400 font-medium">{inRangePercent}%</span> tempo estimado no range
        <span className="mx-2">•</span>
        🖱️ Arraste os handles <span className="text-primary-400">MIN</span> e <span className="text-primary-400">MAX</span> para ajustar
      </div>
    </div>
  );
}
