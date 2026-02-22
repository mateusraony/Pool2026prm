import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Clock, Fuel, DollarSign, AlertTriangle, ArrowLeft, ExternalLink, Bell, BellRing, Check } from 'lucide-react';
import { fetchPool, fetchPools, createRangePosition, fetchRangePositions, deleteRangePosition, Pool, Score } from '../api/client';
import InteractiveChart from '../components/charts/InteractiveChart';
import clsx from 'clsx';

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

type Mode = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

// Static fallback config (used only when volatility unavailable)
const modeConfigStatic = {
  DEFENSIVE: { emoji: '🛡️', label: 'Defensivo', rangePercent: 15, color: 'success' },
  NORMAL: { emoji: '⚖️', label: 'Normal', rangePercent: 10, color: 'warning' },
  AGGRESSIVE: { emoji: '🎯', label: 'Agressivo', rangePercent: 5, color: 'danger' },
};

/**
 * Compute dynamic range width from real pool volatility.
 * Mirrors backend calcRangeRecommendation: width = z * volAnn * sqrt(horizonDays/365)
 * Clamped to [0.3%, 45%] for CL pools, max 3% for stable pools.
 */
function getDynamicModeConfig(volAnn: number | undefined, isStable: boolean) {
  if (!volAnn || volAnn <= 0) return modeConfigStatic;

  const zMap = { DEFENSIVE: 0.8, NORMAL: 1.2, AGGRESSIVE: 1.8 };
  const horizonDays = 7;
  const sqrtT = Math.sqrt(horizonDays / 365);

  const calc = (z: number) => {
    let w = z * volAnn * sqrtT * 100; // convert to %
    w = Math.max(0.3, Math.min(45, w));
    if (isStable) w = Math.min(3, w);
    return Math.round(w * 10) / 10;
  };

  return {
    DEFENSIVE: { ...modeConfigStatic.DEFENSIVE, rangePercent: calc(zMap.DEFENSIVE) },
    NORMAL: { ...modeConfigStatic.NORMAL, rangePercent: calc(zMap.NORMAL) },
    AGGRESSIVE: { ...modeConfigStatic.AGGRESSIVE, rangePercent: calc(zMap.AGGRESSIVE) },
  };
}

function FullSimulation({ pool, score }: { pool: Pool; score: Score }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>((score?.recommendedMode as Mode) || 'NORMAL');
  const [capital, setCapital] = useState(100);
  const [customRange, setCustomRange] = useState<{ lower: number; upper: number } | null>(null);
  const [monitorSuccess, setMonitorSuccess] = useState(false);

  // Use real pool price from API. When unavailable, show warning instead of fabricating a price.
  const hasRealPrice = pool.price != null && pool.price > 0;
  const currentPrice = hasRealPrice ? pool.price! : 1; // placeholder for math when no price

  // Detect stable pair for range clamping
  const stableTokens = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'BUSD'];
  const isStable = stableTokens.some(s => pool.token0?.symbol?.includes(s)) &&
                   stableTokens.some(s => pool.token1?.symbol?.includes(s));

  // Dynamic mode config based on real volatility
  const modeConfig = getDynamicModeConfig(pool.volatilityAnn, isStable);
  const config = modeConfig[mode];

  // Check if this pool is already being monitored
  const { data: rangePositions } = useQuery({
    queryKey: ['ranges'],
    queryFn: fetchRangePositions,
  });

  const isMonitoring = rangePositions?.some(p => p.poolId === pool.externalId && p.isActive);

  // Create range monitor mutation
  const createMonitorMutation = useMutation({
    mutationFn: () => createRangePosition({
      poolId: pool.externalId,
      chain: pool.chain,
      poolAddress: pool.poolAddress,
      token0Symbol: pool.token0?.symbol ?? '???',
      token1Symbol: pool.token1?.symbol ?? '???',
      rangeLower,
      rangeUpper,
      entryPrice: currentPrice,
      capital,
      mode,
      alertThreshold: 5, // Alert when 5% from edge
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranges'] });
      setMonitorSuccess(true);
      setTimeout(() => setMonitorSuccess(false), 3000);
    },
  });

  // Delete range monitor mutation
  const deleteMonitorMutation = useMutation({
    mutationFn: (id: string) => deleteRangePosition(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranges'] });
    },
  });

  const handleMonitorRange = () => {
    if (isMonitoring) {
      const position = rangePositions?.find(p => p.poolId === pool.externalId && p.isActive);
      if (position) {
        deleteMonitorMutation.mutate(position.id);
      }
    } else {
      createMonitorMutation.mutate();
    }
  };

  // Calculate range based on mode or custom
  const rangeLower = customRange?.lower ?? currentPrice * (1 - config.rangePercent / 100);
  const rangeUpper = customRange?.upper ?? currentPrice * (1 + config.rangePercent / 100);

  const handleRangeChange = (lower: number, upper: number) => {
    setCustomRange({ lower, upper });
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setCustomRange(null); // Reset custom range when mode changes
  };

  const metrics = useMemo(() => {
    const rangeWidth = ((rangeUpper - rangeLower) / currentPrice) * 100;

    // --- LIVE CALCULATIONS BASED ON REAL POOL VOLATILITY ---
    // Uses pool.volatilityAnn from backend (calculated from OHLCV price data).
    // If unavailable, use type-aware estimate: stable pairs ~5%, crypto pairs ~50%
    const volAnn = (pool.volatilityAnn && pool.volatilityAnn > 0)
      ? pool.volatilityAnn
      : (isStable ? 0.05 : 0.50);

    // Time in range (7 days): probability price stays within [rangeLower, rangeUpper]
    // Uses lognormal model: P(out) = 2 * (1 - Φ(d)), where d = ln(upper/price) / (σ√T)
    const horizonDays = 7;
    const sqrtT = Math.sqrt(horizonDays / 365);
    const halfWidth = rangeUpper > currentPrice && currentPrice > 0
      ? Math.log(rangeUpper / currentPrice) / (volAnn * sqrtT)
      : 2; // fallback: ~95% in range
    // Standard normal CDF approximation (Abramowitz & Stegun)
    const absCDF = (z: number): number => {
      const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
      const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
      const sign = z < 0 ? -1 : 1;
      const x = Math.abs(z) / Math.sqrt(2);
      const t = 1.0 / (1.0 + p * x);
      const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
      return 0.5 * (1.0 + sign * y);
    };
    const probOut = Math.max(0, Math.min(1, 2 * (1 - absCDF(halfWidth))));
    const timeInRange = Math.round((1 - probOut) * 100);

    // Fee calculation: APR × portion of time in range
    const annualApr = score?.breakdown?.return?.aprEstimate ?? pool.apr ?? 0;
    const weeklyFeeRate = annualApr / 52;
    const feesPercent = weeklyFeeRate * (timeInRange / 100);

    // Impermanent Loss (IL): uses real volatility, not hardcoded values
    // Weekly IL ≈ 0.5 * (σ²) * T * concentration_factor
    // concentration_factor scales with how narrow the range is
    const widthFraction = rangeWidth / 100; // e.g. 0.10 for ±10%
    const concentrationFactor = widthFraction > 0 ? Math.min(5, 0.10 / widthFraction) : 1;
    const weeklyVol = volAnn * sqrtT;
    const ilPercent = Math.max(0, 0.5 * weeklyVol * weeklyVol * concentrationFactor * 100);

    // Gas costs: median estimates for entry + exit round trip (Feb 2026 averages)
    // These are static estimates — real gas varies with network congestion
    const gasMap: Record<string, number> = {
      ethereum: 30, arbitrum: 3, base: 1.5, optimism: 2, polygon: 0.5,
    };
    const gasEstimate = gasMap[pool.chain] ?? 5;
    const gasPercent = (gasEstimate / capital) * 100;

    const netReturn = feesPercent - ilPercent - gasPercent;

    return {
      feesPercent,
      feesUsd: (feesPercent / 100) * capital,
      ilPercent,
      ilUsd: (ilPercent / 100) * capital,
      timeInRange,
      gasEstimate,
      netReturnPercent: netReturn,
      netReturnUsd: (netReturn / 100) * capital,
      apr: netReturn * 52,
      rangeWidth,
      volAnn, // expose for UI display
    };
  }, [rangeLower, rangeUpper, capital, score, currentPrice, pool.chain, pool.volatilityAnn, mode]);

  const isPositive = metrics.netReturnPercent >= 0;

  // Uniswap URL — feeTier needs to be in bps (e.g. 3000 for 0.3%)
  const feeTierBps = pool.feeTier ? Math.round(pool.feeTier * 1000000) : undefined;
  const uniswapUrl = feeTierBps
    ? `https://app.uniswap.org/add/${pool.token0?.address ?? ''}/${pool.token1?.address ?? ''}/${feeTierBps}?chain=${pool.chain}`
    : `https://app.uniswap.org/add/${pool.token0?.address ?? ''}/${pool.token1?.address ?? ''}?chain=${pool.chain}`;

  return (
    <div className="space-y-6">
      {/* Pool Info Header */}
      <div className="card">
        <div className="card-body">
          {/* Token Prices - for data verification */}
          <div className="flex flex-wrap gap-3 mb-4 p-3 bg-dark-800 rounded-lg border border-dark-700">
            <div className="flex items-center gap-2">
              <span className="text-dark-400 text-sm">Preço {pool.token0?.symbol}:</span>
              <span className="font-mono font-semibold">
                {pool.token0?.priceUsd ? '$' + pool.token0.priceUsd.toFixed(4) : <span className="text-warning-400">API sem dados</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-dark-400 text-sm">Preço {pool.token1?.symbol}:</span>
              <span className="font-mono font-semibold">
                {pool.token1?.priceUsd ? '$' + pool.token1.priceUsd.toFixed(4) : <span className="text-warning-400">API sem dados</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-dark-400 text-sm">Fee Tier:</span>
              <span className="font-mono font-semibold">{pool.feeTier ? (pool.feeTier * 100).toFixed(2) + '%' : 'N/A'}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="stat-card">
              <div className="stat-label">TVL</div>
              <div className="stat-value">{'$' + formatNum(pool.tvl)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Volume 24h</div>
              <div className="stat-value">{'$' + formatNum(pool.volume24h)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">APR Base</div>
              <div className="stat-value text-success-400">{(score?.breakdown?.return?.aprEstimate ?? pool.apr ?? 0).toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Score</div>
              <div className="stat-value text-primary-400">{(score?.total ?? 50).toFixed(0)}/100</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Preco Atual</div>
              <div className="stat-value font-mono">
                {hasRealPrice
                  ? '$' + currentPrice.toFixed(2)
                  : <span className="text-warning-400 text-sm">Sem dados de preco</span>
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Chart */}
      <InteractiveChart
        currentPrice={currentPrice}
        minPrice={currentPrice * 0.5}
        maxPrice={currentPrice * 1.5}
        rangeLower={rangeLower}
        rangeUpper={rangeUpper}
        onRangeChange={handleRangeChange}
        token0Symbol={pool.token0?.symbol ?? '???'}
        token1Symbol={pool.token1?.symbol ?? '???'}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">⚙️ Configuracao</h2>
          </div>
          <div className="card-body space-y-6">
            <div>
              <label className="block text-sm text-dark-400 mb-2">Capital a Investir</label>
              <div className="flex items-center gap-2">
                <span className="text-dark-400 text-xl">$</span>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value) || 0)}
                  className="input text-2xl font-bold flex-1"
                  min={0}
                />
              </div>
              <div className="flex gap-2 mt-2">
                {[100, 500, 1000, 5000, 10000, 50000].map(val => (
                  <button
                    key={val}
                    onClick={() => setCapital(val)}
                    className={clsx(
                      'px-3 py-1 rounded text-xs transition-colors',
                      capital === val ? 'bg-primary-600 text-white' : 'bg-dark-700 hover:bg-dark-600'
                    )}
                  >
                    ${formatNum(val)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm text-dark-400 mb-3">Modo de Operacao</label>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(modeConfig) as Mode[]).map((m) => {
                  const cfg = modeConfig[m];
                  const isRecommended = (score?.recommendedMode ?? 'NORMAL') === m;
                  return (
                    <button
                      key={m}
                      onClick={() => handleModeChange(m)}
                      className={clsx(
                        'p-4 rounded-xl border-2 transition-all text-center relative',
                        mode === m
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-dark-600 hover:border-dark-500'
                      )}
                    >
                      {isRecommended && (
                        <span className="absolute -top-2 -right-2 text-xs bg-success-600 px-2 py-0.5 rounded-full">
                          ✓ Rec
                        </span>
                      )}
                      <div className="text-2xl mb-1">{cfg.emoji}</div>
                      <div className="font-semibold">{cfg.label}</div>
                      <div className="text-xs text-dark-400">{'±' + cfg.rangePercent + '% range'}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {customRange && (
              <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-warning-400">Range personalizado ativo</span>
                  <button
                    onClick={() => setCustomRange(null)}
                    className="text-xs bg-dark-600 px-2 py-1 rounded hover:bg-dark-500"
                  >
                    Resetar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">📈 Projecao (7 dias)</h2>
            <div className="flex items-center gap-1 text-success-400 text-sm">
              <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              Ao vivo
            </div>
          </div>
          <div className="card-body space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <TrendingUp className="w-4 h-4 text-success-400" />
                  <span className="text-xs">Fees Estimadas</span>
                </div>
                <div className="text-success-400 font-bold">{'+' + metrics.feesPercent.toFixed(2) + '%'}</div>
                <div className="text-xs text-dark-400">{'~$' + metrics.feesUsd.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <TrendingDown className="w-4 h-4 text-danger-400" />
                  <span className="text-xs">IL Estimada</span>
                </div>
                <div className="text-danger-400 font-bold">{'-' + metrics.ilPercent.toFixed(2) + '%'}</div>
                <div className="text-xs text-dark-400">{'~$' + metrics.ilUsd.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <Clock className="w-4 h-4" />
                  <span className="text-xs">Tempo no Range</span>
                </div>
                <div className="font-bold">{metrics.timeInRange.toFixed(0) + '%'}</div>
                <div className="text-xs text-dark-400">do periodo</div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 text-dark-400 mb-1">
                  <Fuel className="w-4 h-4" />
                  <span className="text-xs">Custo Gas ({pool.chain})</span>
                </div>
                <div className="font-bold">{'~$' + metrics.gasEstimate.toFixed(2)}</div>
                <div className="text-xs text-dark-400">entrada + saida</div>
              </div>
            </div>

            {/* Data source indicator */}
            <div className="text-xs text-dark-500 flex items-center gap-2 px-1">
              <span>Vol. anual: {(metrics.volAnn * 100).toFixed(0)}%</span>
              <span className={pool.volatilityAnn && pool.volatilityAnn > 0 ? 'text-success-500' : 'text-warning-500'}>
                {pool.volatilityAnn && pool.volatilityAnn > 0 ? '(OHLCV real)' : '(estimativa por tipo)'}
              </span>
              <span>| Range: ±{config.rangePercent.toFixed(1)}%</span>
              <span>| Gas: estimativa fixa</span>
            </div>

            <div className={clsx(
              'rounded-xl p-4 border',
              isPositive ? 'bg-success-500/10 border-success-500/30' : 'bg-danger-500/10 border-danger-500/30'
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className={clsx('w-5 h-5', isPositive ? 'text-success-400' : 'text-danger-400')} />
                  <span className="font-medium">Retorno Liquido (7d)</span>
                </div>
                <div className={clsx('text-2xl font-bold', isPositive ? 'text-success-400' : 'text-danger-400')}>
                  {(isPositive ? '+' : '') + metrics.netReturnPercent.toFixed(2) + '%'}
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-dark-400">{'Valor: ' + (isPositive ? '+' : '') + '$' + metrics.netReturnUsd.toFixed(2)}</span>
                <span className="text-primary-400 font-medium">{'APR: ~' + metrics.apr.toFixed(1) + '%'}</span>
              </div>
            </div>

            <div className="text-center text-xs text-dark-400 bg-dark-700/50 rounded-lg p-2">
              Retorno = Fees ({metrics.feesPercent.toFixed(2)}%) - IL ({metrics.ilPercent.toFixed(2)}%) - Gas ({((metrics.gasEstimate / capital) * 100).toFixed(2)}%)
            </div>

            {metrics.gasEstimate / capital > 0.1 && (
              <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 text-sm">
                <span className="text-warning-400 font-medium">⚠ Atenção: </span>
                <span className="text-dark-300">
                  Gas (~${metrics.gasEstimate.toFixed(0)}) representa {((metrics.gasEstimate / capital) * 100).toFixed(0)}% do capital.
                  {pool.chain === 'ethereum'
                    ? ' Considere Arbitrum/Base para reduzir custos.'
                    : ' Aumente o capital para diluir o custo de gas.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <a
                href={uniswapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary py-4 text-lg flex items-center justify-center gap-2"
              >
                🚀 Uniswap
                <ExternalLink className="w-4 h-4" />
              </a>

              <button
                onClick={handleMonitorRange}
                disabled={createMonitorMutation.isPending || deleteMonitorMutation.isPending}
                className={clsx(
                  'py-4 text-lg flex items-center justify-center gap-2 rounded-xl font-semibold transition-all',
                  isMonitoring
                    ? 'bg-success-600 hover:bg-success-500 text-white'
                    : monitorSuccess
                      ? 'bg-success-600 text-white'
                      : 'bg-warning-600 hover:bg-warning-500 text-white'
                )}
              >
                {createMonitorMutation.isPending || deleteMonitorMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {isMonitoring ? 'Removendo...' : 'Ativando...'}
                  </>
                ) : monitorSuccess ? (
                  <>
                    <Check className="w-5 h-5" />
                    Monitorando!
                  </>
                ) : isMonitoring ? (
                  <>
                    <BellRing className="w-5 h-5" />
                    Monitorando
                  </>
                ) : (
                  <>
                    <Bell className="w-5 h-5" />
                    Monitorar Range
                  </>
                )}
              </button>
            </div>

            {isMonitoring && (
              <div className="bg-success-500/10 border border-success-500/30 rounded-lg p-3 text-sm text-center">
                <BellRing className="w-4 h-4 inline mr-2 text-success-400" />
                <span className="text-success-400">
                  Voce sera notificado no Telegram quando o preco se aproximar das bordas do range!
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SimulationPage() {
  const { chain, address } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['pool', chain, address],
    queryFn: () => chain && address ? fetchPool(chain, address) : null,
    enabled: !!chain && !!address,
    retry: 2,
  });

  // Fetch pools for quick selection when no pool is selected
  const { data: pools } = useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchPools(),
    enabled: !chain || !address,
  });

  if (!chain || !address) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">🧪 Simulacao de Range</h1>
          <p className="text-dark-400 mt-1">Selecione uma pool para simular estrategias de liquidez</p>
        </div>

        {pools && pools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pools.slice(0, 6).map((item) => (
              <button
                key={item.pool.externalId}
                onClick={() => navigate('/simulation/' + item.pool.chain + '/' + (item.pool.poolAddress || item.pool.externalId || 'unknown'))}
                className="card hover:border-primary-500/50 transition-all text-left"
              >
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                        {(item.pool.token0?.symbol ?? '??').slice(0, 2)}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-success-500 to-success-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                        {(item.pool.token1?.symbol ?? '??').slice(0, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="font-semibold">{item.pool.token0?.symbol ?? '?'}/{item.pool.token1?.symbol ?? '?'}</div>
                      <div className="text-xs text-dark-400">{item.pool.protocol} - {item.pool.chain}</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-dark-400">TVL: ${formatNum(item.pool.tvl)}</span>
                    <span className="text-primary-400">Score: {item.score.total.toFixed(0)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-lg font-semibold mb-2">Carregando pools...</h3>
            <p className="text-dark-400">Ou va ao Radar para escolher uma pool</p>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-dark-700 rounded animate-pulse" />
        <div className="card animate-pulse p-8"><div className="h-64 bg-dark-700 rounded" /></div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card animate-pulse p-8"><div className="h-96 bg-dark-700 rounded" /></div>
          <div className="card animate-pulse p-8"><div className="h-96 bg-dark-700 rounded" /></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Pool nao encontrada</h3>
        <p className="text-dark-400 mb-4">Nao foi possivel carregar os dados desta pool</p>
        <button onClick={() => navigate('/radar')} className="btn btn-primary">
          Voltar ao Radar
        </button>
      </div>
    );
  }

  const poolName = (data.pool.token0?.symbol ?? '?') + '/' + (data.pool.token1?.symbol ?? '?');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold">🧪 {poolName}</h1>
          <p className="text-dark-400">{data.pool.protocol} - {data.pool.chain}</p>
        </div>
      </div>

      <FullSimulation pool={data.pool} score={data.score} />
    </div>
  );
}
