import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { PoolCard } from '@/components/common/PoolCard';
import { ActivePoolCard } from '@/components/common/ActivePoolCard';
import { defaultRiskConfig } from '@/data/constants';
import { fetchUnifiedPools, fetchRangePositions, API_BASE_URL } from '@/api/client';
import type { RangePosition } from '@/api/client';
import { unifiedPoolToViewPool } from '@/data/adapters';
import type { Pool, ActivePool } from '@/types/pool';
import {
  Wallet,
  TrendingUp,
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function ScoutDashboard() {
  const navigate = useNavigate();
  const [pools, setPools] = useState<Pool[]>([]);
  const [activePositions, setActivePositions] = useState<RangePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const [poolsRes, positions] = await Promise.all([
          fetchUnifiedPools({ limit: 10, sortBy: 'healthScore', sortDirection: 'desc' }),
          fetchRangePositions().catch(() => []),
        ]);

        const viewPools = poolsRes.pools.map((p) => unifiedPoolToViewPool(p));
        setPools(viewPools);
        setActivePositions(positions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao conectar com a API';
        setError(msg);
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Build ActivePool objects from range positions for the ActivePoolCard
  const activePools: ActivePool[] = activePositions.map((pos) => {
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
      ranges: {
        defensive: { min: pos.rangeLower, max: pos.rangeUpper },
        optimized: { min: pos.rangeLower, max: pos.rangeUpper },
        aggressive: { min: pos.rangeLower, max: pos.rangeUpper },
      },
      metrics: { feesEstimated: 0, ilEstimated: 0, netReturn: 0, gasEstimated: 0, timeInRange: 0 },
      explanation: '',
      poolAddress: pos.poolAddress,
      chain: pos.chain,
    };

    return {
      ...base,
      capital: pos.capital,
      capitalPercent: (pos.capital / defaultRiskConfig.totalBanca) * 100,
      entryDate: pos.createdAt,
      pnl: 0,
      feesAccrued: 0,
      ilActual: 0,
      status: pos.isActive ? 'ok' as const : 'attention' as const,
      lastAction: 'Entrada',
      rangeSelected: pos.mode.toLowerCase() as 'defensive' | 'optimized' | 'aggressive',
    };
  });

  const totalPnl = activePools.reduce((acc, p) => acc + (p.feesAccrued - p.ilActual), 0);
  const totalCapitalDeployed = activePools.reduce((acc, p) => acc + p.capital, 0);
  const topPool = pools[0] || null;
  const canOperate = pools.some(p => p.metrics.netReturn > 0);

  if (loading) {
    return (
      <MainLayout title="Dashboard" subtitle="Visao geral do seu portfolio de liquidez">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Carregando dados...</span>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout
      title="Dashboard"
      subtitle="Visao geral do seu portfolio de liquidez"
    >
      {/* Error Banner */}
      {error && (
        <div className="mb-6 rounded-lg p-4 bg-destructive/10 border border-destructive/30">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-destructive">Erro ao carregar dados</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                API: {API_BASE_URL}/api/pools
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Operation Status Banner */}
      <div className={`mb-6 rounded-lg p-4 flex items-center justify-between ${
        canOperate
          ? 'bg-success/10 border border-success/30'
          : 'bg-warning/10 border border-warning/30'
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
                : 'Nao ha pools com retorno liquido positivo'
              }
            </p>
            <p className="text-sm text-muted-foreground">
              {canOperate
                ? `${pools.filter(p => p.metrics.netReturn > 0).length} pools disponiveis com retorno positivo`
                : 'Recomendacao: aguardar melhores condicoes'
              }
            </p>
          </div>
        </div>
        {canOperate && (
          <Button onClick={() => navigate('/recommended')}>
            Ver Recomendadas
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Banca Total"
          value={`$${defaultRiskConfig.totalBanca.toLocaleString()}`}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Capital Alocado"
          value={`$${totalCapitalDeployed.toLocaleString()}`}
          change={totalCapitalDeployed > 0 ? ((totalCapitalDeployed / defaultRiskConfig.totalBanca) * 100) : 0}
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          label="PnL Total"
          value={`${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`}
          change={totalCapitalDeployed > 0 ? ((totalPnl / totalCapitalDeployed) * 100) : 0}
          variant={totalPnl >= 0 ? 'success' : 'danger'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          label="Pools Ativas"
          value={activePools.length}
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
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top Recommendation */}
          {topPool && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Melhor Oportunidade</h2>
              </div>
              <PoolCard
                pool={topPool}
                onViewDetails={() => navigate(`/pools/${topPool.chain}/${topPool.poolAddress}`)}
                onMonitor={() => navigate(`/pools/${topPool.chain}/${topPool.poolAddress}`)}
              />
            </div>
          )}

          {/* Alerts Preview */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Alertas Recentes</h3>
              <span className="text-xs text-muted-foreground">Telegram conectado</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-warning/10 p-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Manutencao requerida</p>
                  <p className="text-xs text-muted-foreground">
                    ETH/USDC proximo do limite do range
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg bg-success/10 p-3">
                <TrendingUp className="h-4 w-4 text-success mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Nova oportunidade</p>
                  <p className="text-xs text-muted-foreground">
                    Pool WBTC/ETH com score 87
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Summary */}
          <div className="glass-card p-4">
            <h3 className="font-semibold mb-3">Exposicao por Rede</h3>
            <div className="space-y-2">
              {['Arbitrum', 'Base'].map((network) => {
                const exposure = network === 'Arbitrum' ? 5 : 10;
                const max = defaultRiskConfig.maxPerNetwork;

                return (
                  <div key={network}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{network}</span>
                      <span className="font-mono">{exposure}% / {max}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${(exposure / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
