/**
 * Pool Intelligence Service
 * Converts raw Pool data into UnifiedPool format using institutional calculations.
 * Provides token autocomplete and pool enrichment.
 */

import { Pool, UnifiedPool } from '../types/index.js';
import {
  calcAprFee,
  calcHealthScore,
  calcAprAdjusted,
  calcVolatilityProxy,
  inferPoolType,
  isBluechip,
  PoolType,
} from './calc.service.js';
import { logService } from './log.service.js';

// In-memory token registry for autocomplete
const tokenRegistry = new Map<string, string>(); // symbol → symbol (normalized)

export function enrichToUnifiedPool(
  pool: Pool,
  opts?: { warnings?: string[]; updatedAt?: Date }
): UnifiedPool {
  const warnings = opts?.warnings ?? [];
  const updatedAt = opts?.updatedAt ?? new Date();

  // Extended fields (may be on Pool if adapter provided them)
  const p = pool as Pool & {
    volume1h?: number; volume5m?: number;
    fees1h?: number; fees5m?: number;
    poolType?: string; tickSpacing?: number; bluechip?: boolean;
  };

  const poolType = (p.poolType as PoolType | undefined) ?? inferPoolType({
    token0Symbol: pool.token0.symbol,
    token1Symbol: pool.token1.symbol,
    protocol: pool.protocol,
    feeTier: pool.feeTier,
  });

  const volume1h = p.volume1h ?? null;
  const volume5m = p.volume5m ?? null;
  const fees1h = p.fees1h ?? null;
  const fees5m = p.fees5m ?? null;

  // APR from fees
  const aprRes = calcAprFee({
    fees24h: pool.fees24h,
    fees1h,
    fees5m,
    tvl: pool.tvl,
  });

  const aprFee = aprRes.feeAPR;
  const aprIncentive = 0; // No incentive data yet
  // Use computed fee APR when available; otherwise fall back to adapter-provided APR/APY
  // (e.g. DefiLlama provides APY directly even when fees24h is unavailable)
  const aprTotal = aprFee != null
    ? aprFee + aprIncentive
    : (pool.apr != null ? pool.apr : null);

  // Volatility: prefer adapter-provided value (real, from historical OHLCV),
  // fall back to proxy estimate only if no real data available.
  let finalVolAnn: number;
  if (pool.volatilityAnn != null && pool.volatilityAnn > 0) {
    // Real volatility from adapter (TheGraph poolHourData or GeckoTerminal OHLCV)
    finalVolAnn = pool.volatilityAnn;
  } else {
    // Proxy fallback: estimate from APR-derived price difference
    const defaultVol = 0.20;
    const { volAnn: computedVol } = calcVolatilityProxy(
      pool.price ?? 1,
      pool.price != null ? pool.price * (1 + (pool.apr || 0) / 100 / 365) : 1
    );
    finalVolAnn = computedVol > 0.05 ? computedVol : defaultVol;
  }

  // Health score
  const healthResult = calcHealthScore({
    tvl: pool.tvl,
    volume1h,
    fees1h,
    volAnn: finalVolAnn,
    poolType,
    updatedAt,
    aprTotal,
    warnings,
  });

  const aprAdjusted = aprTotal != null ? calcAprAdjusted(aprTotal, healthResult.penaltyTotal) : null;

  // Ratio: capital efficiency (volume1h / tvl)
  const ratio = pool.tvl > 0 && volume1h != null ? volume1h / pool.tvl : 0;

  // Register tokens for autocomplete
  const t0sym = pool.token0.symbol.toUpperCase();
  const t1sym = pool.token1.symbol.toUpperCase();
  if (t0sym.length <= 10 && t0sym.length > 0) tokenRegistry.set(t0sym, t0sym);
  if (t1sym.length <= 10 && t1sym.length > 0) tokenRegistry.set(t1sym, t1sym);

  const unified: UnifiedPool = {
    id: `${pool.chain}_${pool.poolAddress}`,
    chain: pool.chain,
    protocol: pool.protocol,
    poolAddress: pool.poolAddress,
    poolType: poolType as 'CL' | 'V2' | 'STABLE',
    baseToken: pool.token0.symbol,
    quoteToken: pool.token1.symbol,
    token0: pool.token0,
    token1: pool.token1,
    tvlUSD: pool.tvl,
    price: pool.price,
    feeTier: pool.feeTier ?? 0,
    volume5mUSD: volume5m,
    volume1hUSD: volume1h,
    volume24hUSD: pool.volume24h,
    fees5mUSD: fees5m,
    fees1hUSD: fees1h,
    fees24hUSD: aprRes.fees24hUSD,
    aprFee,
    aprIncentive,
    aprTotal,
    aprAdjusted,
    volatilityAnn: finalVolAnn,
    ratio,
    healthScore: healthResult.score,
    penaltyTotal: healthResult.penaltyTotal,
    bluechip: p.bluechip ?? isBluechip(pool.token0.symbol, pool.token1.symbol),
    warnings,
    updatedAt: updatedAt.toISOString(),
    // Backward compat
    apr: pool.apr,
    tvl: pool.tvl,
    volume24h: pool.volume24h,
    fees24h: pool.fees24h,
  };

  return unified;
}

export function getTokenList(): string[] {
  return Array.from(tokenRegistry.keys()).sort();
}

export function applyPoolFilters(pools: UnifiedPool[], filters: {
  chain?: string;
  protocol?: string;
  token?: string;
  bluechip?: boolean;
  minTVL?: number;
  minHealth?: number;
  poolType?: string;
  feeTier?: number;
}): UnifiedPool[] {
  let result = pools;

  if (filters.chain) {
    result = result.filter(p => p.chain === filters.chain);
  }
  if (filters.protocol) {
    const proto = filters.protocol.toLowerCase();
    result = result.filter(p => p.protocol.toLowerCase().includes(proto));
  }
  if (filters.token) {
    const tok = filters.token.toUpperCase();
    result = result.filter(p =>
      p.baseToken.toUpperCase().includes(tok) ||
      p.quoteToken.toUpperCase().includes(tok)
    );
  }
  if (filters.bluechip === true) {
    result = result.filter(p => p.bluechip);
  }
  if (filters.minTVL != null) {
    result = result.filter(p => p.tvlUSD >= filters.minTVL!);
  }
  if (filters.minHealth != null) {
    result = result.filter(p => p.healthScore >= filters.minHealth!);
  }
  if (filters.poolType) {
    result = result.filter(p => p.poolType === filters.poolType!.toUpperCase());
  }

  return result;
}

type SortKey = 'tvl' | 'apr' | 'aprFee' | 'aprAdjusted' | 'volume1h' | 'volume5m' | 'fees1h' | 'fees5m' | 'healthScore' | 'volatilityAnn' | 'ratio';

export function sortPools(pools: UnifiedPool[], sortBy: SortKey, direction: 'asc' | 'desc'): UnifiedPool[] {
  const keyMap: Record<SortKey, (p: UnifiedPool) => number> = {
    tvl: p => p.tvlUSD,
    apr: p => p.aprTotal ?? 0,
    aprFee: p => p.aprFee ?? 0,
    aprAdjusted: p => p.aprAdjusted ?? 0,
    volume1h: p => p.volume1hUSD ?? 0,
    volume5m: p => p.volume5mUSD ?? 0,
    fees1h: p => p.fees1hUSD ?? 0,
    fees5m: p => p.fees5mUSD ?? 0,
    healthScore: p => p.healthScore,
    volatilityAnn: p => p.volatilityAnn,
    ratio: p => p.ratio,
  };

  const getter = keyMap[sortBy] || keyMap.tvl;
  return [...pools].sort((a, b) => {
    const diff = getter(a) - getter(b);
    return direction === 'desc' ? -diff : diff;
  });
}

export function buildTop3Recommendations(pools: UnifiedPool[]): {
  pool: UnifiedPool;
  reason: string;
  mode: string;
}[] {
  const eligible = pools.filter(p => !p.warnings.some(w => w.toLowerCase().includes('honeypot')));

  if (eligible.length === 0) return [];

  // Sort by health score desc, take top 3
  const sorted = [...eligible].sort((a, b) => b.healthScore - a.healthScore).slice(0, 3);

  return sorted.map((pool, i) => {
    const rank = i + 1;
    let reason = '';
    let mode = 'NORMAL';

    if (pool.healthScore >= 75) {
      mode = 'AGGRESSIVE';
      reason = `Alta saúde (score ${pool.healthScore}/100) com TVL $${(pool.tvlUSD / 1e6).toFixed(2)}M. APR estimado ${pool.aprFee?.toFixed(1) ?? 'N/A'}%.`;
    } else if (pool.healthScore >= 55) {
      mode = 'NORMAL';
      reason = `Score ${pool.healthScore}/100. Boa relação risco/retorno com ${pool.bluechip ? 'tokens blue-chip' : 'liquidez adequada'}.`;
    } else {
      mode = 'DEFENSIVE';
      reason = `Score ${pool.healthScore}/100. Posicionamento conservador recomendado. Monitorar TVL e volume.`;
    }

    return { pool, reason, mode };
  });
}

const poolIntelligenceService = {
  enrichToUnifiedPool,
  getTokenList,
  applyPoolFilters,
  sortPools,
  buildTop3Recommendations,
};

export { poolIntelligenceService };
