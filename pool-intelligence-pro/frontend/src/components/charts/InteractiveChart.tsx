import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

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
  const svgRef = useRef<SVGSVGElement>(null);
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

  const xToPrice = useCallback((x: number) => {
    const ratio = (x - padding.left) / chartWidth;
    return minPrice + ratio * (maxPrice - minPrice);
  }, [minPrice, maxPrice, chartWidth]);

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

  const handleMouseDown = useCallback((handle: 'lower' | 'upper') => {
    setDragging(handle);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragging || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let newPrice = xToPrice(x);

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

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mouseup', handleMouseUp);
      return () => window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [dragging, handleMouseUp]);

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
    <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
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
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto cursor-crosshair select-none"
        onMouseMove={handleMouseMove}
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

        {/* Lower range handle */}
        <g
          onMouseDown={() => handleMouseDown('lower')}
          onMouseEnter={() => setHoveredHandle('lower')}
          onMouseLeave={() => setHoveredHandle(null)}
          style={{ cursor: 'ew-resize' }}
        >
          <line
            x1={priceToX(rangeLower)}
            x2={priceToX(rangeLower)}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
            strokeWidth={hoveredHandle === 'lower' || dragging === 'lower' ? 3 : 2}
          />
          <rect
            x={priceToX(rangeLower) - 20}
            y={padding.top + chartHeight - 30}
            width={40}
            height={24}
            rx={4}
            fill={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
          />
          <text
            x={priceToX(rangeLower)}
            y={padding.top + chartHeight - 13}
            textAnchor="middle"
            className="fill-white text-xs font-bold"
          >
            MIN
          </text>
          {/* Drag handle circle */}
          <circle
            cx={priceToX(rangeLower)}
            cy={padding.top + chartHeight / 2}
            r={hoveredHandle === 'lower' || dragging === 'lower' ? 10 : 8}
            fill={hoveredHandle === 'lower' || dragging === 'lower' ? '#f59e0b' : '#8b5cf6'}
            stroke="#1f2937"
            strokeWidth={2}
          />
        </g>

        {/* Upper range handle */}
        <g
          onMouseDown={() => handleMouseDown('upper')}
          onMouseEnter={() => setHoveredHandle('upper')}
          onMouseLeave={() => setHoveredHandle(null)}
          style={{ cursor: 'ew-resize' }}
        >
          <line
            x1={priceToX(rangeUpper)}
            x2={priceToX(rangeUpper)}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
            strokeWidth={hoveredHandle === 'upper' || dragging === 'upper' ? 3 : 2}
          />
          <rect
            x={priceToX(rangeUpper) - 20}
            y={padding.top + chartHeight - 30}
            width={40}
            height={24}
            rx={4}
            fill={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
          />
          <text
            x={priceToX(rangeUpper)}
            y={padding.top + chartHeight - 13}
            textAnchor="middle"
            className="fill-white text-xs font-bold"
          >
            MAX
          </text>
          {/* Drag handle circle */}
          <circle
            cx={priceToX(rangeUpper)}
            cy={padding.top + chartHeight / 2}
            r={hoveredHandle === 'upper' || dragging === 'upper' ? 10 : 8}
            fill={hoveredHandle === 'upper' || dragging === 'upper' ? '#f59e0b' : '#8b5cf6'}
            stroke="#1f2937"
            strokeWidth={2}
          />
        </g>

        {/* X-axis labels */}
        <text x={padding.left} y={height - 10} className="fill-dark-400 text-xs">${formatPrice(minPrice)}</text>
        <text x={width - padding.right} y={height - 10} textAnchor="end" className="fill-dark-400 text-xs">${formatPrice(maxPrice)}</text>

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
        Arraste os handles para ajustar
      </div>
    </div>
  );
}
