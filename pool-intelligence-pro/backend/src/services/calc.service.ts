/**
 * Institutional Calculation Service
 * Implements exact formulas for APR, Volatility, Health Score,
 * Range Recommendation, Fee Estimation, and IL Risk.
 */

import { logService } from './log.service.js';

// ============================================================
// TYPES
// ============================================================

export type PoolType = 'CL' | 'V2' | 'STABLE';
export type RiskMode = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

export interface PricePoint {
  price: number;
  timestamp: Date;
}

export interface AprResult {
  feeAPR: number | null;       // annualized fee APR
  source: 'fees24h' | 'fees1h' | 'fees5m' | 'estimated';
  fees24hUSD: number | null;   // used or estimated
}

export interface VolatilityResult {
  volAnn: number;     // annualized volatility (0..3)
  method: 'log_returns' | 'proxy';
  dataPoints: number;
}

export interface HealthScoreResult {
  score: number;         // 0..100
  penaltyTotal: number;  // 0.15..1
  breakdown: {
    tvlScore: number;
    volScore: number;
    feeYieldScore: number;
    stabilityScore: number;
    freshnessScore: number;
    p1_liquidity: number;
    p2_activity: number;
    p3_riskFlags: number;
    p4_spikeTrap: number;
    base: number;
  };
  warnings: string[];
}

export interface RangeResult {
  lower: number;
  upper: number;
  widthPct: number;          // symmetric half-width
  lowerTick?: number;        // if tickSpacing provided
  upperTick?: number;
  probOutOfRange: number;    // IL risk probability
  mode: RiskMode;
  horizonDays: number;
}

export interface FeeEstimate {
  expectedFees24h: number;
  expectedFees7d: number;
  expectedFees30d: number;
  userLiquidityShare: number;
  k_active: number;
}

export interface ILRiskResult {
  probOutOfRange: number;  // 0..1
  ilRiskScore: number;     // 0..1
  horizonDays: number;
}

// ============================================================
// HELPERS
// ============================================================

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Standard Normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ============================================================
// 1. APR FROM FEES
// ============================================================

export function calcAprFee(params: {
  fees24h?: number | null;
  fees1h?: number | null;
  fees5m?: number | null;
  tvl: number;
}): AprResult {
  const { fees24h, fees1h, fees5m, tvl } = params;

  if (!tvl || tvl <= 0) {
    return { feeAPR: null, source: 'fees24h', fees24hUSD: null };
  }

  if (fees24h != null && fees24h > 0) {
    return {
      feeAPR: (fees24h / tvl) * 365 * 100,
      source: 'fees24h',
      fees24hUSD: fees24h,
    };
  }

  if (fees1h != null && fees1h > 0) {
    const est = fees1h * 24;
    return {
      feeAPR: (est / tvl) * 365 * 100,
      source: 'fees1h',
      fees24hUSD: est,
    };
  }

  if (fees5m != null && fees5m > 0) {
    const est = fees5m * (24 * 60 / 5);
    return {
      feeAPR: (est / tvl) * 365 * 100,
      source: 'fees5m',
      fees24hUSD: est,
    };
  }

  return { feeAPR: null, source: 'estimated', fees24hUSD: null };
}

// ============================================================
// 2. VOLATILITY ANNUALIZED
// ============================================================

export function calcVolatilityAnn(
  pricePoints: PricePoint[],
  interval: 'hourly' | '5m' = 'hourly'
): VolatilityResult {
  if (pricePoints.length < 3) {
    // Not enough data to compute real volatility — return 0 so consumers know
    // this is NOT a real measurement and can apply their own fallback
    return { volAnn: 0, method: 'proxy', dataPoints: pricePoints.length };
  }

  const sorted = [...pricePoints].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const logReturns: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price;
    const curr = sorted[i].price;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  if (logReturns.length < 2) {
    return { volAnn: 0, method: 'proxy', dataPoints: pricePoints.length };
  }

  const sigma = stdev(logReturns);
  const periodsPerYear = interval === 'hourly' ? 24 * 365 : 12 * 24 * 365;
  const volAnn = clamp(sigma * Math.sqrt(periodsPerYear), 0.01, 10);

  return { volAnn, method: 'log_returns', dataPoints: pricePoints.length };
}

/** Proxy volatility using current vs 1h-ago price */
export function calcVolatilityProxy(priceNow: number, price1hAgo: number): VolatilityResult {
  if (!price1hAgo || price1hAgo <= 0 || !priceNow || priceNow <= 0) {
    // No valid prices — return 0 so caller knows this is not a real measurement
    return { volAnn: 0, method: 'proxy', dataPoints: 0 };
  }
  const volAnn = clamp(
    Math.abs(Math.log(priceNow / price1hAgo)) * Math.sqrt(24 * 365),
    0.05,
    3.0
  );
  return { volAnn, method: 'proxy', dataPoints: 2 };
}

// ============================================================
// 3. INSTITUTIONAL HEALTH SCORE
// ============================================================

export function calcHealthScore(params: {
  tvl: number;
  volume1h?: number | null;
  fees1h?: number | null;
  volAnn: number;
  poolType: PoolType;
  updatedAt: Date;
  aprTotal?: number | null;
  warnings?: string[];
}): HealthScoreResult {
  const { tvl, volume1h, fees1h, volAnn, poolType, updatedAt, aprTotal, warnings = [] } = params;

  // tvlScore: log10 scale [10k..100M] → [0..1]
  const tvlScore = clamp((Math.log10(Math.max(tvl, 1)) - 4) / (8 - 4), 0, 1);

  // volScore: log10 of volume1h [1k..10M/h] → [0..1]
  const vol1h = volume1h ?? 0;
  const volScore = clamp((Math.log10(Math.max(vol1h, 1) + 1) - 3) / (7 - 3), 0, 1);

  // feeYieldScore: fees1h / tvl * 1000
  const f1h = fees1h ?? 0;
  const feeYieldScore = clamp((f1h / Math.max(tvl, 1)) * 1000, 0, 1);

  // stabilityScore
  let stabilityScore: number;
  if (poolType === 'STABLE') {
    stabilityScore = clamp(1 - (volAnn / 0.35), 0, 1);
  } else {
    stabilityScore = clamp(1 - (volAnn / 1.20), 0, 1);
  }

  // freshnessScore: how recently updated (in minutes)
  const ageMinutes = (Date.now() - updatedAt.getTime()) / 60000;
  const freshnessScore = Math.exp(-ageMinutes / 10);

  // Penalties
  const p1_liquidity = clamp(tvlScore * 0.70 + 0.30, 0.30, 1.00);
  const p2_activity = clamp(volScore * 0.70 + 0.30, 0.30, 1.00);

  // p3_riskFlags: from warnings
  let p3_riskFlags = 1.00;
  const severeWarnings = ['honeypot', 'not verified', 'rug'];
  const moderateWarnings = ['liquidity low', 'unverified', 'new pool', 'suspect'];

  for (const w of warnings) {
    const wl = w.toLowerCase();
    if (severeWarnings.some(sw => wl.includes(sw))) {
      p3_riskFlags = Math.min(p3_riskFlags, 0.35);
    } else if (moderateWarnings.some(mw => wl.includes(mw))) {
      p3_riskFlags = Math.min(p3_riskFlags, 0.60);
    }
  }

  // p4_spikeTrap
  const p4_spikeTrap = (aprTotal != null && aprTotal > 300 && vol1h < 50000) ? 0.55 : 1.0;

  const penaltyTotal = clamp(p1_liquidity * p2_activity * p3_riskFlags * p4_spikeTrap, 0.15, 1.00);

  const base = (
    0.35 * tvlScore +
    0.30 * volScore +
    0.20 * feeYieldScore +
    0.10 * stabilityScore +
    0.05 * freshnessScore
  );

  const score = Math.round(100 * base * penaltyTotal);

  return {
    score: clamp(score, 0, 100),
    penaltyTotal,
    breakdown: {
      tvlScore, volScore, feeYieldScore, stabilityScore, freshnessScore,
      p1_liquidity, p2_activity, p3_riskFlags, p4_spikeTrap, base,
    },
    warnings,
  };
}

// ============================================================
// 4. APR ADJUSTED (realistic, anti-illusion)
// ============================================================

export function calcAprAdjusted(aprTotal: number, penaltyTotal: number): number {
  return aprTotal * penaltyTotal;
}

// ============================================================
// 5. RANGE RECOMMENDATION (for CL pools)
// ============================================================

function priceToTick(price: number): number {
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

function roundTickToSpacing(tick: number, spacing: number, dir: 'floor' | 'ceil'): number {
  if (dir === 'floor') return Math.floor(tick / spacing) * spacing;
  return Math.ceil(tick / spacing) * spacing;
}

export function calcRangeRecommendation(params: {
  price: number;
  volAnn: number;
  horizonDays?: number;
  riskMode: RiskMode;
  tickSpacing?: number;
  poolType?: PoolType;
}): RangeResult {
  const { price, volAnn, horizonDays = 7, riskMode, tickSpacing, poolType = 'CL' } = params;

  const zMap: Record<RiskMode, number> = { DEFENSIVE: 0.8, NORMAL: 1.2, AGGRESSIVE: 1.8 };
  const z = zMap[riskMode];

  let widthPct = clamp(z * volAnn * Math.sqrt(horizonDays / 365), 0.003, 0.45);
  if (poolType === 'STABLE') {
    widthPct = Math.min(widthPct, 0.03);
  }

  const lower = price * (1 - widthPct);
  const upper = price * (1 + widthPct);

  // IL probability using lognormal
  const sigma = volAnn;
  const sqrtT = Math.sqrt(horizonDays / 365);
  let probOut = 0;
  if (sigma > 0 && sqrtT > 0) {
    const dUpper = Math.log(upper / price) / (sigma * sqrtT);
    probOut = 2 * (1 - normalCDF(dUpper));
    probOut = clamp(probOut, 0, 1);
  }

  let lowerTick: number | undefined;
  let upperTick: number | undefined;
  if (tickSpacing && tickSpacing > 0 && lower > 0 && upper > 0) {
    lowerTick = roundTickToSpacing(priceToTick(lower), tickSpacing, 'floor');
    upperTick = roundTickToSpacing(priceToTick(upper), tickSpacing, 'ceil');
  }

  return { lower, upper, widthPct, lowerTick, upperTick, probOutOfRange: probOut, mode: riskMode, horizonDays };
}

// ============================================================
// 6. USER FEE ESTIMATE
// ============================================================

export function calcUserFees(params: {
  tvl: number;
  fees24h?: number | null;
  fees1h?: number | null;
  fees5m?: number | null;
  userCapital: number;
  riskMode: RiskMode;
}): FeeEstimate {
  const { tvl, userCapital, riskMode } = params;

  const kMap: Record<RiskMode, number> = { DEFENSIVE: 0.55, NORMAL: 0.75, AGGRESSIVE: 0.95 };
  const k_active = kMap[riskMode];

  const userLiquidityShare = tvl > 0 ? userCapital / tvl : 0;

  const aprRes = calcAprFee({ fees24h: params.fees24h, fees1h: params.fees1h, fees5m: params.fees5m, tvl });
  const fees24hUSD = aprRes.fees24hUSD ?? 0;

  const expectedFees24h = fees24hUSD * userLiquidityShare * k_active;

  return {
    expectedFees24h,
    expectedFees7d: expectedFees24h * 7,
    expectedFees30d: expectedFees24h * 30,
    userLiquidityShare,
    k_active,
  };
}

// ============================================================
// 7. IL RISK
// ============================================================

export function calcILRisk(params: {
  price: number;
  rangeLower: number;
  rangeUpper: number;
  volAnn: number;
  horizonDays: number;
}): ILRiskResult {
  const { price, rangeLower, rangeUpper, volAnn, horizonDays } = params;
  const sqrtT = Math.sqrt(horizonDays / 365);

  let probOut = 0;
  if (volAnn > 0 && sqrtT > 0 && rangeUpper > price) {
    const dUpper = Math.log(rangeUpper / price) / (volAnn * sqrtT);
    probOut = 2 * (1 - normalCDF(dUpper));
    probOut = clamp(probOut, 0, 1);
  }

  return {
    probOutOfRange: probOut,
    ilRiskScore: probOut,
    horizonDays,
  };
}

// ============================================================
// 8. INFER POOL TYPE
// ============================================================

export function inferPoolType(params: {
  token0Symbol: string;
  token1Symbol: string;
  protocol?: string;
  feeTier?: number;
}): PoolType {
  const { token0Symbol, token1Symbol, protocol, feeTier } = params;
  const stableTokens = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'GUSD', 'USDP', 'BUSD', 'TUSD', 'crvUSD'];

  const isStable0 = stableTokens.some(t => token0Symbol.toUpperCase().includes(t));
  const isStable1 = stableTokens.some(t => token1Symbol.toUpperCase().includes(t));

  if (isStable0 && isStable1) return 'STABLE';
  if (protocol?.toLowerCase().includes('v2') || protocol?.toLowerCase().includes('sushi')) return 'V2';
  if (feeTier != null) return 'CL'; // CL pools have fee tiers
  return 'V2';
}

// ============================================================
// 9. BLUECHIP DETECTION
// ============================================================

const BLUECHIP_TOKENS = new Set([
  'ETH', 'WETH', 'BTC', 'WBTC', 'USDC', 'USDT', 'DAI', 'LINK',
  'UNI', 'ARB', 'OP', 'MATIC', 'WMATIC', 'SOL', 'AVAX', 'BNB',
  'AAVE', 'CRV', 'LDO', 'MKR', 'COMP', 'SNX',
]);

export function isBluechip(token0Symbol: string, token1Symbol: string): boolean {
  return BLUECHIP_TOKENS.has(token0Symbol.toUpperCase()) &&
    BLUECHIP_TOKENS.has(token1Symbol.toUpperCase());
}

const calcService = {
  calcAprFee,
  calcVolatilityAnn,
  calcVolatilityProxy,
  calcHealthScore,
  calcAprAdjusted,
  calcRangeRecommendation,
  calcUserFees,
  calcILRisk,
  inferPoolType,
  isBluechip,
};

export { calcService };
