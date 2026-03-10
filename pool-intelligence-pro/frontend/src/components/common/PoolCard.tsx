import { Pool } from '@/types/pool';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, Eye, Activity, TrendingUp } from 'lucide-react';
import { networkColors, dexLogos } from '@/data/constants';

interface PoolCardProps {
  pool: Pool;
  onViewDetails?: () => void;
  onFavorite?: () => void;
  onMonitor?: () => void;
  capitalSuggested?: { percent: number; usdt: number };
  showActions?: boolean;
  className?: string;
}

function getScoreClass(score: number) {
  if (score >= 70) return 'score-high';
  if (score >= 40) return 'score-medium';
  return 'score-low';
}

export function PoolCard({
  pool,
  onViewDetails,
  onFavorite,
  onMonitor,
  capitalSuggested = { percent: 3, usdt: 300 },
  showActions = true,
  className,
}: PoolCardProps) {
  const riskStyles = {
    low: 'risk-low',
    medium: 'risk-medium',
    high: 'risk-high',
  };

  const riskLabels = {
    low: 'Baixo',
    medium: 'Medio',
    high: 'Alto',
  };

  const isHighScore = pool.score >= 70;

  return (
    <div className={cn(
      'glass-card p-5 animate-slide-up group',
      isHighScore && 'animate-border-glow',
      className
    )}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/80 text-xl ring-1 ring-border/30">
            {dexLogos[pool.dex] || '🔵'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold text-[15px]">{pool.pair}</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {pool.feeTier}%
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{pool.dex}</span>
              <span className="text-muted-foreground/50">·</span>
              <span
                className="text-xs font-medium"
                style={{ color: networkColors[pool.network] || '#888' }}
              >
                {pool.network}
              </span>
            </div>
          </div>
        </div>

        {/* Score — with glow effect */}
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <TrendingUp className={cn('h-4 w-4', getScoreClass(pool.score))} />
            <span className={cn('font-mono text-xl font-bold', getScoreClass(pool.score))}>
              {pool.score}
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">
            Score IA
          </span>
        </div>
      </div>

      {/* Metrics Grid — data-dense pattern */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">TVL</p>
          <p className="font-mono text-sm mt-0.5">${(pool.tvl / 1_000_000).toFixed(1)}M</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Vol 24h</p>
          <p className="font-mono text-sm mt-0.5">${(pool.volume24h / 1_000_000).toFixed(1)}M</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">APR</p>
          <p className="font-mono text-sm mt-0.5 text-success">{pool.apr.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Risco</p>
          <Badge className={cn('mt-0.5', riskStyles[pool.risk])}>
            {riskLabels[pool.risk]}
          </Badge>
        </div>
      </div>

      {/* Projections — financial dashboard pattern */}
      <div className="mt-4 rounded-xl bg-secondary/40 p-3 ring-1 ring-border/20">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Fees/dia</p>
            <p className="font-mono text-sm text-success font-medium">+{(pool.metrics.feesEstimated * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">IL est.</p>
            <p className="font-mono text-sm text-destructive font-medium">-{(pool.metrics.ilEstimated * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Ret. Liq.</p>
            <p className="font-mono text-sm text-primary font-medium">+{(pool.metrics.netReturn * 100).toFixed(2)}%</p>
          </div>
        </div>
      </div>

      {/* Capital Suggestion — with gold accent */}
      <div className="mt-3 flex items-center justify-between rounded-xl border border-gold/20 bg-gold/5 p-2.5">
        <span className="text-xs text-muted-foreground font-display">Capital sugerido:</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{capitalSuggested.percent}%</span>
          <span className="text-muted-foreground/50">=</span>
          <span className="font-mono text-sm font-medium text-gold">${capitalSuggested.usdt}</span>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onViewDetails?.()}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            Detalhes
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFavorite?.()}
          >
            <Star className="h-4 w-4" />
          </Button>
          <Button
            variant="glow"
            size="sm"
            className="flex-1"
            onClick={() => onMonitor?.()}
          >
            <Activity className="h-4 w-4 mr-1.5" />
            Monitorar
          </Button>
        </div>
      )}
    </div>
  );
}
