import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PoolCard } from '@/components/common/PoolCard';
import { ActivePoolCard } from '@/components/common/ActivePoolCard';
import { PullToRefresh } from '@/components/common/PullToRefresh';
import { LiveIndicator } from '@/components/common/LiveIndicator';
import { useRiskConfig } from '@/hooks/useRiskConfig';
import { fetchUnifiedPools, fetchRangePositions, fetchAlerts, fetchHealth, fetchRecommendations, fetchMarketConditions, API_BASE_URL } from '@/api/client';
import type { RangePosition, Recommendation } from '@/api/client';
import { unifiedPoolToViewPool } from '@/data/adapters';
import type { Pool, ActivePool } from '@/types/pool';
import { formatCurrency } from '@/lib/utils';
import {
  Wallet,
  TrendingUp,
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Bell,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function ScoutDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { config } = useRiskConfig();

  const handlePullRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['scout-pools'] });
    await queryClient.invalidateQueries({ queryKey: ['scout-positions'] });
  }, [queryClient]);

  // React Query: auto-retry 3x, refetch every 60s, cache
  const { data: poolsData, isLoading: poolsLoading, error: poolsError, refetch } = useQuery({
    queryKey: ['scout-pools'],
    queryFn: () => fetchUnifiedPools({ limit: 10, sortBy: 'healthScore', sortDirection: 'desc' }),
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: positions = [] } = useQuery({
    queryKey: ['scout-positions'],
    queryFn: fetchRangePositions,
    refetchInterval: 60000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['scout-alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 30000,
  });

  const { data: healthData } = useQuery({
    queryKey: ['scout-health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
  });

  const { data: recommendations } = useQuery({
    queryKey: ['recommendations', 'top'],
    queryFn: () => fetchRecommendations(undefined, 1),
    staleTime: 2 * 60 * 1000,
  });
  const topRecommendation: Recommendation | null = recommendations?.[0] || null;

  const { data: marketConditions } = useQuery({
    queryKey: ['market-conditions'],
    queryFn: fetchMarketConditions,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const pools = useMemo(() => {
    if (!poolsData?.pools) return [];
    return poolsData.pools.map((p) => unifiedPoolToViewPool(p));
  }, [poolsData]);

  // Build ActivePool objects from range positions
  const activePools: ActivePool[] = useMemo(() => {
    return positions.filter((p: RangePosition) => p.isActive).map((pos: RangePosition) => {
      const matchedPool = pools.find(
        (p) => p.poolAddress === pos.poolAddress && p.chain === pos.chain
      );
      const base: Pool = matchedPool || {
        id: pos.poolId,
        dex: '',
        network: pos.chain,
        pair: `${pos.token0Symbol}/${pos.token1Symbol}`,
        token0: pos.token0Symbol,
        token1: pos.token1Symbol,
        feeTier: 0,
        tvl: 0,
        volume24h: 0,
        volume7d: 0,
        apr: 0,
        score: 0,
        risk: 'medium' as const,
        priceMin: pos.rangeLower,
        priceMax: pos.rangeUpper,
        currentPrice: pos.entryPrice,
        ranges: (() => {
          const center = (pos.rangeLower + pos.rangeUpper) / 2;
          const halfWidth = (pos.rangeUpper - pos.rangeLower) / 2;
          const mode = pos.mode ?? 'NORMAL';
          // Factor para cada modo: DEFENSIVE=mais largo, AGGRESSIVE=mais estreito
          const factors: Record<string, { def: number; opt: number; agg: number }> = {
            DEFENSIVE: { def: 1.0, opt: 0.70, agg: 0.45 },
            NORMAL:    { def: 1.40, opt: 1.0, agg: 0.65 },
            AGGRESSIVE:{ def: 2.20, opt: 1.55, agg: 1.0 },
          };
          const f = factors[mode] ?? factors.NORMAL;
          return {
            defensive:  { min: +(center - halfWidth * f.def).toFixed(6), max: +(center + halfWidth * f.def).toFixed(6) },
            optimized:  { min: +(center - halfWidth * f.opt).toFixed(6), max: +(center + halfWidth * f.opt).toFixed(6) },
            aggressive: { min: +(center - halfWidth * f.agg).toFixed(6), max: +(center + halfWidth * f.agg).toFixed(6) },
          };
        })(),
        metrics: { feesEstimated: 0, ilEstimated: 0, netReturn: 0, gasEstimated: 0, timeInRange: 0 },
        explanation: '',
        poolAddress: pos.poolAddress,
        chain: pos.chain,
      };

      // Use real P&L data from backend if available
      const pnlData = pos.pnl;
      const feesAccrued = pnlData?.feesAccrued ?? 0;
      const ilActual = pnlData?.ilActual ?? 0;
      const pnlPercent = pnlData?.pnlPercent ?? 0;

      // Determine status from P&L and price position
      const currentPrice = pos.currentPrice ?? pos.entryPrice;
      const isOutOfRange = currentPrice < pos.rangeLower || currentPrice > pos.rangeUpper;
      const distToEdge = Math.min(
        Math.abs(currentPrice - pos.rangeLower),
        Math.abs(currentPrice - pos.rangeUpper),
      ) / currentPrice * 100;
      const posStatus: 'ok' | 'attention' | 'critical' = isOutOfRange
        ? 'critical'
        : distToEdge < 5
          ? 'attention'
          : 'ok';

      return {
        ...base,
        capital: pos.capital,
        capitalPercent: (pos.capital / config.totalBanca) * 100,
        entryDate: pos.createdAt,
        pnl: pnlPercent,
        feesAccrued,
        ilActual,
        status: posStatus,
        lastAction: pos.lastCheckedAt || pos.createdAt || new Date().toISOString(),
        rangeSelected: (pos.mode ?? 'normal').toLowerCase() as 'defensive' | 'optimized' | 'aggressive',
      };
    });
  }, [positions, pools]);

  // Network exposure from active positions
  const networkExposure = useMemo(() => {
    const exposure: Record<string, number> = {};
    const totalCap = activePools.reduce((acc, p) => acc + p.capital, 0);
    if (totalCap === 0) return [];
    activePools.forEach((p) => {
      const net = p.network || 'Unknown';
      exposure[net] = (exposure[net] || 0) + p.capital;
    });
    return Object.entries(exposure).map(([network, capital]) => ({
      network,
      percent: (capital / config.totalBanca) * 100,
    }));
  }, [activePools]);

  const totalPnl = activePools.reduce((acc, p) => acc + p.feesAccrued - p.ilActual, 0);
  const totalCapitalDeployed = activePools.reduce((acc, p) => acc + p.capital, 0);
  const topPool = pools[0] || null;
  const canOperate = pools.some(p => p.score > 60);
  const isLoading = poolsLoading;
  const error = poolsError ? (poolsError instanceof Error ? poolsError.message : 'Erro ao conectar com a API') : null;

  // Real alerts from backend
  const recentAlerts = alertsData?.recentAlerts?.slice(0, 3) || [];
  const telegramStatus = healthData?.status === 'HEALTHY' ? 'Online' : healthData?.status === 'DEGRADED' ? 'Degradado' : 'Offline';

  if (isLoading) {
    return (
      <MainLayout title="Dashboard" subtitle="Visao geral do seu portfolio de liquidez">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Conectando ao servidor...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Visao geral do seu portfolio de liquidez"
    >
      {/* Market Conditions Banner — regime desfavoravel para LP */}
      {marketConditions?.noOperateGlobal && (
        <div className="bg-yellow-900/50 border border-yellow-600 text-yellow-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-yellow-400">&#9888;</span>
          <div>
            <span className="font-semibold">Condições desfavoráveis para LP</span>
            {marketConditions.noOperateReason && (
              <span className="text-yellow-300 ml-2 text-sm">— {marketConditions.noOperateReason}</span>
            )}
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-xl p-4 bg-destructive/8 border border-destructive/25 ring-1 ring-destructive/10">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                API: {API_BASE_URL}/api/pools
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Operation Status Banner — real-time monitoring pattern */}
      {!error && (
        <div className={`mb-6 rounded-xl p-4 flex items-center justify-between ${
          canOperate
            ? 'bg-success/8 border border-success/25 ring-1 ring-success/10'
            : 'bg-warning/8 border border-warning/25 ring-1 ring-warning/10'
        }`}>
          <div className="flex items-center gap-3">
            {canOperate ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : (
              <XCircle className="h-5 w-5 text-warning" />
            )}
            <div>
              <p className="font-medium">
                {canOperate
                  ? 'Condicoes favoraveis para operar'
                  : pools.length === 0
                    ? 'Aguardando dados do servidor...'
                    : 'Nao ha pools com score alto no momento'
                }
              </p>
              <p className="text-sm text-muted-foreground">
                {canOperate
                  ? `${pools.filter(p => p.score > 60).length} pools disponiveis com score > 60`
                  : pools.length === 0
                    ? 'O backend pode estar inicializando (aguarde ~30s)'
                    : 'Recomendacao: aguardar melhores condicoes'
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LiveIndicator />
            {canOperate && (
              <Button onClick={() => navigate('/recommended')}>
                Ver Recomendadas
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Banca Total"
          value={formatCurrency(config.totalBanca)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Capital Alocado"
          value={formatCurrency(totalCapitalDeployed)}
          change={totalCapitalDeployed > 0 ? ((totalCapitalDeployed / config.totalBanca) * 100) : 0}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="PnL Total"
          value={formatCurrency(totalPnl)}
          change={totalCapitalDeployed > 0 ? ((totalPnl / totalCapitalDeployed) * 100) : 0}
          variant={totalPnl >= 0 ? 'success' : 'danger'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Pools Monitoradas"
          value={pools.length}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Pools Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pools Ativas</h2>
            <Button variant="ghost" size="sm" onClick={() => navigate('/active')}>
              Ver todas
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>

          {activePools.length === 0 ? (
            <div className="glass-card p-8 text-center">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">Nenhuma pool ativa</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Comece explorando as pools recomendadas pela IA
              </p>
              <Button onClick={() => navigate('/recommended')}>
                Explorar Pools
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {activePools.map((pool) => (
                <ActivePoolCard
                  key={pool.id}
                  pool={pool}
                  onRebalance={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
                  onAdjust={() => navigate(`/simulation/${pool.chain}/${pool.poolAddress}`)}
                  onExit={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top Recommendation */}
          {(topRecommendation?.pool || topPool) && (() => {
            const displayPool = topRecommendation
              ? (() => {
                  const rec = topRecommendation.pool;
                  // Map Recommendation.pool (Pool from client.ts) to the view Pool shape
                  return pools.find(
                    (p) => p.poolAddress === rec.poolAddress && p.chain === rec.chain
                  ) || topPool;
                })()
              : topPool;
            if (!displayPool) return null;
            return (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold">Melhor Oportunidade</h2>
                </div>
                {topRecommendation && (
                  <span className="block text-xs text-muted-foreground mb-2">
                    Recomendacao IA · Score {topRecommendation.score?.total ?? '—'}
                  </span>
                )}
                <PoolCard
                  pool={displayPool}
                  onViewDetails={() => navigate(`/pools/${displayPool.chain}/${displayPool.poolAddress}`)}
                  onMonitor={() => navigate(`/pools/${displayPool.chain}/${displayPool.poolAddress}`)}
                />
              </div>
            );
          })()}

          {/* Real Alerts from API */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Alertas Recentes</h3>
              <span className="text-xs text-muted-foreground">Sistema {telegramStatus}</span>
            </div>

            <div className="space-y-3">
              {recentAlerts.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm p-2">
                  <Bell className="h-4 w-4" />
                  <span>Nenhum alerta recente</span>
                </div>
              ) : (
                recentAlerts.map((alert, i) => (
                  <div key={`${alert.type}_${i}`} className="flex items-start gap-3 rounded-lg bg-warning/10 p-3">
                    <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{alert.type}</p>
                      <p className="text-xs text-muted-foreground">{alert.message}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* System Metrics Widget */}
          {healthData && (
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Sistema</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate('/status')} className="text-xs">
                  Detalhes <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {healthData.uptime && (
                  <div className="rounded-lg bg-secondary/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Uptime</p>
                    <p className="text-sm font-mono font-medium">{healthData.uptime.formatted}</p>
                  </div>
                )}
                {healthData.memory && (
                  <div className="rounded-lg bg-secondary/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">RAM</p>
                    <p className={`text-sm font-mono font-medium ${
                      healthData.memory.rssMB > 400 ? 'text-destructive' : healthData.memory.rssMB > 300 ? 'text-warning' : ''
                    }`}>{healthData.memory.rssMB.toFixed(0)} MB</p>
                  </div>
                )}
                {healthData.requests && (
                  <div className="rounded-lg bg-secondary/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Requests</p>
                    <p className="text-sm font-mono font-medium">{healthData.requests.totalRequests}</p>
                  </div>
                )}
                {healthData.requests && (
                  <div className="rounded-lg bg-secondary/50 p-2 text-center">
                    <p className="text-xs text-muted-foreground">Error Rate</p>
                    <p className={`text-sm font-mono font-medium ${
                      healthData.requests.errorRate > 5 ? 'text-destructive' :
                      healthData.requests.errorRate > 1 ? 'text-warning' : 'text-success'
                    }`}>{healthData.requests.errorRate.toFixed(1)}%</p>
                  </div>
                )}
              </div>
              {healthData.requests && healthData.requests.avgDurationMs > 0 && (
                <div className="mt-2 text-xs text-muted-foreground text-center">
                  Latência média: {healthData.requests.avgDurationMs.toFixed(0)}ms
                </div>
              )}
            </div>
          )}

          {/* Network Exposure - from real positions */}
          <div className="glass-card p-4">
            <h3 className="font-semibold mb-3">Exposicao por Rede</h3>
            <div className="space-y-2">
              {networkExposure.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem posicoes ativas</p>
              ) : (
                networkExposure.map(({ network, percent }) => (
                  <div key={network}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{network}</span>
                      <span className="font-mono">{percent.toFixed(1)}% / {config.maxPerNetwork}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${config.maxPerNetwork > 0 ? Math.min(100, (percent / config.maxPerNetwork) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
