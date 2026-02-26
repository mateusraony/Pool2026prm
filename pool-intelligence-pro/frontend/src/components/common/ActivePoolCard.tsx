import { ActivePool } from '@/types/pool';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { networkColors, dexLogos } from '@/data/constants';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActivePoolCardProps {
  pool: ActivePool;
  onRebalance?: () => void;
  onAdjust?: () => void;
  onExit?: () => void;
  className?: string;
}

export function ActivePoolCard({
  pool,
  onRebalance,
  onAdjust,
  onExit,
  className,
}: ActivePoolCardProps) {
  const statusStyles = {
    ok: { bg: 'bg-success/10', border: 'border-success/30', dot: 'text-success', label: 'OK' },
    attention: { bg: 'bg-warning/10', border: 'border-warning/30', dot: 'text-warning', label: 'Atenção' },
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/30', dot: 'text-destructive', label: 'Crítico' },
  };

  const status = statusStyles[pool.status];

  return (
    <div className={cn('glass-card overflow-hidden animate-slide-up', className)}>
      {/* Status Bar */}
      <div className={cn('px-4 py-2 flex items-center justify-between', status.bg, status.border, 'border-b')}>
        <div className="flex items-center gap-2">
          <span className={cn('pulse-dot', status.dot)} />
          <span className="text-sm font-medium">{status.label}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Última ação: {formatDistanceToNow(new Date(pool.lastAction), { addSuffix: true, locale: ptBR })}
        </span>
      </div>

      <div className="p-4">
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

          {/* PnL */}
          <div className="text-right">
            <div className={cn(
              'flex items-center gap-1',
              pool.pnl >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {pool.pnl >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              <span className="font-mono text-lg font-bold">
                {pool.pnl >= 0 ? '+' : ''}{pool.pnl.toFixed(2)}%
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL</span>
          </div>
        </div>

        {/* Capital & Metrics */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital</p>
            <p className="font-mono text-sm">${pool.capital}</p>
            <p className="text-[10px] text-muted-foreground">{pool.capitalPercent}%</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees</p>
            <p className="font-mono text-sm text-success">+${pool.feesAccrued.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IL</p>
            <p className="font-mono text-sm text-destructive">-${pool.ilActual.toFixed(2)}</p>
          </div>
          <div className="rounded-lg bg-secondary/50 p-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</p>
            <p className={cn(
              'font-mono text-sm',
              (pool.feesAccrued - pool.ilActual) >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {(pool.feesAccrued - pool.ilActual) >= 0 ? '+' : ''}${(pool.feesAccrued - pool.ilActual).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onRebalance}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Rebalancear
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={onAdjust}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={onExit}
          >
            <XCircle className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
