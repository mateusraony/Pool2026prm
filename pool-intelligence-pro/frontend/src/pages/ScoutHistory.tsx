import { MainLayout } from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import {
  ArrowDownCircle,
  RefreshCw,
  ArrowUpCircle,
  DollarSign,
  Calendar,
  Trash2,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchHistory, deleteHistoryEntry, type PositionHistoryEntry } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const typeConfig: Record<string, { icon: typeof ArrowDownCircle; label: string; color: string; border: string }> = {
  ENTRY: { icon: ArrowDownCircle, label: 'Entrada', color: 'text-success', border: 'border-success' },
  EXIT: { icon: ArrowUpCircle, label: 'Saida', color: 'text-destructive', border: 'border-destructive' },
  REBALANCE: { icon: RefreshCw, label: 'Rebalance', color: 'text-warning', border: 'border-warning' },
  FEE_COLLECT: { icon: DollarSign, label: 'Coleta de Fees', color: 'text-primary', border: 'border-primary' },
};

export default function ScoutHistory() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => fetchHistory({ limit: 200 }),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHistoryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
      toast.success('Registro removido');
    },
    onError: () => toast.error('Erro ao remover registro'),
  });

  const history = data?.data || [];

  return (
    <MainLayout
      title="Historico"
      subtitle="Registro de todas as operacoes"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhum registro</h3>
          <p className="text-muted-foreground">
            Seu historico de operacoes aparecera aqui quando voce criar ou fechar posicoes.
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {history.map((entry, index) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                index={index}
                onDelete={() => deleteMutation.mutate(entry.id)}
              />
            ))}
          </div>
        </div>
      )}
    </MainLayout>
  );
}

function HistoryCard({ entry, index, onDelete }: {
  entry: PositionHistoryEntry;
  index: number;
  onDelete: () => void;
}) {
  const config = typeConfig[entry.type] || typeConfig.ENTRY;
  const Icon = config.icon;
  const date = new Date(entry.createdAt);

  return (
    <div
      className="relative pl-16 animate-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Timeline icon */}
      <div className={cn(
        'absolute left-3 flex h-7 w-7 items-center justify-center rounded-full bg-background border-2',
        config.border
      )}>
        <Icon className={cn('h-4 w-4', config.color)} />
      </div>

      {/* Card */}
      <div className="glass-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{entry.token0}/{entry.token1}</h3>
              <Badge className={cn('text-[10px]',
                entry.type === 'ENTRY' ? 'bg-success/20 text-success' :
                entry.type === 'REBALANCE' ? 'bg-warning/20 text-warning' :
                entry.type === 'EXIT' ? 'bg-destructive/20 text-destructive' :
                'bg-primary/20 text-primary'
              )}>
                {config.label}
              </Badge>
              {entry.mode && (
                <Badge variant="outline" className="text-[10px]">{entry.mode}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {entry.chain} - {entry.poolAddress.slice(0, 10)}...
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {date.toLocaleDateString('pt-BR')} {date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <Button variant="ghost" size="sm" onClick={onDelete} className="h-6 w-6 p-0">
              <Trash2 className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          {entry.capital != null && (
            <div className="p-2 rounded-lg bg-secondary/50 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital</p>
              <p className="font-mono text-sm">${entry.capital.toLocaleString()}</p>
            </div>
          )}
          {entry.rangeLower != null && (
            <div className="p-2 rounded-lg bg-secondary/50 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range</p>
              <p className="font-mono text-sm">{entry.rangeLower.toFixed(4)} - {entry.rangeUpper?.toFixed(4)}</p>
            </div>
          )}
          {entry.pnl != null && (
            <div className={cn(
              'p-2 rounded-lg text-center',
              entry.pnl >= 0 ? 'bg-success/10' : 'bg-destructive/10'
            )}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL</p>
              <p className={cn('font-mono text-sm font-bold', entry.pnl >= 0 ? 'text-success' : 'text-destructive')}>
                {entry.pnl >= 0 ? '+' : ''}${entry.pnl.toFixed(2)}
              </p>
            </div>
          )}
        </div>

        {/* Note */}
        {entry.note && (
          <div className="mt-3 p-2 rounded-lg bg-muted/50">
            <p className="text-sm text-muted-foreground">{entry.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
