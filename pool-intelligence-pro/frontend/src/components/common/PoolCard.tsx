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
    medium: 'Médio',
    high: 'Alto',
  };

  return (
    <div className={cn('glass-card p-4 animate-slide-up', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-xl">
            {dexLogos[pool.dex] || '🔵'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{pool.pair}</h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {pool.feeTier}%
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{pool.dex}</span>
              <span className="text-muted-foreground">·</span>
              <span 
                className="text-xs font-medium"
                style={{ color: networkColors[pool.network] || '#888' }}
              >
                {pool.network}
              </span>
            </div>
          </div>
        </div>

        {/* Score */}
        <div className="text-right">
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="font-mono text-lg font-bold text-primary">{pool.score}</span>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Score IA</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">TVL</p>
          <p className="font-mono text-sm">${(pool.tvl / 1_000_000).toFixed(1)}M</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vol 24h</p>
          <p className="font-mono text-sm">${(pool.volume24h / 1_000_000).toFixed(1)}M</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">APR</p>
          <p className="font-mono text-sm text-success">{pool.apr.toFixed(1)}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Risco</p>
          <Badge className={cn('mt-0.5', riskStyles[pool.risk])}>
            {riskLabels[pool.risk]}
          </Badge>
        </div>
      </div>

      {/* Projections */}
      <div className="mt-4 rounded-lg bg-secondary/50 p-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees/dia</p>
            <p className="font-mono text-sm text-success">+{(pool.metrics.feesEstimated * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IL est.</p>
            <p className="font-mono text-sm text-destructive">-{(pool.metrics.ilEstimated * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ret. Líq.</p>
            <p className="font-mono text-sm text-primary">+{(pool.metrics.netReturn * 100).toFixed(2)}%</p>
          </div>
        </div>
      </div>

      {/* Capital Suggestion */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-border/50 p-2">
        <span className="text-xs text-muted-foreground">Capital sugerido:</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{capitalSuggested.percent}%</span>
          <span className="text-muted-foreground">=</span>
          <span className="font-mono text-sm text-primary">${capitalSuggested.usdt}</span>
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="mt-4 flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onViewDetails}
          >
            <Eye className="h-4 w-4 mr-1" />
            Detalhes
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onFavorite}
          >
            <Star className="h-4 w-4" />
          </Button>
          <Button 
            variant="glow" 
            size="sm" 
            className="flex-1"
            onClick={onMonitor}
          >
            <Activity className="h-4 w-4 mr-1" />
            Monitorar
          </Button>
        </div>
      )}
    </div>
  );
}
