import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useDeepAnalysis } from '@/hooks/useDeepAnalysis';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MomentumSection,
  RsiSection,
  MacdSection,
  BollingerSection,
  VolumeSection,
  VwapSection,
  SmaSection,
  SupportResistanceSection,
  TrendSection,
} from '@/components/common/TechnicalSection';
import { ChevronDown, ChevronUp, RefreshCw, Clock, AlertCircle, BarChart3 } from 'lucide-react';

interface DeepAnalysisPanelProps {
  chain: string | undefined;
  address: string | undefined;
  className?: string;
}

export function DeepAnalysisPanel({ chain, address, className }: DeepAnalysisPanelProps) {
  const [timeframe, setTimeframe] = useState<'hour' | 'day'>('hour');
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading, error, refetch } = useDeepAnalysis(chain, address, {
    timeframe,
  });

  // Estado de carregamento
  if (isLoading) {
    return (
      <div className={cn('glass-card p-5 space-y-4', className)}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  // Estado de erro (API falhou)
  if (error) {
    return (
      <div className={cn('glass-card p-5', className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
            Analise Tecnica
          </h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 px-2 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar novamente
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span>Erro ao carregar analise tecnica. Clique para tentar novamente.</span>
        </div>
      </div>
    );
  }

  // Dados insuficientes (API retornou null)
  if (data === null && !isLoading) {
    return (
      <div className={cn('glass-card p-5', className)}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-primary" />
            Analise Tecnica
          </h3>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-7 px-2 text-xs">
            <RefreshCw className="h-3 w-3 mr-1" />
            Tentar novamente
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4 text-yellow-500" />
          <span>Dados insuficientes para analise tecnica. Necessario historico de precos (OHLCV).</span>
        </div>
      </div>
    );
  }

  // Sem dados ainda (query desabilitada)
  if (!data) return null;

  return (
    <div className={cn('glass-card p-5 space-y-4 animate-fade-in', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <BarChart3 className="h-4 w-4 text-primary" />
          Analise Tecnica
        </h3>
        <div className="flex items-center gap-2">
          {/* Timeframe toggle */}
          <div className="flex rounded-md border border-border/40 overflow-hidden text-xs">
            <button
              onClick={() => setTimeframe('hour')}
              className={cn(
                'px-2.5 py-1 transition-colors',
                timeframe === 'hour'
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              1H
            </button>
            <button
              onClick={() => setTimeframe('day')}
              className={cn(
                'px-2.5 py-1 transition-colors border-l border-border/40',
                timeframe === 'day'
                  ? 'bg-primary/15 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              1D
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-7 w-7 p-0"
            title="Atualizar analise"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Momentum - sempre visivel */}
      <MomentumSection momentum={data.momentum} />

      {/* Detalhes expandiveis */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Ocultar detalhes
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Ver indicadores detalhados
          </>
        )}
      </button>

      {expanded && (
        <div className="space-y-5 pt-2 border-t border-border/30">
          <RsiSection rsi={data.rsi} />
          <div className="border-t border-border/20" />
          <MacdSection macd={data.macd} />
          <div className="border-t border-border/20" />
          <BollingerSection bollinger={data.bollinger} />
          <div className="border-t border-border/20" />
          <VolumeSection volumeProfile={data.volumeProfile} />
          {data.trend && (
            <>
              <div className="border-t border-border/20" />
              <TrendSection trend={data.trend} />
            </>
          )}
          {data.vwap && (
            <>
              <div className="border-t border-border/20" />
              <VwapSection vwap={data.vwap} />
            </>
          )}
          {data.sma && (
            <>
              <div className="border-t border-border/20" />
              <SmaSection sma={data.sma} />
            </>
          )}
          {data.supportResistance && (
            <>
              <div className="border-t border-border/20" />
              <SupportResistanceSection sr={data.supportResistance} />
            </>
          )}
        </div>
      )}

      {/* Meta info */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/20">
        <span className="flex items-center gap-1">
          <Clock className="h-2.5 w-2.5" />
          {data.meta.candlesUsed} candles ({data.meta.timeframe})
        </span>
        <span>
          {new Date(data.meta.calculatedAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  );
}
