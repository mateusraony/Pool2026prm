import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Activity, BarChart3 } from 'lucide-react';
import type { DeepAnalysisData } from '@/api/client';

// --- IndicatorBar ---
// Barra de progresso reutilizável com zonas de cor

interface IndicatorBarProps {
  value: number;
  min?: number;
  max?: number;
  zones?: { threshold: number; color: string }[];
  className?: string;
  showValue?: boolean;
  label?: string;
}

export function IndicatorBar({
  value,
  min = 0,
  max = 100,
  zones = [
    { threshold: 30, color: 'bg-red-500' },
    { threshold: 70, color: 'bg-yellow-500' },
    { threshold: 100, color: 'bg-green-500' },
  ],
  className,
  showValue = true,
  label,
}: IndicatorBarProps) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = ((clamped - min) / (max - min)) * 100;

  // Determina cor baseada nas zonas
  let barColor = zones[zones.length - 1]?.color ?? 'bg-primary';
  for (const zone of zones) {
    if (clamped <= zone.threshold) {
      barColor = zone.color;
      break;
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="text-muted-foreground">{label}</span>}
          {showValue && <span className="font-mono font-medium">{clamped.toFixed(1)}</span>}
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// --- SignalBadge ---
// Badge colorido para sinais bullish/bearish/neutral

interface SignalBadgeProps {
  signal: string;
  className?: string;
}

const signalStyles: Record<string, { bg: string; text: string; label: string }> = {
  bullish: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Bullish' },
  bullish_cross: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Bullish Cross' },
  bearish: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Bearish' },
  bearish_cross: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Bearish Cross' },
  neutral: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Neutro' },
  oversold: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'Sobrevendido' },
  overbought: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Sobrecomprado' },
  none: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Nenhum' },
};

export function SignalBadge({ signal, className }: SignalBadgeProps) {
  const style = signalStyles[signal] ?? signalStyles.neutral;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        style.bg,
        style.text,
        className
      )}
    >
      {style.label}
    </span>
  );
}

// --- RsiSection ---

interface RsiSectionProps {
  rsi: DeepAnalysisData['rsi'];
}

export function RsiSection({ rsi }: RsiSectionProps) {
  const interpretation =
    rsi.signal === 'oversold'
      ? 'Ativo sobrevendido — possivel reversao de alta'
      : rsi.signal === 'overbought'
        ? 'Ativo sobrecomprado — possivel correcao'
        : 'RSI em zona neutra — sem sinal claro';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-primary" />
          RSI ({rsi.periods})
        </h4>
        <SignalBadge signal={rsi.signal} />
      </div>
      <IndicatorBar
        value={rsi.value}
        min={0}
        max={100}
        zones={[
          { threshold: 30, color: 'bg-green-500' },
          { threshold: 70, color: 'bg-yellow-500' },
          { threshold: 100, color: 'bg-red-500' },
        ]}
      />
      <p className="text-xs text-muted-foreground">{interpretation}</p>
    </div>
  );
}

// --- MacdSection ---

interface MacdSectionProps {
  macd: DeepAnalysisData['macd'];
}

export function MacdSection({ macd }: MacdSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          MACD
        </h4>
        <SignalBadge signal={macd.signal} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Linha MACD</p>
          <p className={cn('font-mono text-sm font-medium', macd.macdLine >= 0 ? 'text-green-400' : 'text-red-400')}>
            {macd.macdLine.toFixed(4)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sinal</p>
          <p className="font-mono text-sm font-medium">{macd.signalLine.toFixed(4)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Histograma</p>
          <p className={cn('font-mono text-sm font-medium', macd.histogram >= 0 ? 'text-green-400' : 'text-red-400')}>
            {macd.histogram.toFixed(4)}
          </p>
        </div>
      </div>
      {macd.crossover !== 'none' && (
        <div className="flex items-center gap-1.5 text-xs rounded-md bg-primary/5 px-2.5 py-1.5 border border-primary/20">
          <AlertTriangle className="h-3 w-3 text-primary" />
          <span>
            Cruzamento detectado: <strong className="capitalize">{macd.crossover === 'bullish_cross' ? 'Alta' : 'Baixa'}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// --- BollingerSection ---

interface BollingerSectionProps {
  bollinger: DeepAnalysisData['bollinger'];
}

export function BollingerSection({ bollinger }: BollingerSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Bollinger Bands</h4>
        <Badge variant="outline" className="text-[10px] font-mono">
          BW: {(bollinger.bandwidth * 100).toFixed(1)}%
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Superior</p>
          <p className="font-mono text-sm font-medium text-red-400">{formatCurrency(bollinger.upper)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Media</p>
          <p className="font-mono text-sm font-medium">{formatCurrency(bollinger.middle)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Inferior</p>
          <p className="font-mono text-sm font-medium text-green-400">{formatCurrency(bollinger.lower)}</p>
        </div>
      </div>
      <IndicatorBar
        value={bollinger.percentB * 100}
        min={-20}
        max={120}
        label="%B"
        zones={[
          { threshold: 20, color: 'bg-green-500' },
          { threshold: 80, color: 'bg-yellow-500' },
          { threshold: 120, color: 'bg-red-500' },
        ]}
      />
      <p className="text-xs text-muted-foreground">{bollinger.signal}</p>
    </div>
  );
}

// --- VolumeSection ---

interface VolumeSectionProps {
  volumeProfile: DeepAnalysisData['volumeProfile'];
}

export function VolumeSection({ volumeProfile }: VolumeSectionProps) {
  const trendIcon =
    volumeProfile.volumeTrend > 0.1 ? (
      <TrendingUp className="h-3 w-3 text-green-400" />
    ) : volumeProfile.volumeTrend < -0.1 ? (
      <TrendingDown className="h-3 w-3 text-red-400" />
    ) : (
      <Minus className="h-3 w-3 text-muted-foreground" />
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-primary" />
          Volume
        </h4>
        {volumeProfile.isAbnormal && (
          <Badge variant="destructive" className="text-[10px]">
            <AlertTriangle className="h-2.5 w-2.5 mr-1" />
            Anormal
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Volume Atual</p>
          <p className="font-mono text-sm font-medium">{formatCurrency(volumeProfile.currentVolume, true)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Media</p>
          <p className="font-mono text-sm font-medium">{formatCurrency(volumeProfile.avgVolume, true)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          Tendencia {trendIcon}
        </span>
        <span className="font-mono">
          {(volumeProfile.volumeTrend * 100).toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Vol/TVL Ratio</span>
        <span className="font-mono">{(volumeProfile.volumeTvlRatio * 100).toFixed(2)}%</span>
      </div>
    </div>
  );
}

// --- MomentumSection ---

interface MomentumSectionProps {
  momentum: DeepAnalysisData['momentum'];
}

const momentumColors: Record<string, string> = {
  'Strong Sell': 'text-red-500',
  Sell: 'text-red-400',
  Neutral: 'text-yellow-400',
  Buy: 'text-green-400',
  'Strong Buy': 'text-green-500',
};

const momentumBg: Record<string, string> = {
  'Strong Sell': 'bg-red-500/15',
  Sell: 'bg-red-500/10',
  Neutral: 'bg-yellow-500/10',
  Buy: 'bg-green-500/10',
  'Strong Buy': 'bg-green-500/15',
};

const momentumLabels: Record<string, string> = {
  'Strong Sell': 'Venda Forte',
  Sell: 'Venda',
  Neutral: 'Neutro',
  Buy: 'Compra',
  'Strong Buy': 'Compra Forte',
};

export function MomentumSection({ momentum }: MomentumSectionProps) {
  const componentLabels: { key: keyof typeof momentum.components; label: string }[] = [
    { key: 'rsiSignal', label: 'RSI' },
    { key: 'macdSignal', label: 'MACD' },
    { key: 'bollingerSignal', label: 'Bollinger' },
    { key: 'volumeSignal', label: 'Volume' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Momentum Composto</h4>
        <span
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-bold',
            momentumBg[momentum.label],
            momentumColors[momentum.label]
          )}
        >
          {momentumLabels[momentum.label] ?? momentum.label}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold font-mono tabular-nums">
          {momentum.score.toFixed(0)}
        </div>
        <div className="flex-1">
          <IndicatorBar
            value={momentum.score}
            min={0}
            max={100}
            showValue={false}
            zones={[
              { threshold: 20, color: 'bg-red-500' },
              { threshold: 40, color: 'bg-red-400' },
              { threshold: 60, color: 'bg-yellow-500' },
              { threshold: 80, color: 'bg-green-400' },
              { threshold: 100, color: 'bg-green-500' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {componentLabels.map(({ key, label }) => {
          const val = momentum.components[key];
          return (
            <div key={key} className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className={cn('font-mono text-xs font-medium', val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-muted-foreground')}>
                {val > 0 ? '+' : ''}{val.toFixed(2)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
