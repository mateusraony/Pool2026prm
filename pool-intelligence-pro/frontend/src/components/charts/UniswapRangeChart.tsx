import { useState, useRef, useMemo, useEffect, useCallback, useId } from 'react';
import { cn } from '@/lib/utils';

/* ──────────────────────────────────────────────
   Types
   ────────────────────────────────────────────── */

interface PricePoint {
  timestamp: number;
  price: number;
}

interface VolumePoint {
  timestamp: number;
  volume: number;
}

interface LiquidityTick {
  price: number;
  liquidity: number;
}

export interface UniswapRangeChartProps {
  /** Price history (close prices over time) */
  priceHistory?: PricePoint[];
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  /** Callback when user drags range handles */
  onRangeChange?: (lower: number, upper: number) => void;
  /** Real liquidity distribution from API */
  liquidityData?: LiquidityTick[];
  /** Volume data from OHLCV candles */
  volumeData?: VolumePoint[];
  /** Estimated time in range (0-100) */
  timeInRange?: number;
  /** Chart body height in px (default 300) */
  height?: number;
  /** Accent color (default #FF37C7) */
  accentColor?: string;
  className?: string;
}

/* ──────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────── */

const PAD_TOP = 12;
const PAD_BOTTOM = 12;
const SCROLLBAR_W = 16;
const HANDLE_R = 6;
const TIME_AXIS_H = 22;
const VOLUME_H = 60;

/* ──────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────── */

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${(p / 1000).toFixed(1)}K`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.0001) return `$${p.toFixed(6)}`;
  return `$${p.toExponential(2)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });
}

function generateLiquidity(currentPrice: number, pMin: number, pMax: number, count = 20): LiquidityTick[] {
  const ticks: LiquidityTick[] = [];
  const safePrice = currentPrice > 0 ? currentPrice : 1;
  const safePMin = pMin;
  const safePMax = pMax > pMin ? pMax : pMin + safePrice * 0.3;
  const step = (safePMax - safePMin) / count;
  if (step <= 0) return [];
  for (let i = 0; i <= count; i++) {
    const price = safePMin + i * step;
    const dist = Math.abs(price - safePrice) / safePrice;
    const liq = Math.max(5, Math.exp(-dist * dist * 6) * 100 + Math.abs(Math.sin(price * 12345.6789)) * 15);
    ticks.push({ price, liquidity: liq });
  }
  return ticks;
}

/** Generate a synthetic price line when real OHLCV data is unavailable.
 *  Uses deterministic pseudo-random walk so every pool gets a consistent line. */
function generateSyntheticPriceHistory(
  currentPrice: number,
  rangeLower: number,
  rangeUpper: number,
  points = 120,
): PricePoint[] {
  const safePrice = currentPrice > 0 ? currentPrice : 1;
  const now = Date.now();
  const span = 7 * 24 * 60 * 60 * 1000; // 7 days
  const step = span / points;
  const rangeSpan = rangeUpper > rangeLower ? rangeUpper - rangeLower : safePrice * 0.2;
  const volatility = rangeSpan / safePrice * 0.3;
  const history: PricePoint[] = [];

  // Seed-based deterministic pseudo-random
  let seed = Math.abs(Math.round(safePrice * 100000)) % 2147483647;
  if (seed === 0) seed = 42;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  let price = safePrice * (1 + (rand() - 0.5) * volatility * 2);
  for (let i = 0; i < points; i++) {
    const t = now - span + i * step;
    // Random walk with mean reversion toward safePrice
    const drift = (safePrice - price) * 0.02;
    const shock = (rand() - 0.5) * safePrice * volatility * 0.15;
    price = Math.max(safePrice * 0.5, price + drift + shock);
    history.push({ timestamp: t, price });
  }
  // Ensure last point = safePrice
  history.push({ timestamp: now, price: safePrice });
  return history;
}

/* ──────────────────────────────────────────────
   Component
   ────────────────────────────────────────────── */

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export function UniswapRangeChart({
  priceHistory = [],
  currentPrice,
  rangeLower,
  rangeUpper,
  onRangeChange,
  liquidityData,
  volumeData,
  timeInRange,
  height = 300,
  accentColor = '#FF37C7',
  className,
}: UniswapRangeChartProps) {
  const uid = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(700);
  const [drag, setDrag] = useState<'min' | 'max' | 'range' | null>(null);
  const dragRef = useRef({ startY: 0, startLower: 0, startUpper: 0 });

  // ── Responsive width ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Layout ──
  const chartW = width * 0.84;
  const liqX = chartW;
  const liqW = width - chartW - SCROLLBAR_W;
  const scrollX = width - SCROLLBAR_W;
  const bodyH = height;

  // ── Effective price history (real or synthetic fallback) ──
  const effectiveHistory = useMemo(() => {
    if (priceHistory.length >= 2) return priceHistory;
    return generateSyntheticPriceHistory(currentPrice, rangeLower, rangeUpper);
  }, [priceHistory, currentPrice, rangeLower, rangeUpper]);

  // ── Price scale ──
  const { pMin, pMax } = useMemo(() => {
    const safePrice = currentPrice > 0 ? currentPrice : 1;
    const prices = effectiveHistory.map((p) => p.price);
    if (prices.length === 0) {
      const spread = safePrice * 0.3;
      return { pMin: safePrice - spread, pMax: safePrice + spread };
    }
    const lo = Math.min(...prices, rangeLower, safePrice);
    const hi = Math.max(...prices, rangeUpper, safePrice);
    const pad = Math.max((hi - lo) * 0.08, safePrice * 0.001); // minimum padding to prevent pMin===pMax
    return { pMin: lo - pad, pMax: hi + pad };
  }, [effectiveHistory, rangeLower, rangeUpper, currentPrice]);

  const priceToY = useCallback(
    (p: number) => {
      const range = pMax - pMin;
      if (range <= 0) return bodyH / 2; // fallback center if degenerate scale
      return PAD_TOP + ((pMax - p) / range) * (bodyH - PAD_TOP - PAD_BOTTOM);
    },
    [pMin, pMax, bodyH],
  );

  const yToPrice = useCallback(
    (y: number) => {
      const range = pMax - pMin;
      if (range <= 0) return pMax;
      return pMax - ((y - PAD_TOP) / (bodyH - PAD_TOP - PAD_BOTTOM)) * range;
    },
    [pMin, pMax, bodyH],
  );

  // ── Time scale ──
  const { tMin, tMax } = useMemo(() => {
    if (effectiveHistory.length === 0) return { tMin: 0, tMax: 1 };
    return { tMin: effectiveHistory[0].timestamp, tMax: effectiveHistory[effectiveHistory.length - 1].timestamp };
  }, [effectiveHistory]);

  const timeToX = useCallback(
    (t: number) => ((t - tMin) / (tMax - tMin || 1)) * chartW,
    [tMin, tMax, chartW],
  );

  // ── Price path ──
  const pricePath = useMemo(() => {
    if (effectiveHistory.length < 2) return '';
    return effectiveHistory
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${timeToX(p.timestamp).toFixed(1)},${priceToY(p.price).toFixed(1)}`)
      .join('');
  }, [effectiveHistory, timeToX, priceToY]);

  // ── Liquidity bars ──
  const liqBars = useMemo(() => {
    const data = liquidityData && liquidityData.length > 0 ? liquidityData : generateLiquidity(currentPrice, pMin, pMax);
    const maxLiq = Math.max(...data.map((d) => d.liquidity), 1);
    const barCount = data.length;
    const barH = barCount > 0 ? Math.max(4, (bodyH - PAD_TOP - PAD_BOTTOM) / barCount - 1) : 10;

    return data.map((d) => {
      const y = priceToY(d.price) - barH / 2;
      const w = (d.liquidity / maxLiq) * liqW;
      const inRange = d.price >= rangeLower && d.price <= rangeUpper;
      return { y, w, barH, inRange };
    });
  }, [liquidityData, currentPrice, pMin, pMax, rangeLower, rangeUpper, priceToY, bodyH, liqW]);

  // ── Volume bars ──
  const volBars = useMemo(() => {
    if (!volumeData || volumeData.length < 2) return [];
    const maxVol = Math.max(...volumeData.map((d) => d.volume), 1);
    const barW = chartW / volumeData.length;
    return volumeData.map((d, i) => {
      const barHeight = (d.volume / maxVol) * (VOLUME_H - 8);
      return { x: i * barW, w: Math.max(1, barW - 1), h: barHeight, vol: d.volume };
    });
  }, [volumeData, chartW]);

  const hasVolume = volBars.length > 0;
  const totalSvgH = bodyH + (hasVolume ? VOLUME_H : 0);

  // ── Range positions ──
  const rangeTopY = priceToY(rangeUpper);
  const rangeBotY = priceToY(rangeLower);
  const rangeH = rangeBotY - rangeTopY;
  const curY = priceToY(currentPrice);
  const centerY = (rangeTopY + rangeBotY) / 2;

  // ── Time labels ──
  const timeLabels = useMemo(() => {
    if (effectiveHistory.length < 4) return [];
    const count = Math.min(5, Math.floor(chartW / 120));
    const labels: { x: number; text: string }[] = [];
    for (let i = 1; i <= count; i++) {
      const idx = Math.floor((i / (count + 1)) * (effectiveHistory.length - 1));
      const p = effectiveHistory[idx];
      labels.push({ x: timeToX(p.timestamp), text: formatDate(p.timestamp) });
    }
    return labels;
  }, [effectiveHistory, chartW, timeToX]);

  // ── Drag handlers ──
  const startDrag = useCallback(
    (type: 'min' | 'max' | 'range', e: React.MouseEvent | React.TouchEvent) => {
      if (!onRangeChange) return;
      e.preventDefault();
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      dragRef.current = { startY: clientY, startLower: rangeLower, startUpper: rangeUpper };
      setDrag(type);
    },
    [onRangeChange, rangeLower, rangeUpper],
  );

  useEffect(() => {
    if (!drag || !onRangeChange) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dy = clientY - dragRef.current.startY;
      // Y is inverted (up = higher price)
      const dp = -(dy / (bodyH - PAD_TOP - PAD_BOTTOM)) * (pMax - pMin);
      const minSpread = (pMax - pMin) * 0.02;

      if (drag === 'max') {
        const newUpper = clamp(dragRef.current.startUpper + dp, dragRef.current.startLower + minSpread, pMax);
        onRangeChange(dragRef.current.startLower, newUpper);
      } else if (drag === 'min') {
        const newLower = clamp(dragRef.current.startLower + dp, pMin, dragRef.current.startUpper - minSpread);
        onRangeChange(newLower, dragRef.current.startUpper);
      } else {
        // range drag
        const span = dragRef.current.startUpper - dragRef.current.startLower;
        let newLower = dragRef.current.startLower + dp;
        let newUpper = dragRef.current.startUpper + dp;
        if (newLower < pMin) { newLower = pMin; newUpper = pMin + span; }
        if (newUpper > pMax) { newUpper = pMax; newLower = pMax - span; }
        onRangeChange(newLower, newUpper);
      }
    };

    const onUp = () => setDrag(null);

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [drag, onRangeChange, bodyH, pMax, pMin]);

  // ── Render ──
  const hasPriceData = pricePath.length > 0;
  const maskId = `rm-${uid}`;
  const interactive = !!onRangeChange;

  return (
    <div ref={containerRef} className={cn('select-none', className)}>
      <svg width="100%" height={totalSvgH} style={{ touchAction: 'manipulation' }}>
        {/* ── Defs ── */}
        <defs>
          <mask id={maskId}>
            <rect x={0} y={rangeTopY} width={chartW} height={rangeH} fill="white" />
          </mask>
        </defs>

        {/* ── Price line (base — dimmed) ── */}
        {hasPriceData && (
          <path d={pricePath} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
        )}

        {/* ── Price line (active — accent in-range) ── */}
        {hasPriceData && (
          <path d={pricePath} fill="none" stroke={accentColor} strokeWidth={2} mask={`url(#${maskId})`} />
        )}

        {/* ── Liquidity bars ── */}
        {liqBars.map((b, i) => (
          <rect
            key={i}
            x={liqX + liqW - b.w}
            y={b.y}
            width={b.w}
            height={b.barH}
            rx={1}
            fill={b.inRange ? accentColor : '#FFFFFF'}
            opacity={b.inRange ? 0.5 : 0.15}
          />
        ))}

        {/* ── Range area overlay ── */}
        <rect x={0} y={rangeTopY} width={width} height={rangeH} fill={accentColor} opacity={0.15} style={{ pointerEvents: 'none' }} />

        {/* ── Interactive range bg (for drag-move) ── */}
        {interactive && (
          <rect
            x={0}
            y={rangeTopY}
            width={chartW}
            height={rangeH}
            fill="transparent"
            cursor="move"
            onMouseDown={(e) => startDrag('range', e)}
            onTouchStart={(e) => startDrag('range', e)}
          />
        )}

        {/* ── Min/Max boundary lines ── */}
        <line x1={0} x2={width} y1={rangeTopY} y2={rangeTopY} stroke={accentColor} strokeWidth={2} opacity={0.85} />
        <line x1={0} x2={width} y1={rangeBotY} y2={rangeBotY} stroke={accentColor} strokeWidth={2} opacity={0.85} />

        {/* ── Range price labels on left edge of chart ── */}
        <text
          x={8}
          y={rangeTopY - 4}
          textAnchor="start"
          style={{ fill: accentColor, fontSize: 10, fontFamily: 'monospace', pointerEvents: 'none' }}
        >
          {formatPrice(rangeUpper)}
        </text>
        <text
          x={8}
          y={rangeBotY + 12}
          textAnchor="start"
          style={{ fill: accentColor, fontSize: 10, fontFamily: 'monospace', pointerEvents: 'none' }}
        >
          {formatPrice(rangeLower)}
        </text>

        {/* ── Invisible drag targets for min/max ── */}
        {interactive && (
          <>
            <line
              x1={0} x2={width} y1={rangeTopY} y2={rangeTopY}
              stroke="transparent" strokeWidth={24} cursor="ns-resize"
              onMouseDown={(e) => startDrag('max', e)}
              onTouchStart={(e) => startDrag('max', e)}
            />
            <line
              x1={0} x2={width} y1={rangeBotY} y2={rangeBotY}
              stroke="transparent" strokeWidth={24} cursor="ns-resize"
              onMouseDown={(e) => startDrag('min', e)}
              onTouchStart={(e) => startDrag('min', e)}
            />
          </>
        )}

        {/* ── Scrollbar track ── */}
        <rect x={scrollX} y={0} width={SCROLLBAR_W} height={bodyH} fill="rgba(255,255,255,0.08)" rx={4} />

        {/* ── Scrollbar thumb (range indicator) ── */}
        <rect
          x={scrollX}
          y={rangeTopY}
          width={SCROLLBAR_W}
          height={rangeH}
          fill={accentColor}
          rx={8}
          opacity={0.85}
          cursor={interactive ? 'move' : 'default'}
          onMouseDown={interactive ? (e) => startDrag('range', e) : undefined}
          onTouchStart={interactive ? (e) => startDrag('range', e) : undefined}
        />

        {/* ── Max handle (top circle) ── */}
        <circle
          cx={scrollX + SCROLLBAR_W / 2}
          cy={rangeTopY + HANDLE_R + 2}
          r={HANDLE_R}
          fill="white"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={1}
          cursor={interactive ? 'ns-resize' : 'default'}
          style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }}
          onMouseDown={interactive ? (e) => startDrag('max', e) : undefined}
          onTouchStart={interactive ? (e) => startDrag('max', e) : undefined}
        />

        {/* ── Min handle (bottom circle) ── */}
        <circle
          cx={scrollX + SCROLLBAR_W / 2}
          cy={rangeBotY - HANDLE_R - 2}
          r={HANDLE_R}
          fill="white"
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={1}
          cursor={interactive ? 'ns-resize' : 'default'}
          style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }}
          onMouseDown={interactive ? (e) => startDrag('min', e) : undefined}
          onTouchStart={interactive ? (e) => startDrag('min', e) : undefined}
        />

        {/* ── Center grip handle ── */}
        <rect
          x={scrollX + 2}
          y={centerY - 3}
          width={SCROLLBAR_W - 4}
          height={6}
          fill="white"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={0.5}
          rx={2}
          cursor={interactive ? 'move' : 'default'}
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
          onMouseDown={interactive ? (e) => startDrag('range', e) : undefined}
          onTouchStart={interactive ? (e) => startDrag('range', e) : undefined}
        />
        {/* grip lines */}
        {[-1.25, 0, 1.25].map((off) => (
          <rect
            key={off}
            x={scrollX + SCROLLBAR_W / 2 + off - 0.25}
            y={centerY - 1.5}
            width={0.5}
            height={3}
            fill="rgba(0,0,0,0.25)"
            style={{ pointerEvents: 'none' }}
          />
        ))}

        {/* ── Current price line ── */}
        <line
          x1={0}
          x2={width - SCROLLBAR_W}
          y1={curY}
          y2={curY}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="0,6"
          opacity={0.7}
        />

        {/* ── Current price dot ── */}
        <circle cx={chartW} cy={curY} r={4} fill={accentColor} />

        {/* ── Price labels (right side of scrollbar) ── */}
        <text x={scrollX - 4} y={rangeTopY - 4} textAnchor="end" style={{ fill: accentColor, fontSize: 10, fontFamily: 'monospace' }}>
          {formatPrice(rangeUpper)}
        </text>
        <text x={scrollX - 4} y={rangeBotY + 12} textAnchor="end" style={{ fill: accentColor, fontSize: 10, fontFamily: 'monospace' }}>
          {formatPrice(rangeLower)}
        </text>
        <text x={4} y={curY - 6} textAnchor="start" style={{ fill: 'rgba(255,255,255,0.65)', fontSize: 10, fontFamily: 'monospace' }}>
          {formatPrice(currentPrice)}
        </text>

        {/* ── Volume bars ── */}
        {hasVolume && (
          <g>
            {/* Separator line between price and volume */}
            <line x1={0} x2={chartW} y1={bodyH} y2={bodyH} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
            {/* Volume label */}
            <text x={4} y={bodyH + 12} style={{ fill: 'rgba(255,255,255,0.35)', fontSize: 9, fontFamily: 'monospace' }}>
              Vol
            </text>
            {/* Volume bars */}
            {volBars.map((b, i) => (
              <rect
                key={i}
                x={b.x}
                y={bodyH + VOLUME_H - 4 - b.h}
                width={b.w}
                height={b.h}
                rx={0.5}
                fill={accentColor}
                opacity={0.4}
              />
            ))}
            {/* Max volume label */}
            {volumeData && volumeData.length > 0 && (
              <text x={chartW - 4} y={bodyH + 12} textAnchor="end" style={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'monospace' }}>
                {formatVolume(Math.max(...volumeData.map(d => d.volume)))}
              </text>
            )}
          </g>
        )}
      </svg>

      {/* ── Time axis ── */}
      {timeLabels.length > 0 && (
        <svg width="100%" height={TIME_AXIS_H}>
          {timeLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={14}
              textAnchor="middle"
              style={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'sans-serif' }}
            >
              {l.text}
            </text>
          ))}
        </svg>
      )}

      {/* ── Info cards ── */}
      <div className="mt-3 grid grid-cols-5 gap-2 text-center">
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">Preco Atual</div>
          <div className="font-mono font-bold text-xs">{formatPrice(currentPrice)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">Preco Min</div>
          <div className="font-mono font-bold text-xs" style={{ color: accentColor }}>{formatPrice(rangeLower)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">Preco Max</div>
          <div className="font-mono font-bold text-xs" style={{ color: accentColor }}>{formatPrice(rangeUpper)}</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">Range Width</div>
          <div className="font-mono font-bold text-xs text-warning-400">
            ±{(currentPrice > 0 ? (rangeUpper - rangeLower) / currentPrice * 50 : 0).toFixed(1)}%
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">No Range</div>
          <div className="font-mono font-bold text-xs text-success-400">
            {timeInRange != null ? `${timeInRange}%` : '—'}
          </div>
        </div>
      </div>
      <div className="mt-1.5 text-center text-[10px] text-muted-foreground/60">
        🖱️ Arraste os handles para ajustar o range
      </div>
    </div>
  );
}

export default UniswapRangeChart;
