import { ActivePool } from '@/types/pool';
import { cn, formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { networkColors } from '@/data/constants';
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
    ok: { bg: 'bg-success/8', border: 'border-success/25', dot: 'text-success', label: 'OK' },
    attention: { bg: 'bg-warning/8', border: 'border-warning/25', dot: 'text-warning', label: 'Atenção' },
    critical: { bg: 'bg-destructive/8', border: 'border-destructive/25', dot: 'text-destructive', label: 'Crítico' },
  };

  const status = statusStyles[pool.status];
  const netPnl = pool.feesAccrued - pool.ilActual;

  return (
    <div className={cn('glass-card overflow-hidden animate-slide-up', className)}>
      {/* Status Bar — real-time monitoring pattern */}
      <div className={cn('px-4 py-2 flex items-center justify-between', status.bg, status.border, 'border-b')}>
        <div className="flex items-center gap-2">
          <span className={cn('live-dot', status.dot)} />
          <span className="text-sm font-medium font-display">{status.label}</span>
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {(() => {
            try {
              const d = new Date(pool.lastAction);
              return isNaN(d.getTime()) ? pool.lastAction : formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
            } catch {
              return pool.lastAction;
            }
          })()}
        </span>
      </div>

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/80 text-[11px] font-bold font-mono ring-1 ring-border/30 text-primary uppercase tracking-tight">
              {(pool.dex || 'DEX').replace(/\s*(v\d+)$/i, '').slice(0, 4)}
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

          {/* PnL — with trend glow */}
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
              <span className="font-mono text-xl font-bold">
                {pool.pnl >= 0 ? '+' : ''}{pool.pnl.toFixed(2)}%
              </span>
            </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-display">PnL</span>
          </div>
        </div>

        {/* Capital & Metrics — data-dense dashboard pattern */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-secondary/40 p-2.5 text-center ring-1 ring-border/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Capital</p>
            <p className="font-mono text-sm mt-0.5">{formatCurrency(pool.capital)}</p>
            <p className="text-[10px] text-muted-foreground">{pool.capitalPercent.toFixed(1)}%</p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2.5 text-center ring-1 ring-border/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Fees</p>
            <p className="font-mono text-sm text-success mt-0.5">+${pool.feesAccrued.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2.5 text-center ring-1 ring-border/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">IL</p>
            <p className="font-mono text-sm text-destructive mt-0.5">-${pool.ilActual.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2.5 text-center ring-1 ring-border/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-display">Net</p>
            <p className={cn(
              'font-mono text-sm font-medium mt-0.5',
              netPnl >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onRebalance?.()}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Rebalancear
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Ajustar posição"
            onClick={() => onAdjust?.()}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onExit?.()}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
