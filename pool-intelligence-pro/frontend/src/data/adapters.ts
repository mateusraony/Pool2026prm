/**
 * Adapters to convert Pool2026prm API types → pool-scout-pro UI types.
 * This replaces Supabase/mock data with real backend data.
 */

import type { Pool } from '@/types/pool';
import type { UnifiedPool, Score, RangeResult } from '@/api/client';
import { scoreToRisk, capitalize } from './constants';

/**
 * Convert a UnifiedPool + Score from the backend API into the UI Pool type.
 */
export function unifiedPoolToViewPool(
  p: UnifiedPool,
  score?: Score,
  ranges?: { DEFENSIVE: RangeResult; NORMAL: RangeResult; AGGRESSIVE: RangeResult },
): Pool {
  const totalScore = score?.total ?? p.healthScore ?? 50;
  const apr = p.aprTotal ?? p.aprFee ?? 0;
  const price = p.price ?? 1;
  const vol = p.volatilityAnn ?? 0.3;

  // Derive ranges: use backend ranges if available, otherwise estimate from volatility
  const defRange = ranges?.DEFENSIVE;
  const optRange = ranges?.NORMAL;
  const aggRange = ranges?.AGGRESSIVE;

  const defensiveMin = defRange?.lower ?? price * (1 - vol * 0.6);
  const defensiveMax = defRange?.upper ?? price * (1 + vol * 0.6);
  const optimizedMin = optRange?.lower ?? price * (1 - vol * 0.35);
  const optimizedMax = optRange?.upper ?? price * (1 + vol * 0.35);
  const aggressiveMin = aggRange?.lower ?? price * (1 - vol * 0.15);
  const aggressiveMax = aggRange?.upper ?? price * (1 + vol * 0.15);

  // Estimate metrics
  const fees24h = p.fees24hUSD ?? 0;
  const tvl = p.tvlUSD || p.tvl || 1;
  const feesEstimated = tvl > 0 ? (fees24h / tvl) : 0;
  const ilEstimated = vol > 0 ? vol * 0.05 : 0.02;
  const netReturn = Math.max(0, feesEstimated - ilEstimated / 30);
  const gasEstimated = (p.chain === 'ethereum') ? 15 : 1.5;
  const timeInRange = optRange
    ? Math.round((1 - (optRange.probOutOfRange ?? 0.3)) * 100)
    : Math.round(70 - vol * 30);

  return {
    id: p.id || p.poolAddress,
    dex: capitalize(p.protocol || 'Unknown'),
    network: capitalize(p.chain || 'Unknown'),
    pair: `${p.token0?.symbol ?? p.baseToken ?? '?'}/${p.token1?.symbol ?? p.quoteToken ?? '?'}`,
    token0: p.token0?.symbol ?? p.baseToken ?? '',
    token1: p.token1?.symbol ?? p.quoteToken ?? '',
    feeTier: (p.feeTier ?? 0.003) * 100,
    tvl: p.tvlUSD || p.tvl || 0,
    volume24h: p.volume24hUSD || p.volume24h || 0,
    volume7d: (p.volume24hUSD || p.volume24h || 0) * 7,
    apr,
    score: totalScore,
    risk: scoreToRisk(totalScore),
    priceMin: defensiveMin,
    priceMax: defensiveMax,
    currentPrice: price,
    ranges: {
      defensive: { min: defensiveMin, max: defensiveMax },
      optimized: { min: optimizedMin, max: optimizedMax },
      aggressive: { min: aggressiveMin, max: aggressiveMax },
    },
    metrics: {
      feesEstimated,
      ilEstimated,
      netReturn,
      gasEstimated,
      timeInRange: Math.max(0, Math.min(100, timeInRange)),
    },
    explanation: p.warnings?.length
      ? `Avisos: ${p.warnings.join('. ')}`
      : `Pool ${p.baseToken}/${p.quoteToken} na ${capitalize(p.chain)} via ${capitalize(p.protocol)}. TVL $${(tvl / 1e6).toFixed(1)}M. ${p.bluechip ? 'Blue chip.' : ''}`,
    poolAddress: p.poolAddress,
    chain: p.chain,
    protocol: p.protocol,
  };
}

/**
 * Convert the legacy { pool, score } format from fetchPools.
 */
export function legacyPoolToViewPool(item: {
  pool: { externalId: string; chain: string; protocol: string; poolAddress: string; token0: { symbol: string }; token1: { symbol: string }; tvl: number; volume24h: number; fees24h?: number; apr?: number; price?: number; feeTier?: number; volatilityAnn?: number };
  score: Score;
}): Pool {
  const p = item.pool;
  const s = item.score;
  const price = p.price ?? 1;
  const vol = p.volatilityAnn ?? 0.3;
  const totalScore = s.total ?? 50;

  return {
    id: p.externalId || p.poolAddress,
    dex: capitalize(p.protocol),
    network: capitalize(p.chain),
    pair: `${p.token0.symbol}/${p.token1.symbol}`,
    token0: p.token0.symbol,
    token1: p.token1.symbol,
    feeTier: (p.feeTier ?? 0.003) * 100,
    tvl: p.tvl || 0,
    volume24h: p.volume24h || 0,
    volume7d: (p.volume24h || 0) * 7,
    apr: p.apr ?? 0,
    score: totalScore,
    risk: scoreToRisk(totalScore),
    priceMin: price * (1 - vol * 0.6),
    priceMax: price * (1 + vol * 0.6),
    currentPrice: price,
    ranges: {
      defensive: { min: price * (1 - vol * 0.6), max: price * (1 + vol * 0.6) },
      optimized: { min: price * (1 - vol * 0.35), max: price * (1 + vol * 0.35) },
      aggressive: { min: price * (1 - vol * 0.15), max: price * (1 + vol * 0.15) },
    },
    metrics: {
      feesEstimated: p.tvl > 0 ? (p.fees24h ?? 0) / p.tvl : 0,
      ilEstimated: vol > 0 ? vol * 0.05 : 0.02,
      netReturn: Math.max(0, (p.apr ?? 0) / 365 / 100),
      gasEstimated: p.chain === 'ethereum' ? 15 : 1.5,
      timeInRange: Math.round(70 - vol * 30),
    },
    explanation: s.isSuspect
      ? `Atenção: ${s.suspectReason || 'Pool com indicadores suspeitos'}`
      : `Score ${totalScore}. Modo recomendado: ${s.recommendedMode}.`,
    poolAddress: p.poolAddress,
    chain: p.chain,
    protocol: p.protocol,
  };
}
