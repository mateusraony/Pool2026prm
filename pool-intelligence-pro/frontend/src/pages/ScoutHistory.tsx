import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { networkColors, dexLogos } from '@/data/constants';
import type { HistoryEntry } from '@/types/pool';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDownCircle,
  RefreshCw,
  ArrowUpCircle,
  TrendingUp,
  TrendingDown,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const HISTORY_STORAGE_KEY = 'scout-history';

export default function ScoutHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {
      console.error('Failed to load history from localStorage');
    }
  }, []);

  const typeIcons = {
    entry: ArrowDownCircle,
    rebalance: RefreshCw,
    exit: ArrowUpCircle,
  };

  const typeLabels = {
    entry: { label: 'Entrada', color: 'text-success' },
    rebalance: { label: 'Rebalance', color: 'text-warning' },
    exit: { label: 'Saida', color: 'text-destructive' },
  };

  return (
    <MainLayout
      title="Historico"
      subtitle="Registro de todas as operacoes"
    >
      {history.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhum registro</h3>
          <p className="text-muted-foreground">
            Seu historico de operacoes aparecera aqui
          </p>
        </div>
      ) : (
        /* Timeline */
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {history.map((entry, index) => {
              const Icon = typeIcons[entry.type];
              const typeInfo = typeLabels[entry.type];

              return (
                <div
                  key={entry.id}
                  className="relative pl-16 animate-slide-up"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  {/* Icon */}
                  <div className={cn(
                    'absolute left-3 flex h-7 w-7 items-center justify-center rounded-full bg-background border-2',
                    entry.type === 'entry' ? 'border-success' :
                    entry.type === 'rebalance' ? 'border-warning' : 'border-destructive'
                  )}>
                    <Icon className={cn('h-4 w-4', typeInfo.color)} />
                  </div>

                  {/* Card */}
                  <div className="glass-card p-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-lg">
                          {dexLogos[entry.pool.dex] || ''}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{entry.pool.pair}</h3>
                            <Badge className={cn('text-[10px]',
                              entry.type === 'entry' ? 'bg-success/20 text-success' :
                              entry.type === 'rebalance' ? 'bg-warning/20 text-warning' :
                              'bg-destructive/20 text-destructive'
                            )}>
                              {typeInfo.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{entry.pool.dex}</span>
                            <span className="text-muted-foreground">-</span>
                            <span
                              className="text-xs font-medium"
                              style={{ color: networkColors[entry.pool.network] }}
                            >
                              {entry.pool.network}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span className="text-xs">
                            {format(new Date(entry.date), "dd MMM yyyy, HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="mt-4 grid grid-cols-3 gap-4">
                      <div className="p-2 rounded-lg bg-secondary/50 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital</p>
                        <p className="font-mono text-sm">${entry.capital}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Min</p>
                        <p className="font-mono text-sm">{entry.range.min}</p>
                      </div>
                      <div className="p-2 rounded-lg bg-secondary/50 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Max</p>
                        <p className="font-mono text-sm">{entry.range.max}</p>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="mt-3 p-3 rounded-lg bg-muted/50">
                      <p className="text-sm text-muted-foreground">{entry.reason}</p>
                    </div>

                    {/* Result (for exits) */}
                    {entry.result && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                          Resultado Final
                        </p>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="p-3 rounded-lg bg-success/10 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees</p>
                            <p className="font-mono text-lg text-success">
                              +${entry.result.fees.toFixed(2)}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-destructive/10 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IL</p>
                            <p className="font-mono text-lg text-destructive">
                              -${entry.result.il.toFixed(2)}
                            </p>
                          </div>
                          <div className={cn(
                            'p-3 rounded-lg text-center',
                            entry.result.pnl >= 0 ? 'bg-success/10' : 'bg-destructive/10'
                          )}>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL</p>
                            <div className="flex items-center justify-center gap-1">
                              {entry.result.pnl >= 0 ? (
                                <TrendingUp className="h-4 w-4 text-success" />
                              ) : (
                                <TrendingDown className="h-4 w-4 text-destructive" />
                              )}
                              <p className={cn(
                                'font-mono text-lg font-bold',
                                entry.result.pnl >= 0 ? 'text-success' : 'text-destructive'
                              )}>
                                {entry.result.pnl >= 0 ? '+' : ''}${entry.result.pnl.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </MainLayout>
  );
}
