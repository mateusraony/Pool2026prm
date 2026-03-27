import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { RangeChart } from '@/components/common/RangeChart';
import { UniswapRangeChart } from '@/components/charts/UniswapRangeChart';
import { StatCard } from '@/components/common/StatCard';
import { PerformanceCharts } from '@/components/charts/PerformanceCharts';
import { CandlestickChart, type Timeframe } from '@/components/charts/CandlestickChart';
import { PoolNotes } from '@/components/common/PoolNotes';
import { HodlVsLp } from '@/components/common/HodlVsLp';
import { ConfBadge } from '@/components/common/ConfBadge';
import { AIInsightsCard } from '@/components/AIInsightsCard';
import { TokenCorrelation } from '@/components/common/TokenCorrelation';
import { DeepAnalysisPanel } from '@/components/common/DeepAnalysisPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Star,
  Activity,
  TrendingUp,
  Shield,
  DollarSign,
  BarChart3,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchPoolDetail, addFavorite, fetchOhlcv, fetchLiquidityDistribution, API_BASE_URL } from '@/api/client';
import { PoolMetricsChart } from '@/components/charts/PoolMetricsChart';
import { unifiedPoolToViewPool } from '@/data/adapters';
import { networkColors, dexLogos } from '@/data/constants';
import { usePoolWebSocket } from '@/hooks/usePoolWebSocket';
import type { Pool } from '@/types/pool';

/** Badge de confiança para dados estimados ou suplementados */

/** Flash visual por 2s quando um valor muda — indica update live */
function useValueFlash(value: unknown): boolean {
  const [flashing, setFlashing] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && value !== undefined && value !== null) {
      prev.current = value;
      setFlashing(true);
      const t = setTimeout(() => setFlashing(false), 2000);
      return () => clearTimeout(t);
    }
  }, [value]);
  return flashing;
}

export default function ScoutPoolDetail() {
  const { chain, address } = useParams<{ chain: string; address: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRange, setSelectedRange] = useState<'defensive' | 'optimized' | 'aggressive'>('optimized');
  const [ohlcvTimeframe, setOhlcvTimeframe] = useState<Timeframe>('hour');

  // WebSocket real-time por pool
  const { liveData, lastUpdated, isConnected, positionAlert } = usePoolWebSocket(chain, address);

  // Estado reativo para o timestamp atual — força re-render a cada 1s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Contador de segundos desde último update — atualiza via tick de 1s
  const secondsSince = lastUpdated ? Math.floor((now - lastUpdated.getTime()) / 1000) : 0;

  // Toast quando posição sai do range (throttle: 1 toast a cada 2 min)
  const prevAlertRef = useRef<string | undefined>(undefined);
  const lastToastRef = useRef<number>(0);
  useEffect(() => {
    if (
      positionAlert === 'out_of_range' &&
      prevAlertRef.current !== 'out_of_range' &&
      Date.now() - lastToastRef.current > 120_000
    ) {
      lastToastRef.current = Date.now();
      toast.warning('Posicao saiu do range!', {
        description: 'Considere reposicionar sua liquidez.',
        action: { label: 'Ver posicoes', onClick: () => navigate('/active') },
      });
    }
    prevAlertRef.current = positionAlert;
  }, [positionAlert, navigate]);

  // Flash nos valores que mudam com liveData
  const tvlFlash = useValueFlash(liveData?.tvlUSD);
  const volFlash = useValueFlash(liveData?.volume24hUSD);
  const scoreFlash = useValueFlash(liveData?.healthScore);

  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setOhlcvTimeframe(tf);
  }, []);

  // React Query: auto-retry 3x, cache, background refetch
  const { data: detailData, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['scout-pool-detail', chain, address],
    queryFn: async () => {
      if (!chain || !address) return null;
      const data = await fetchPoolDetail(chain, address);
      if (data) {
        return {
          pool: unifiedPoolToViewPool(data.pool, data.score, data.ranges),
          history: data.history || [],
        };
      }
      return null;
    },
    enabled: !!chain && !!address,
    staleTime: 60000,
    refetchInterval: 120000, // refresh every 2 min
  });

  const pool = detailData?.pool ?? null;
  const history = detailData?.history ?? [];

  // OHLCV query — carrega histórico de preços
  const { data: ohlcvData, isLoading: ohlcvLoading, error: ohlcvError } = useQuery({
    queryKey: ['ohlcv', chain, address, ohlcvTimeframe],
    queryFn: () => {
      if (!chain || !address) return null;
      const limit = ohlcvTimeframe === 'hour' ? 168 : 90;
      return fetchOhlcv(chain, address, ohlcvTimeframe, limit);
    },
    enabled: !!chain && !!address && !!pool,
    staleTime: ohlcvTimeframe === 'hour' ? 300000 : 900000,
    retry: 1,
  });

  // Liquidity distribution query for UniswapRangeChart
  const { data: liqData } = useQuery({
    queryKey: ['liquidity-distribution', chain, address],
    queryFn: () => fetchLiquidityDistribution(chain!, address!, 50),
    enabled: !!(chain && address && pool),
    staleTime: 300_000,
  });

  // Price history derived from OHLCV candles for UniswapRangeChart
  const priceHistory = useMemo(() => {
    if (!ohlcvData?.candles) return [];
    return ohlcvData.candles.map((c: any) => ({ timestamp: c.timestamp * 1000, price: c.close }));
  }, [ohlcvData]);

  // Mutation: add to favorites
  const favoriteMutation = useMutation({
    mutationFn: (p: Pool) =>
      addFavorite({
        poolId: p.id,
        chain: p.chain || '',
        poolAddress: p.poolAddress || '',
        token0Symbol: p.token0,
        token1Symbol: p.token1,
        protocol: p.protocol,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('Pool adicionada a favoritas');
    },
    onError: () => toast.error('Erro ao favoritar pool'),
  });

  if (isLoading) {
    return (
      <MainLayout title="Carregando..." subtitle="">
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout title="Erro" subtitle="">
        <div className="glass-card p-8 text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="text-xl font-semibold">Erro ao carregar pool</h3>
          <p className="text-sm text-muted-foreground">
            API: {API_BASE_URL} — {(error as Error).message}
          </p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </div>
      </MainLayout>
    );
  }

  if (!pool) {
    return (
      <MainLayout title="Pool nao encontrada" subtitle="">
        <div className="glass-card p-12 text-center">
          <h3 className="text-xl font-semibold mb-4">Pool nao encontrada</h3>
          <Button onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        </div>
      </MainLayout>
    );
  }

  const riskLabels = { low: 'Baixo', medium: 'Medio', high: 'Alto' };

  return (
    <MainLayout title={pool.pair} subtitle={`${pool.dex} - ${pool.network}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div className="flex gap-2 items-center">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Button
            variant="outline"
            onClick={() => favoriteMutation.mutate(pool)}
            disabled={favoriteMutation.isPending}
          >
            {favoriteMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Star className="h-4 w-4 mr-1" />
            )}
            Favoritar
          </Button>
          <Button variant="outline" onClick={() => navigate(`/analytics/${pool.chain}/${pool.poolAddress}`)}>
            <BarChart3 className="h-4 w-4 mr-1" /> Analytics
          </Button>
          <Button onClick={() => navigate(`/simulation/${pool.chain}/${pool.poolAddress}`)}>
            <Activity className="h-4 w-4 mr-1" /> Simular
          </Button>
        </div>
      </div>

      {/* Banner Live — mostra quando dados foram atualizados via WebSocket */}
      {lastUpdated && (
        <div className={cn(
          'flex items-center gap-2 text-xs mb-4 transition-colors duration-500',
          isConnected && secondsSince < 15 ? 'text-green-500' : 'text-muted-foreground'
        )}>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full flex-shrink-0',
            isConnected && secondsSince < 15 ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'
          )} />
          {isConnected
            ? `Live · Atualizado ha ${secondsSince < 60 ? `${secondsSince}s` : `${Math.floor(secondsSince / 60)}min`}`
            : 'Reconectando...'}
        </div>
      )}

      {/* Pool Info Card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-2xl">
              {dexLogos[pool.dex] || '🔵'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{pool.pair}</h2>
                <Badge variant="outline">{pool.feeTier}%</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground">{pool.dex}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium" style={{ color: networkColors[pool.network] || '#888' }}>
                  {pool.network}
                </span>
              </div>
            </div>
          </div>
          <div className={cn(
            'text-right p-2 rounded-xl transition-all duration-300',
            scoreFlash && 'ring-1 ring-green-500/40'
          )}>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-mono text-3xl font-bold text-primary">
                {liveData?.healthScore ?? pool.score}
              </span>
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Score IA</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="TVL"
          value={formatCurrency(liveData?.tvlUSD ?? pool.tvl, true)}
          icon={<DollarSign className="h-5 w-5" />}
          className={cn(tvlFlash && 'ring-1 ring-green-500/40 transition-all duration-300')}
        />
        <div className="relative">
          <StatCard
            label="Volume 24h"
            value={formatCurrency(liveData?.volume24hUSD ?? pool.volume24h, true)}
            icon={<BarChart3 className="h-5 w-5" />}
            className={cn(volFlash && 'ring-1 ring-green-500/40 transition-all duration-300')}
          />
          <div className="absolute top-2 right-2"><ConfBadge conf={pool.dataConfidence?.volume?.confidence} /></div>
        </div>
        <div className="relative">
          <StatCard label="APR" value={`${pool.apr.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
          <div className="absolute top-2 right-2"><ConfBadge conf={pool.dataConfidence?.apr?.confidence} /></div>
        </div>
        <StatCard label="Risco" value={riskLabels[pool.risk]} icon={<Shield className="h-5 w-5" />}
          variant={pool.risk === 'low' ? 'success' : pool.risk === 'medium' ? 'warning' : 'danger'} />
      </div>

      {/* Pool Metrics History */}
      {chain && address && (
        <div className="glass-card p-4 mb-6">
          <h3 className="font-semibold mb-3 text-sm">Histórico de Performance</h3>
          <PoolMetricsChart chain={chain} address={address} />
        </div>
      )}

      {/* Range Tabs */}
      <Tabs value={selectedRange} onValueChange={(v) => setSelectedRange(v as typeof selectedRange)} className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="defensive">Defensivo</TabsTrigger>
          <TabsTrigger value="optimized">Otimizado</TabsTrigger>
          <TabsTrigger value="aggressive">Agressivo</TabsTrigger>
        </TabsList>
        <TabsContent value={selectedRange}>
          {pool && (
            <UniswapRangeChart
              priceHistory={priceHistory}
              currentPrice={pool.currentPrice || pool.price || 1}
              rangeLower={pool.ranges[selectedRange as keyof typeof pool.ranges]?.min || 0}
              rangeUpper={pool.ranges[selectedRange as keyof typeof pool.ranges]?.max || 0}
              liquidityData={liqData?.bars?.map((b: any) => ({ price: b.price, liquidity: b.liquidity }))}
              height={300}
              accentColor={selectedRange === 'defensive' ? '#10b981' : selectedRange === 'aggressive' ? '#ef4444' : '#FF37C7'}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Performance Charts */}
      {history.length > 0 && (
        <PerformanceCharts history={history} className="mb-6" />
      )}

      {/* Projections */}
      <div className="glass-card p-6 mb-6">
        <h3 className="font-semibold mb-4">Projecoes</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Fees/dia<ConfBadge conf={pool.dataConfidence?.fees?.confidence} /></p>
            <p className="font-mono text-lg text-success">+{(pool.metrics.feesEstimated * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">IL est.<ConfBadge conf={pool.dataConfidence?.volatility?.confidence} /></p>
            <p className="font-mono text-lg text-destructive">-{(pool.metrics.ilEstimated * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Retorno Liq.</p>
            <p className="font-mono text-lg text-primary">+{(pool.metrics.netReturn * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Tempo em Range</p>
            <p className="font-mono text-lg">{pool.metrics.timeInRange}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Gas est.</p>
            <p className="font-mono text-lg">${pool.metrics.gasEstimated.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Token Correlation */}
      {chain && address && (
        <div className="mb-6">
          <TokenCorrelation chain={chain} address={address} />
        </div>
      )}

      {/* Deep Analysis — Indicadores Técnicos */}
      {chain && address && (
        <div className="mb-6">
          <DeepAnalysisPanel chain={chain} address={address} />
        </div>
      )}

      {/* AI Insights */}
      {chain && address && (
        <div className="mb-6">
          <AIInsightsCard chain={chain} address={address} />
        </div>
      )}

      {/* HODL vs LP Comparison */}
      <HodlVsLp pool={pool} className="mb-6" />

      {/* Explanation */}
      {pool.explanation && (
        <div className="glass-card p-6 mb-6">
          <h3 className="font-semibold mb-2">Analise</h3>
          <p className="text-muted-foreground">{pool.explanation}</p>
        </div>
      )}

      {/* Price History (OHLCV) — ETAPA 15 */}
      <div className="glass-card p-6 mb-6">
        <CandlestickChart
          candles={ohlcvData?.candles ?? null}
          loading={ohlcvLoading}
          error={ohlcvError ? 'Falha ao carregar histórico' : null}
          timeframe={ohlcvTimeframe}
          onTimeframeChange={handleTimeframeChange}
          title={`Histórico de Preço — ${pool.token0}/${pool.token1}`}
          currentPrice={ohlcvData?.candles?.at(-1)?.close}
          height={320}
        />
      </div>

      {/* Notes */}
      <PoolNotes poolId={pool.id} />
    </MainLayout>
  );
}
