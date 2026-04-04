/**
 * CandlestickChart — ETAPA 15
 * Gráfico de velas (OHLC) + volume com Recharts ComposedChart.
 * Candles renderizadas como shapes SVG customizados.
 */

import { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// TYPES
// ============================================================

export interface OhlcvCandle {
  timestamp: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = 'hour' | 'day';

interface ChartEntry {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  // campos derivados para recharts
  bodyLow: number;   // min(open, close)
  bodyHigh: number;  // max(open, close)
  bodySize: number;  // |close - open|
  isUp: boolean;
  // Para wicks: usa bar de low→high (preenchido transparente)
  wickRange: number; // high - low
}

// ============================================================
// CUSTOM CANDLE SHAPE
// Renderiza o corpo (open-close) + pavio (high-low) de cada vela
// ============================================================

interface CandleShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: ChartEntry;
  yAxis?: { scale?: (v: number) => number };
  background?: { height?: number };
}

function CandleShape(props: CandleShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload, yAxis } = props;
  if (!payload || !yAxis?.scale) return null;

  const scale = yAxis.scale;
  const cx = x + width / 2;
  const bodyW = Math.max(width * 0.7, 2);
  const bodyX = cx - bodyW / 2;

  const highY = scale(payload.high);
  const lowY = scale(payload.low);
  const openY = scale(payload.open);
  const closeY = scale(payload.close);

  const bodyTop = Math.min(openY, closeY);
  const bodyBot = Math.max(openY, closeY);
  const bodyH = Math.max(bodyBot - bodyTop, 1);

  const color = payload.isUp ? '#10B981' : '#EF4444'; // green / red

  return (
    <g>
      {/* Pavio (wick) */}
      <line
        x1={cx} y1={highY}
        x2={cx} y2={lowY}
        stroke={color}
        strokeWidth={1.5}
      />
      {/* Corpo (body) */}
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyW}
        height={bodyH}
        fill={payload.isUp ? color : color}
        fillOpacity={payload.isUp ? 0.9 : 0.85}
        stroke={color}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
}

// ============================================================
// CUSTOM TOOLTIP
// ============================================================

interface TooltipEntry {
  payload?: ChartEntry;
}

function OhlcvTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const fmtPrice = (v: number) => v >= 1000
    ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : v >= 1
    ? `$${v.toFixed(4)}`
    : `$${v.toFixed(8)}`;

  const fmtVol = (v: number) => v >= 1e6
    ? `$${(v / 1e6).toFixed(2)}M`
    : v >= 1e3
    ? `$${(v / 1e3).toFixed(1)}K`
    : `$${v.toFixed(0)}`;

  const changePercent = d.open > 0 ? ((d.close - d.open) / d.open) * 100 : 0;
  const change = changePercent;
  const isUp = d.close >= d.open;

  return (
    <div className="glass-card p-3 text-xs space-y-1.5 border border-border min-w-[160px]">
      <p className="text-muted-foreground font-medium">{label}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-muted-foreground">Abertura</span>
        <span className="text-right">{fmtPrice(d.open)}</span>
        <span className="text-muted-foreground">Máxima</span>
        <span className="text-right text-green-400">{fmtPrice(d.high)}</span>
        <span className="text-muted-foreground">Mínima</span>
        <span className="text-right text-red-400">{fmtPrice(d.low)}</span>
        <span className="text-muted-foreground">Fechamento</span>
        <span className={cn('text-right font-semibold', isUp ? 'text-green-400' : 'text-red-400')}>
          {fmtPrice(d.close)}
        </span>
        <span className="text-muted-foreground">Variação</span>
        <span className={cn('text-right', isUp ? 'text-green-400' : 'text-red-400')}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </span>
        <span className="text-muted-foreground">Volume</span>
        <span className="text-right text-blue-400">{fmtVol(d.volume)}</span>
      </div>
    </div>
  );
}

// ============================================================
// PRICE STATS BAR
// ============================================================

function PriceStats({ candles }: { candles: OhlcvCandle[] }) {
  if (candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const first = candles[0];
  const high = Math.max(...candles.map(c => c.high));
  const low = Math.min(...candles.map(c => c.low));
  const change = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0;
  const isUp = change >= 0;

  const fmt = (v: number) => v >= 1000
    ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    : v >= 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(8)}`;

  return (
    <div className="flex flex-wrap items-center gap-4 px-1 pb-2 text-xs">
      <div className="flex items-center gap-1.5">
        {isUp ? <TrendingUp className="w-3.5 h-3.5 text-green-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
        <span className={cn('font-semibold', isUp ? 'text-green-400' : 'text-red-400')}>
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>
      <span className="text-muted-foreground">Atual: <span className="text-foreground">{fmt(last.close)}</span></span>
      <span className="text-muted-foreground">Máx: <span className="text-green-400">{fmt(high)}</span></span>
      <span className="text-muted-foreground">Mín: <span className="text-red-400">{fmt(low)}</span></span>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export interface CandlestickChartProps {
  candles?: OhlcvCandle[] | null;
  loading?: boolean;
  error?: string | null;
  timeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
  height?: number;
  title?: string;
  currentPrice?: number;
}

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string; desc: string }[] = [
  { value: 'hour', label: '1H', desc: '7 dias (hourly)' },
  { value: 'day',  label: '1D', desc: '90 dias (daily)' },
];

export function CandlestickChart({
  candles,
  loading = false,
  error = null,
  timeframe = 'hour',
  onTimeframeChange,
  height = 340,
  title = 'Histórico de Preço',
  currentPrice,
}: CandlestickChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const data: ChartEntry[] = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return candles.map(c => ({
      time: new Date(c.timestamp).toLocaleString('pt-BR', {
        month: 'short',
        day: '2-digit',
        hour: timeframe === 'hour' ? '2-digit' : undefined,
        minute: timeframe === 'hour' ? '2-digit' : undefined,
      }),
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      bodyLow: Math.min(c.open, c.close),
      bodyHigh: Math.max(c.open, c.close),
      bodySize: Math.abs(c.close - c.open),
      wickRange: c.high - c.low,
      isUp: c.close >= c.open,
    }));
  }, [candles, timeframe]);

  // Domínio do eixo Y com padding de 5%
  const [yMin, yMax] = useMemo(() => {
    if (data.length === 0) return [0, 1];
    const allLows = data.map(d => d.low);
    const allHighs = data.map(d => d.high);
    const mn = Math.min(...allLows);
    const mx = Math.max(...allHighs);
    const pad = (mx - mn) * 0.05;
    return [mn - pad, mx + pad];
  }, [data]);

  const xTickInterval = useMemo(() => {
    if (data.length <= 24) return 0;
    if (data.length <= 72) return Math.floor(data.length / 12);
    return Math.floor(data.length / 8);
  }, [data]);

  const fmtY = (v: number) => v >= 1000
    ? `$${(v / 1000).toFixed(1)}K`
    : v >= 1
    ? `$${v.toFixed(2)}`
    : `$${v.toFixed(6)}`;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Carregando histórico de preços...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <Minus className="w-6 h-6 opacity-40" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!candles || candles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
        <TrendingUp className="w-8 h-8 opacity-30" />
        <p className="text-sm">Histórico não disponível para esta pool</p>
        <p className="text-xs opacity-60">GeckoTerminal não indexou OHLCV ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{data.length} velas · USD</p>
        </div>
        {/* Timeframe selector */}
        {onTimeframeChange && (
          <div className="flex gap-1">
            {TIMEFRAME_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                size="sm"
                variant={timeframe === opt.value ? 'default' : 'outline'}
                onClick={() => onTimeframeChange(opt.value)}
                className="h-7 px-2.5 text-xs"
                title={opt.desc}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <PriceStats candles={candles} />

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
          onMouseLeave={() => setHovered(null)}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={xTickInterval}
            height={28}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={fmtY}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={68}
            orientation="right"
          />
          <Tooltip
            content={<OhlcvTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
          />
          {/* Linha do preço atual */}
          {currentPrice && (
            <ReferenceLine
              y={currentPrice}
              stroke="hsl(var(--primary))"
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{
                value: fmtY(currentPrice),
                position: 'insideTopRight',
                fill: 'hsl(var(--primary))',
                fontSize: 10,
              }}
            />
          )}
          {/* Velas — renderizadas como custom shapes */}
          <Bar
            dataKey="bodyHigh"
            shape={<CandleShape />}
            isAnimationActive={false}
            minPointSize={1}
          >
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.isUp ? '#10B981' : '#EF4444'}
                opacity={hovered === entry.time ? 1 : 0.85}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>

      {/* Volume mini-chart */}
      <div className="mt-1">
        <p className="text-[10px] text-muted-foreground mb-1 px-1">Volume</p>
        <ResponsiveContainer width="100%" height={52}>
          <ComposedChart data={data} margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
            <XAxis dataKey="time" hide />
            <YAxis hide />
            <Bar dataKey="volume" isAnimationActive={false} radius={[1, 1, 0, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.isUp ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
