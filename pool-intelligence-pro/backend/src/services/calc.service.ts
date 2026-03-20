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
    // Proxy: not enough data
    return { volAnn: 0.15, method: 'proxy', dataPoints: pricePoints.length };
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
    return { volAnn: 0.15, method: 'proxy', dataPoints: pricePoints.length };
  }

  const sigma = stdev(logReturns);
  const periodsPerYear = interval === 'hourly' ? 24 * 365 : 12 * 24 * 365;
  const volAnn = clamp(sigma * Math.sqrt(periodsPerYear), 0.01, 10);

  return { volAnn, method: 'log_returns', dataPoints: pricePoints.length };
}

/** Proxy volatility using current vs 1h-ago price */
export function calcVolatilityProxy(priceNow: number, price1hAgo: number): VolatilityResult {
  if (!price1hAgo || price1hAgo <= 0 || !priceNow || priceNow <= 0) {
    return { volAnn: 0.15, method: 'proxy', dataPoints: 0 };
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

// ============================================================
// 10. POSITION P&L CALCULATION
// ============================================================

export interface PositionPnL {
  feesAccrued: number;      // estimated fees earned in USD
  ilActual: number;         // actual impermanent loss in USD
  pnl: number;              // net P&L in USD (fees - IL)
  pnlPercent: number;       // net P&L as % of capital
  daysActive: number;       // days since position opened
  feeAPR: number;           // annualized fee return %
  hodlValue: number;        // value if user just held tokens (HODL comparison)
  lpValue: number;          // current estimated LP value
}

/**
 * Calculate real P&L for a concentrated liquidity position.
 *
 * Fees are estimated from pool fee data + time active.
 * IL is calculated from entry price vs current price using the CL IL formula.
 * HODL value assumes 50/50 token split at entry.
 */
export function calcPositionPnL(params: {
  capital: number;
  entryPrice: number;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  tvl: number;
  fees24h: number;
  createdAt: Date | string;
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
}): PositionPnL {
  const { capital, entryPrice, currentPrice, rangeLower, rangeUpper, tvl, fees24h, mode } = params;

  // Days active
  const created = typeof params.createdAt === 'string' ? new Date(params.createdAt) : params.createdAt;
  const daysActive = Math.max(0.01, (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24));

  // --- Fee estimation ---
  const kMap: Record<string, number> = { DEFENSIVE: 0.55, NORMAL: 0.75, AGGRESSIVE: 0.95 };
  const k_active = kMap[mode] ?? 0.75;
  const userShare = tvl > 0 ? capital / tvl : 0;
  const dailyFees = fees24h * userShare * k_active;
  const feesAccrued = dailyFees * daysActive;

  // --- IL calculation — usa calcIL() para garantir consistência com o resto do sistema
  const ilResult = calcIL({ entryPrice, currentPrice, rangeLower, rangeUpper, poolType: 'CL' });
  const ilFraction = ilResult.ilPercent / 100; // ilPercent já é negativo (ex: -3.5%)
  const ilActual = Math.abs(ilFraction * capital);

  // --- HODL comparison ---
  // Assume 50/50 split at entry: half in token0, half in token1 (quote)
  // token0 value changes with price, token1 stays
  const priceRatio = currentPrice / entryPrice;
  const hodlValue = (capital / 2) * priceRatio + (capital / 2);

  // LP value = capital + fees - IL
  const lpValue = capital + feesAccrued - ilActual;

  // --- Net P&L ---
  const pnl = feesAccrued - ilActual;
  const pnlPercent = capital > 0 ? (pnl / capital) * 100 : 0;

  // Annualized fee return
  const feeAPR = daysActive > 0 && capital > 0
    ? (feesAccrued / capital) * (365 / daysActive) * 100
    : 0;

  return {
    feesAccrued: Math.round(feesAccrued * 100) / 100,
    ilActual: Math.round(ilActual * 100) / 100,
    pnl: Math.round(pnl * 100) / 100,
    pnlPercent: Math.round(pnlPercent * 100) / 100,
    daysActive: Math.round(daysActive * 10) / 10,
    feeAPR: Math.round(feeAPR * 10) / 10,
    hodlValue: Math.round(hodlValue * 100) / 100,
    lpValue: Math.round(lpValue * 100) / 100,
  };
}

// ============================================================
// 11. MONTE CARLO SIMULATION
// ============================================================

export interface MonteCarloResult {
  scenarios: number;
  horizonDays: number;
  percentiles: {
    p5: MonteCarloOutcome;
    p25: MonteCarloOutcome;
    p50: MonteCarloOutcome;
    p75: MonteCarloOutcome;
    p95: MonteCarloOutcome;
  };
  probProfit: number;        // % of scenarios where LP is profitable
  probOutOfRange: number;    // % of scenarios where price exits range
  avgPnl: number;            // average PnL across all scenarios
  worstCase: MonteCarloOutcome;
  bestCase: MonteCarloOutcome;
  distribution: { bucket: string; count: number }[]; // histogram of returns
}

export interface MonteCarloOutcome {
  finalPrice: number;
  priceChange: number;       // % change from entry
  feesEarned: number;
  ilLoss: number;
  pnl: number;
  pnlPercent: number;
  isInRange: boolean;
}

/** Box-Muller transform: generate standard normal random variate */
function randNormal(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Run Monte Carlo simulation for a concentrated liquidity position.
 * Simulates Geometric Brownian Motion for price, then calculates IL + fees for each path.
 */
export function calcMonteCarlo(params: {
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  capital: number;
  volAnn: number;
  fees24h: number;
  tvl: number;
  horizonDays: number;
  scenarios?: number;
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
}): MonteCarloResult {
  const {
    currentPrice, rangeLower, rangeUpper, capital,
    volAnn, fees24h, tvl, horizonDays, mode,
  } = params;
  const numScenarios = Math.min(params.scenarios || 1000, 5000);

  const kMap: Record<string, number> = { DEFENSIVE: 0.55, NORMAL: 0.75, AGGRESSIVE: 0.95 };
  const k_active = kMap[mode] ?? 0.75;
  const userShare = tvl > 0 ? capital / tvl : 0;
  const dailyFees = fees24h * userShare * k_active;

  const dailyVol = volAnn / Math.sqrt(365);
  const dailyDrift = -0.5 * dailyVol * dailyVol; // risk-neutral drift

  const outcomes: MonteCarloOutcome[] = [];

  for (let s = 0; s < numScenarios; s++) {
    // Simulate price path using GBM
    let price = currentPrice;
    let daysInRange = 0;

    for (let d = 0; d < horizonDays; d++) {
      const z = randNormal();
      price = price * Math.exp(dailyDrift + dailyVol * z);
      if (price >= rangeLower && price <= rangeUpper) {
        daysInRange++;
      }
    }

    // Fees earned (only for days in range)
    const feesEarned = dailyFees * daysInRange;

    // IL calculation — usa calcIL() com tratamento correto de boundary price
    const isInRange = price >= rangeLower && price <= rangeUpper;
    const ilResult = calcIL({ entryPrice: currentPrice, currentPrice: price, rangeLower, rangeUpper, poolType: 'CL' });
    const ilLoss = Math.abs(ilResult.ilPercent / 100 * capital);
    const pnl = feesEarned - ilLoss;
    const pnlPercent = capital > 0 ? (pnl / capital) * 100 : 0;

    outcomes.push({
      finalPrice: Math.round(price * 10000) / 10000,
      priceChange: Math.round(((price - currentPrice) / currentPrice) * 10000) / 100,
      feesEarned: Math.round(feesEarned * 100) / 100,
      ilLoss: Math.round(ilLoss * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      isInRange,
    });
  }

  // Sort by PnL for percentile extraction
  outcomes.sort((a, b) => a.pnl - b.pnl);

  const getPercentile = (p: number): MonteCarloOutcome => {
    const idx = Math.min(Math.floor(p / 100 * numScenarios), numScenarios - 1);
    return outcomes[idx];
  };

  const probProfit = Math.round((outcomes.filter(o => o.pnl > 0).length / numScenarios) * 10000) / 100;
  const probOutOfRange = Math.round((outcomes.filter(o => !o.isInRange).length / numScenarios) * 10000) / 100;
  const avgPnl = Math.round(outcomes.reduce((s, o) => s + o.pnl, 0) / numScenarios * 100) / 100;

  // Build histogram of returns (10 buckets)
  const pnlValues = outcomes.map(o => o.pnlPercent);
  const minPnl = Math.min(...pnlValues);
  const maxPnl = Math.max(...pnlValues);
  const bucketSize = (maxPnl - minPnl) / 10 || 1;
  const distribution: { bucket: string; count: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const lo = minPnl + i * bucketSize;
    const hi = lo + bucketSize;
    const label = `${lo.toFixed(1)}%`;
    const count = outcomes.filter(o => o.pnlPercent >= lo && (i === 9 ? o.pnlPercent <= hi : o.pnlPercent < hi)).length;
    distribution.push({ bucket: label, count });
  }

  return {
    scenarios: numScenarios,
    horizonDays,
    percentiles: {
      p5: getPercentile(5),
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p95: getPercentile(95),
    },
    probProfit,
    probOutOfRange,
    avgPnl,
    worstCase: outcomes[0],
    bestCase: outcomes[numScenarios - 1],
    distribution,
  };
}

// ============================================================
// 12. BACKTESTING
// ============================================================

export interface BacktestResult {
  periodDays: number;
  totalFees: number;
  totalIL: number;
  netPnl: number;
  netPnlPercent: number;
  maxDrawdown: number;      // worst peak-to-trough in %
  timeInRange: number;      // % of time price was in range
  rebalances: number;       // times price exited and re-entered range
  dailyReturns: { day: number; cumPnl: number; fees: number; il: number }[];
  transactionCosts: {
    entryCost: number;       // custo de entrada (metade do entryExitCost)
    exitCost: number;        // custo de saída (metade do entryExitCost)
    rebalancingCosts: number; // soma dos custos de rebalanceamento
    total: number;           // custo total de transação
  };
}

/**
 * Backtest a range strategy using historical price snapshots.
 * If no history provided, simulates with random walk based on volatility.
 */
export function calcBacktest(params: {
  capital: number;
  entryPrice: number;
  rangeLower: number;
  rangeUpper: number;
  volAnn: number;
  fees24h: number;
  tvl: number;
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  periodDays: number;
  priceHistory?: number[];
  transactionCostPct?: number;  // custo por transação como % do capital (padrão: 0.1% = 0.001)
}): BacktestResult {
  const { capital, entryPrice, rangeLower, rangeUpper, volAnn, fees24h, tvl, mode, periodDays } = params;

  const kMap: Record<string, number> = { DEFENSIVE: 0.55, NORMAL: 0.75, AGGRESSIVE: 0.95 };
  const k_active = kMap[mode] ?? 0.75;
  const userShare = tvl > 0 ? capital / tvl : 0;
  const dailyFees = fees24h * userShare * k_active;

  // Custos de transação
  const txCostPct = params.transactionCostPct ?? 0.001; // 0.1% default (swap fee + slippage)
  const entryExitCost = capital * txCostPct * 2; // entrada + saída
  const rebalanceCost = capital * txCostPct; // cada rebalanceamento

  // Generate or use price history
  let prices: number[];
  if (params.priceHistory && params.priceHistory.length >= periodDays) {
    prices = params.priceHistory.slice(0, periodDays);
  } else {
    // Simulate with GBM
    const dailyVol = volAnn / Math.sqrt(365);
    prices = [entryPrice];
    for (let d = 1; d < periodDays; d++) {
      const z = randNormal();
      const prevPrice = prices[d - 1];
      prices.push(prevPrice * Math.exp(-0.5 * dailyVol * dailyVol + dailyVol * z));
    }
  }

  let totalFees = 0;
  let totalIL = 0;
  let maxPnl = 0;
  let maxDrawdown = 0;
  let daysInRange = 0;
  let rebalances = 0;
  let wasInRange = true;
  const dailyReturns: BacktestResult['dailyReturns'] = [];

  for (let d = 0; d < prices.length; d++) {
    const price = prices[d];
    const inRange = price >= rangeLower && price <= rangeUpper;

    if (inRange) {
      totalFees += dailyFees;
      daysInRange++;
    }

    // Track range exits/re-entries
    if (!inRange && wasInRange) rebalances++;
    wasInRange = inRange;

    // Cumulative IL — usa calcIL() com tratamento correto de boundary price
    const ilResult = calcIL({ entryPrice, currentPrice: price, rangeLower, rangeUpper, poolType: 'CL' });
    totalIL = Math.abs(ilResult.ilPercent / 100 * capital);

    const cumulativeRebalanceCost = rebalances * rebalanceCost;
    const cumPnl = totalFees - totalIL - entryExitCost - cumulativeRebalanceCost;
    if (cumPnl > maxPnl) maxPnl = cumPnl;
    // Peak-to-trough drawdown: measure from peak portfolio value
    const peakValue = capital + maxPnl;
    const drawdown = peakValue > 0 ? ((maxPnl - cumPnl) / peakValue) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    dailyReturns.push({
      day: d + 1,
      cumPnl: Math.round(cumPnl * 100) / 100,
      fees: Math.round(totalFees * 100) / 100,
      il: Math.round(totalIL * 100) / 100,
    });
  }

  const totalTxCost = entryExitCost + rebalances * rebalanceCost;
  const netPnl = totalFees - totalIL - totalTxCost;

  return {
    periodDays: prices.length,
    totalFees: Math.round(totalFees * 100) / 100,
    totalIL: Math.round(totalIL * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
    netPnlPercent: capital > 0 ? Math.round((netPnl / capital) * 10000) / 100 : 0,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    timeInRange: prices.length > 0 ? Math.round((daysInRange / prices.length) * 10000) / 100 : 0,
    rebalances,
    dailyReturns,
    transactionCosts: {
      entryCost: Math.round((entryExitCost / 2) * 100) / 100,
      exitCost: Math.round((entryExitCost / 2) * 100) / 100,
      rebalancingCosts: Math.round((rebalances * rebalanceCost) * 100) / 100,
      total: Math.round(totalTxCost * 100) / 100,
    },
  };
}

// ============================================================
// 13. LVR (LOSS-VERSUS-REBALANCING)
// ============================================================

export interface LVRResult {
  lvrDaily: number;               // daily LVR in USD (concentration-adjusted)
  lvrAnnualized: number;          // annualized LVR in USD
  lvrPercent: number;             // LVR as % of capital
  feeToLvrRatio: number;          // fees / LVR — >1 means profitable after LVR
  netAfterLvr: number;            // fees - LVR per day
  verdict: 'profitable' | 'marginal' | 'unprofitable';
  concentrationMultiplier: number; // range-width adjustment factor [0.5, 4]
}

/**
 * Calculate Loss-Versus-Rebalancing (LVR) for a position.
 * LVR measures the adverse selection cost of providing liquidity.
 * Formula: LVR ≈ σ² * L * Δt / 2 (for infinitesimal intervals)
 * Simplified: daily LVR ≈ capital * σ²_daily / 2
 */
export function calcLVR(params: {
  capital: number;
  volAnn: number;
  fees24h: number;
  tvl: number;
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  rangeLower?: number;  // optional: lower bound of position range
  rangeUpper?: number;  // optional: upper bound of position range
}): LVRResult {
  const { capital, volAnn, fees24h, tvl, mode, rangeLower, rangeUpper } = params;

  const kMap: Record<string, number> = { DEFENSIVE: 0.55, NORMAL: 0.75, AGGRESSIVE: 0.95 };
  const k_active = kMap[mode] ?? 0.75;

  const dailyVol = volAnn / Math.sqrt(365);
  const dailyVolSq = dailyVol * dailyVol;

  // LVR base ≈ capital * σ²_daily / 2
  const lvrDailyBase = capital * dailyVolSq / 2;

  // Ajuste por concentração de range: range estreito = maior LVR por capital
  // Fórmula: 1 / rangeWidthFraction, clamped [0.5, 4]
  // Ex: range 5% → mult = min(4, 1/0.05) = 4 (muito concentrado)
  // Ex: range 50% → mult = min(4, 1/0.5) = 2
  // Ex: range 100%→ mult = min(4, 1/1.0) = 1 (posição ampla, V2-like)
  const rangeWidthFraction = rangeUpper != null && rangeUpper > 0 && rangeLower != null && rangeLower > 0
    ? Math.abs(rangeUpper - rangeLower) / ((rangeUpper + rangeLower) / 2)
    : 0.5; // fallback: assume 50% range
  const concentrationMultiplier = Math.min(4, Math.max(0.5, 1 / Math.max(rangeWidthFraction, 0.1)));
  const lvrDaily = lvrDailyBase * concentrationMultiplier;

  const lvrAnnualized = lvrDaily * 365;
  const lvrPercent = capital > 0 ? (lvrAnnualized / capital) * 100 : 0;

  // Compare with fee income
  const userShare = tvl > 0 ? capital / tvl : 0;
  const dailyFeeIncome = fees24h * userShare * k_active;
  const feeToLvrRatio = lvrDaily > 0 ? dailyFeeIncome / lvrDaily : 999999;
  const netAfterLvr = dailyFeeIncome - lvrDaily;

  let verdict: LVRResult['verdict'];
  if (feeToLvrRatio > 1.5) verdict = 'profitable';
  else if (feeToLvrRatio > 0.8) verdict = 'marginal';
  else verdict = 'unprofitable';

  return {
    lvrDaily: Math.round(lvrDaily * 100) / 100,
    lvrAnnualized: Math.round(lvrAnnualized * 100) / 100,
    lvrPercent: Math.round(lvrPercent * 100) / 100,
    feeToLvrRatio: Math.round(feeToLvrRatio * 100) / 100,
    netAfterLvr: Math.round(netAfterLvr * 100) / 100,
    verdict,
    concentrationMultiplier: Math.round(concentrationMultiplier * 1000) / 1000,
  };
}

// ============================================================
// 14. PORTFOLIO ANALYTICS (Sharpe, Drawdown, Allocation)
// ============================================================

export interface PortfolioPosition {
  poolId: string;
  chain: string;
  pair: string;
  capital: number;
  apr: number;
  volAnn: number;
  feesAccrued: number;
  ilActual: number;
  protocol?: string;
  token0Symbol?: string;
  token1Symbol?: string;
  /** Optional daily return series (% returns) for real Sharpe/Sortino */
  dailyReturns?: number[];
}

export interface PortfolioAnalytics {
  totalCapital: number;
  totalPnl: number;
  totalPnlPercent: number;
  weightedApr: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  riskAdjustedApr: number;     // APR * (1 - downside_risk_factor)
  diversificationScore: number; // 0-100, based on HHI
  allocationByChain: { chain: string; capital: number; percent: number }[];
  allocationByProtocol: { protocol: string; capital: number; percent: number }[];
  allocationByToken: { token: string; exposure: number; percent: number }[];
  riskBand: 'conservative' | 'balanced' | 'aggressive';
  /** Method used for Sharpe/Sortino: 'time_series' (real daily returns) or 'snapshot' (estimate) */
  ratioMethod: 'time_series' | 'snapshot';
  /** Number of daily return data points used (0 if snapshot) */
  ratioDataPoints: number;
}

/**
 * Calculate portfolio-level analytics across all positions.
 * Sharpe ratio = (Portfolio Return - Risk Free) / Portfolio StdDev
 * Sortino uses only downside deviation.
 */
export function calcPortfolioAnalytics(positions: PortfolioPosition[], riskFreeRate: number = 4.5): PortfolioAnalytics {
  const totalCapital = positions.reduce((s, p) => s + p.capital, 0);

  if (totalCapital === 0 || positions.length === 0) {
    return {
      totalCapital: 0, totalPnl: 0, totalPnlPercent: 0,
      weightedApr: 0, sharpeRatio: 0, sortinoRatio: 0,
      maxDrawdown: 0, riskAdjustedApr: 0, diversificationScore: 0,
      allocationByChain: [], allocationByProtocol: [], allocationByToken: [],
      riskBand: 'conservative', ratioMethod: 'snapshot', ratioDataPoints: 0,
    };
  }

  // Total PnL
  const totalFees = positions.reduce((s, p) => s + p.feesAccrued, 0);
  const totalIL = positions.reduce((s, p) => s + p.ilActual, 0);
  const totalPnl = totalFees - totalIL;
  const totalPnlPercent = (totalPnl / totalCapital) * 100;

  // Weighted APR
  const weightedApr = positions.reduce((s, p) => s + p.apr * (p.capital / totalCapital), 0);

  // Portfolio volatility (weighted)
  const weightedVol = positions.reduce((s, p) => s + p.volAnn * (p.capital / totalCapital), 0);

  // ── Sharpe / Sortino — prefer real daily returns when available ──
  // Aggregate portfolio-level daily returns from position-level dailyReturns
  const positionsWithReturns = positions.filter(p => p.dailyReturns && p.dailyReturns.length >= 7);
  const useTimeSeries = positionsWithReturns.length > 0;

  let sharpeRatio: number;
  let sortinoRatio: number;
  let ratioMethod: 'time_series' | 'snapshot';
  let ratioDataPoints: number;

  if (useTimeSeries) {
    // Build portfolio-level daily returns (capital-weighted)
    // Find the common length (minimum across positions with data)
    const minLen = Math.min(...positionsWithReturns.map(p => p.dailyReturns!.length));
    const portfolioDailyReturns: number[] = [];

    for (let d = 0; d < minLen; d++) {
      let dayReturn = 0;
      let weightSum = 0;
      for (const p of positionsWithReturns) {
        const w = p.capital / totalCapital;
        dayReturn += p.dailyReturns![d] * w;
        weightSum += w;
      }
      // For positions without dailyReturns, assume 0 contribution
      portfolioDailyReturns.push(dayReturn);
    }

    ratioDataPoints = portfolioDailyReturns.length;
    ratioMethod = 'time_series';

    // Mean daily return
    const meanDaily = portfolioDailyReturns.reduce((s, r) => s + r, 0) / ratioDataPoints;

    // Annualized return & risk-free daily
    const annualizedReturn = meanDaily * 252;
    const dailyRf = riskFreeRate / 252;
    const excessDailyReturns = portfolioDailyReturns.map(r => r - dailyRf);

    // Standard deviation of daily returns → annualize
    const variance = portfolioDailyReturns.reduce((s, r) => s + (r - meanDaily) ** 2, 0) / (ratioDataPoints - 1);
    const dailyStdDev = Math.sqrt(variance);
    const annualStdDev = dailyStdDev * Math.sqrt(252);

    // Sharpe = (annualized excess return) / annualized stddev
    sharpeRatio = annualStdDev > 0 ? (annualizedReturn - riskFreeRate) / annualStdDev : 0;

    // Sortino: only downside deviation
    const downsideDaily = excessDailyReturns.filter(r => r < 0);
    const downsideVar = downsideDaily.length > 0
      ? downsideDaily.reduce((s, r) => s + r * r, 0) / downsideDaily.length
      : 0;
    const annualDownsideDev = Math.sqrt(downsideVar) * Math.sqrt(252);
    sortinoRatio = annualDownsideDev > 0 ? (annualizedReturn - riskFreeRate) / annualDownsideDev : 0;
  } else {
    // Snapshot-based estimation (original logic)
    ratioMethod = 'snapshot';
    ratioDataPoints = 0;

    const annualizedReturn = weightedApr;
    const excessReturn = annualizedReturn - riskFreeRate;

    // Portfolio std dev of returns (weighted)
    const portfolioStdDev = weightedVol * 100; // convert to %
    sharpeRatio = portfolioStdDev > 0 ? excessReturn / portfolioStdDev : 0;

    // Sortino: only downside deviation from position returns
    const returns = positions.map(p => {
      const pnl = p.feesAccrued - p.ilActual;
      return p.capital > 0 ? (pnl / p.capital) * 100 : 0;
    });
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDeviation = downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((s, r) => s + r * r, 0) / downsideReturns.length)
      : portfolioStdDev * 0.7;
    sortinoRatio = downsideDeviation > 0 ? excessReturn / downsideDeviation : 0;
  }

  // Max Drawdown — use real time-series peak-to-trough when available
  let maxDrawdown: number;
  if (useTimeSeries) {
    const minLen = Math.min(...positionsWithReturns.map(p => p.dailyReturns!.length));
    // Build cumulative portfolio value
    let cumValue = 1.0;
    let peak = 1.0;
    let maxDD = 0;
    for (let d = 0; d < minLen; d++) {
      let dayReturn = 0;
      for (const p of positionsWithReturns) {
        dayReturn += (p.dailyReturns![d] / 100) * (p.capital / totalCapital);
      }
      cumValue *= (1 + dayReturn);
      if (cumValue > peak) peak = cumValue;
      const dd = (peak - cumValue) / peak;
      if (dd > maxDD) maxDD = dd;
    }
    maxDrawdown = maxDD * 100;
  } else {
    // Estimate via extreme value theory
    maxDrawdown = weightedVol > 0
      ? Math.min(50, weightedVol * Math.sqrt(2 * Math.log(252)) * 100)
      : 0;
  }

  // Risk-adjusted APR: penalize high vol positions
  // Formula: APR * (1 - vol_penalty) where vol_penalty = min(0.5, vol²)
  const volPenalty = Math.min(0.5, weightedVol * weightedVol);
  const riskAdjustedApr = weightedApr * (1 - volPenalty);

  // Diversification score using Herfindahl-Hirschman Index (HHI)
  // HHI = sum of squared market shares; lower = more diversified
  const chainMap = new Map<string, number>();
  positions.forEach(p => chainMap.set(p.chain, (chainMap.get(p.chain) || 0) + p.capital));
  const chainShares = Array.from(chainMap.values()).map(v => v / totalCapital);
  const hhi = chainShares.reduce((s, share) => s + share * share, 0);
  // Convert: HHI=1 (concentrated) → 0, HHI=1/N (max diversified) → 100
  const minHHI = chainShares.length > 0 ? 1 / chainShares.length : 1;
  const diversificationScore = hhi <= minHHI
    ? 100
    : Math.round((1 - (hhi - minHHI) / (1 - minHHI)) * 100);

  // Allocation by chain
  const allocationByChain = Array.from(chainMap.entries())
    .map(([chain, capital]) => ({ chain, capital: Math.round(capital * 100) / 100, percent: Math.round((capital / totalCapital) * 10000) / 100 }))
    .sort((a, b) => b.capital - a.capital);

  // Allocation by protocol
  const protocolMap = new Map<string, number>();
  positions.forEach(p => {
    const proto = p.protocol || 'Unknown';
    protocolMap.set(proto, (protocolMap.get(proto) || 0) + p.capital);
  });
  const allocationByProtocol = Array.from(protocolMap.entries())
    .map(([protocol, capital]) => ({ protocol, capital: Math.round(capital * 100) / 100, percent: Math.round((capital / totalCapital) * 10000) / 100 }))
    .sort((a, b) => b.capital - a.capital);

  // Token exposure (each position exposes to 2 tokens)
  const tokenMap = new Map<string, number>();
  positions.forEach(p => {
    const t0 = p.token0Symbol || 'Unknown';
    const t1 = p.token1Symbol || 'Unknown';
    // Each token gets half the capital exposure
    tokenMap.set(t0, (tokenMap.get(t0) || 0) + p.capital / 2);
    tokenMap.set(t1, (tokenMap.get(t1) || 0) + p.capital / 2);
  });
  const allocationByToken = Array.from(tokenMap.entries())
    .map(([token, exposure]) => ({ token, exposure: Math.round(exposure * 100) / 100, percent: Math.round((exposure / totalCapital) * 10000) / 100 }))
    .sort((a, b) => b.exposure - a.exposure);

  // Risk band
  let riskBand: PortfolioAnalytics['riskBand'];
  if (weightedVol < 0.3 && diversificationScore > 50) riskBand = 'conservative';
  else if (weightedVol > 0.6 || diversificationScore < 25) riskBand = 'aggressive';
  else riskBand = 'balanced';

  return {
    totalCapital: Math.round(totalCapital * 100) / 100,
    totalPnl: Math.round(totalPnl * 100) / 100,
    totalPnlPercent: Math.round(totalPnlPercent * 100) / 100,
    weightedApr: Math.round(weightedApr * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    riskAdjustedApr: Math.round(riskAdjustedApr * 100) / 100,
    diversificationScore,
    allocationByChain,
    allocationByProtocol,
    allocationByToken,
    riskBand,
    ratioMethod,
    ratioDataPoints,
  };
}

// ============================================================
// 15. AUTO-COMPOUND SIMULATOR
// ============================================================

export interface AutoCompoundResult {
  withoutCompound: number;
  withCompound: number;
  compoundBenefit: number;
  compoundBenefitPercent: number;
  schedule: { period: number; valueSimple: number; valueCompound: number; feesEarned: number }[];
  optimalFrequency: string;
  gasCostEstimate: number;
}

/**
 * Simulate auto-compounding vs simple fee accrual.
 * compound benefit = (1 + r/n)^(n*t) - (1 + r*t)
 */
export function calcAutoCompound(params: {
  capital: number;
  apr: number;           // annual % (e.g. 25.5)
  periodDays: number;
  compoundFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  gasPerCompound: number; // USD gas cost per compound tx
}): AutoCompoundResult {
  const { capital, apr, periodDays, compoundFrequency, gasPerCompound } = params;

  const freqMap: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
  const intervalDays = freqMap[compoundFrequency] || 7;
  const dailyRate = apr / 100 / 365;

  const totalCompounds = Math.floor(periodDays / intervalDays);
  const schedule: AutoCompoundResult['schedule'] = [];

  let valueSimple = capital;
  let valueCompound = capital;
  let totalGas = 0;

  for (let p = 1; p <= Math.ceil(periodDays / intervalDays); p++) {
    const days = Math.min(intervalDays, periodDays - (p - 1) * intervalDays);
    if (days <= 0) break;

    const feesSimple = capital * dailyRate * days;
    valueSimple += feesSimple;

    const feesCompound = valueCompound * dailyRate * days;
    valueCompound += feesCompound;
    totalGas += gasPerCompound;
    valueCompound -= gasPerCompound;

    schedule.push({
      period: p,
      valueSimple: Math.round(valueSimple * 100) / 100,
      valueCompound: Math.round(valueCompound * 100) / 100,
      feesEarned: Math.round(feesCompound * 100) / 100,
    });
  }

  const withoutCompound = Math.round(valueSimple * 100) / 100;
  const withCompound = Math.round(valueCompound * 100) / 100;
  const compoundBenefit = Math.round((withCompound - withoutCompound) * 100) / 100;
  const compoundBenefitPercent = capital > 0 ? Math.round((compoundBenefit / capital) * 10000) / 100 : 0;

  // Determine optimal frequency by testing all
  const frequencies: ('daily' | 'weekly' | 'biweekly' | 'monthly')[] = ['daily', 'weekly', 'biweekly', 'monthly'];
  let bestFreq = compoundFrequency;
  let bestValue = 0;
  for (const freq of frequencies) {
    const intv = freqMap[freq];
    let val = capital;
    const nCompounds = Math.floor(periodDays / intv);
    for (let i = 0; i < nCompounds; i++) {
      val += val * dailyRate * intv;
      val -= gasPerCompound;
    }
    const remainingDays = periodDays - nCompounds * intv;
    val += val * dailyRate * remainingDays;
    if (val > bestValue) {
      bestValue = val;
      bestFreq = freq;
    }
  }

  const freqLabels: Record<string, string> = {
    daily: 'Diario', weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal',
  };

  return {
    withoutCompound,
    withCompound,
    compoundBenefit,
    compoundBenefitPercent,
    schedule,
    optimalFrequency: freqLabels[bestFreq] || bestFreq,
    gasCostEstimate: Math.round(totalGas * 100) / 100,
  };
}

// ============================================================
// 16. TOKEN CORRELATION
// ============================================================

export interface TokenCorrelationResult {
  token0: string;
  token1: string;
  correlation: number;         // -1 to 1
  correlationLabel: string;    // "forte positiva", "fraca", etc.
  ilImpact: string;            // how correlation affects IL
  pairType: 'stablecoin' | 'correlated' | 'uncorrelated' | 'inverse';
  riskAssessment: string;
  volToken0: number;
  volToken1: number;
  combinedVol: number;
  method: 'pearson' | 'rule_based';
  dataPoints: number;
}

/**
 * Estimate token correlation and its impact on IL.
 * When priceHistory is available, calculates real Pearson correlation from price ratios.
 * Falls back to rule-based estimation from pool volatility.
 */
export function calcTokenCorrelation(params: {
  token0Symbol: string;
  token1Symbol: string;
  poolVolAnn: number;
  token0VolAnn?: number;   // if known
  token1VolAnn?: number;   // if known
  poolType?: 'CL' | 'V2' | 'STABLE';
  feeTier?: number;
  priceHistory?: { timestamp: Date; price: number }[];  // OHLCV close prices
}): TokenCorrelationResult {
  const { token0Symbol, token1Symbol, poolVolAnn, poolType, feeTier } = params;

  // Stablecoin detection
  const stablecoins = ['USDC', 'USDT', 'DAI', 'FRAX', 'LUSD', 'TUSD', 'BUSD', 'GUSD', 'USDP', 'crvUSD', 'GHO', 'PYUSD', 'USDe'];
  const wrappers = ['WETH', 'ETH', 'WBTC', 'BTC', 'stETH', 'wstETH', 'rETH', 'cbETH', 'WMATIC', 'MATIC', 'WBNB', 'BNB'];

  const t0 = token0Symbol.toUpperCase();
  const t1 = token1Symbol.toUpperCase();
  const isStable0 = stablecoins.some(s => t0.includes(s));
  const isStable1 = stablecoins.some(s => t1.includes(s));
  const isWrapped0 = wrappers.some(w => t0 === w);
  const isWrapped1 = wrappers.some(w => t1 === w);

  // Estimate individual vol from pool vol if not provided
  const vol0 = params.token0VolAnn ?? (isStable0 ? 0.02 : poolVolAnn * 0.8);
  const vol1 = params.token1VolAnn ?? (isStable1 ? 0.02 : poolVolAnn * 0.8);

  let correlation: number = 0;
  let pairType: TokenCorrelationResult['pairType'] = 'uncorrelated';
  let correlationMethod: 'pearson' | 'rule_based' = 'rule_based';

  // Try real Pearson correlation from price history (price ratio log-returns)
  if (params.priceHistory && params.priceHistory.length >= 10) {
    const sorted = [...params.priceHistory].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const prices = sorted.filter(p => p.price > 0).map(p => p.price);

    if (prices.length >= 10) {
      // For a pool pair, the "price" is the exchange rate (token0/token1).
      // High autocorrelation in log-returns → tokens move differently (low correlation)
      // Low autocorrelation → tokens move together (high correlation)
      const logReturns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        logReturns.push(Math.log(prices[i] / prices[i - 1]));
      }

      // Pool price volatility from real data
      const realPoolVol = stdev(logReturns);

      // Use Markowitz: σ_pool² = σ₀² + σ₁² - 2ρσ₀σ₁
      // Solve for ρ: ρ = (σ₀² + σ₁² - σ_pool²) / (2σ₀σ₁)
      const poolVar = realPoolVol * realPoolVol;
      const v0sq = vol0 * vol0;
      const v1sq = vol1 * vol1;
      const denom = 2 * vol0 * vol1;

      if (denom > 0.0001) {
        correlation = clamp((v0sq + v1sq - poolVar) / denom, -1, 1);
        pairType = correlation > 0.7 ? 'correlated' : correlation < -0.2 ? 'inverse' : 'uncorrelated';
        correlationMethod = 'pearson';
      }
    }
  }

  // Fallback: rule-based correlation estimation
  if (correlationMethod === 'rule_based') {
  if (isStable0 && isStable1) {
    // Stable-stable pair
    correlation = 0.99;
    pairType = 'stablecoin';
  } else if (poolType === 'STABLE' || (feeTier && feeTier <= 0.0001)) {
    // Stable pool or very low fee tier
    correlation = 0.95;
    pairType = 'stablecoin';
  } else if (
    (isWrapped0 && isWrapped1) ||
    (t0.includes('ETH') && t1.includes('ETH')) ||
    (t0.includes('BTC') && t1.includes('BTC'))
  ) {
    // Same-asset derivatives (WETH/stETH, WBTC/BTC)
    correlation = 0.97;
    pairType = 'correlated';
  } else if (isStable0 || isStable1) {
    // One stable: correlation depends on pool vol
    // Low pool vol = the other token is stable-ish
    correlation = poolVolAnn < 0.15 ? 0.3 : poolVolAnn < 0.4 ? -0.1 : -0.3;
    pairType = 'uncorrelated';
  } else {
    // Two volatile tokens: estimate from pool vol vs individual vols
    // If pool vol is much less than individual vols = high correlation
    const expectedUncorrelatedVol = Math.sqrt(vol0 * vol0 + vol1 * vol1);
    if (expectedUncorrelatedVol > 0) {
      // ρ ≈ 1 - (σ_pool / σ_uncorrelated)²
      const ratio = poolVolAnn / expectedUncorrelatedVol;
      correlation = clamp(1 - ratio * ratio, -0.5, 0.99);
    } else {
      correlation = 0;
    }
    pairType = correlation > 0.7 ? 'correlated' : correlation < -0.2 ? 'inverse' : 'uncorrelated';
  }
  } // end rule_based fallback

  // Combined portfolio vol
  const combinedVol = Math.sqrt(
    vol0 * vol0 + vol1 * vol1 + 2 * correlation * vol0 * vol1
  );

  // Correlation label
  let correlationLabel: string;
  if (correlation > 0.8) correlationLabel = 'Forte positiva';
  else if (correlation > 0.5) correlationLabel = 'Moderada positiva';
  else if (correlation > 0.1) correlationLabel = 'Fraca positiva';
  else if (correlation > -0.1) correlationLabel = 'Neutra';
  else if (correlation > -0.5) correlationLabel = 'Fraca negativa';
  else correlationLabel = 'Forte negativa';

  // IL impact assessment
  let ilImpact: string;
  if (correlation > 0.9) ilImpact = 'IL muito baixo — tokens movem juntos';
  else if (correlation > 0.6) ilImpact = 'IL baixo a moderado — boa correlacao';
  else if (correlation > 0.2) ilImpact = 'IL moderado — correlacao parcial';
  else if (correlation > -0.2) ilImpact = 'IL alto — tokens independentes';
  else ilImpact = 'IL muito alto — tokens movem em direcoes opostas';

  // Risk assessment
  let riskAssessment: string;
  if (pairType === 'stablecoin') riskAssessment = 'Risco minimo de IL. Ideal para estrategia conservadora.';
  else if (pairType === 'correlated') riskAssessment = 'Baixo risco de IL. Tokens correlacionados reduzem divergencia.';
  else if (pairType === 'inverse') riskAssessment = 'Alto risco de IL. Considere ranges largos e modo defensivo.';
  else riskAssessment = 'Risco moderado de IL. Monitorar divergencia de precos.';

  return {
    token0: token0Symbol,
    token1: token1Symbol,
    correlation: Math.round(correlation * 100) / 100,
    correlationLabel,
    ilImpact,
    pairType,
    riskAssessment,
    volToken0: Math.round(vol0 * 10000) / 10000,
    volToken1: Math.round(vol1 * 10000) / 10000,
    combinedVol: Math.round(combinedVol * 10000) / 10000,
    method: correlationMethod,
    dataPoints: params.priceHistory?.length ?? 0,
  };
}

// ============================================
// CALC IL — helper usado por calcRangeBenchmark (Fase 6)
// ============================================

export interface ILParams {
  entryPrice: number;
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;
  poolType: PoolType;
}

export interface ILResult {
  ilPercent: number;   // negativo = perda (e.g. -3.5 = -3.5%)
  ilUsd: number;       // sempre positivo (magnitude da perda)
  outOfRange: boolean;
}

/**
 * Calcula Impermanent Loss analítico para posição CL (Uniswap V3) ou V2.
 * Retorna ilPercent como valor negativo (perda) ou zero (sem IL).
 */
export function calcIL(params: ILParams): ILResult {
  const { entryPrice, currentPrice, rangeLower, rangeUpper, poolType } = params;

  if (entryPrice <= 0 || currentPrice <= 0) {
    return { ilPercent: 0, ilUsd: 0, outOfRange: false };
  }

  const priceRatio = currentPrice / entryPrice;
  const outOfRange = currentPrice < rangeLower || currentPrice > rangeUpper;

  // Fórmula padrão Uniswap V3 IL: 2√k/(1+k) - 1, onde k = P_end/P_start
  const sqrtRatio = Math.sqrt(priceRatio);
  let ilFraction = (2 * sqrtRatio) / (1 + priceRatio) - 1; // ≤ 0

  if (outOfRange && poolType === 'CL') {
    // Fora do range: IL é calculado no preço da borda do range
    const boundaryPrice = currentPrice > rangeUpper ? rangeUpper : rangeLower;
    const bRatio = boundaryPrice / entryPrice;
    const bSqrt = Math.sqrt(bRatio);
    ilFraction = (2 * bSqrt) / (1 + bRatio) - 1;
  }

  const ilPercent = Math.round(ilFraction * 10000) / 100; // em %

  return {
    ilPercent,           // negativo = perda
    ilUsd: 0,            // sem capital aqui — caller calcula se necessário
    outOfRange,
  };
}

// ============================================
// TICK LIQUIDITY DISTRIBUTION (Fase 6 — 6.1)
// ============================================

export interface TickLiquidityParams {
  tvl: number;           // total pool TVL in USD
  price: number;         // current price (token1/token0)
  volatilityAnn: number; // annualized volatility (decimal, e.g. 0.8 = 80%)
  rangeLower: number;    // lower bound of user's range
  rangeUpper: number;    // upper bound of user's range
}

export interface TickLiquidityResult {
  fractionInRange: number;           // 0-1: fraction of total liquidity in [rangeLower, rangeUpper]
  capitalEfficiency: number;         // multiplier vs full-range (e.g. 5.0 = 5x more efficient)
  estimatedLiquidityInRange: number; // estimated USD liquidity within the range
  method: 'log_normal';
  warning?: string;
}

/**
 * Estimativa de liquidez dentro de um range usando distribuição log-normal.
 *
 * Modelo: assume que a liquidez segue uma distribuição log-normal centrada
 * no preço atual, com σ derivado da volatilidade anualizada (via horizonte diário).
 * A fração no range = integral da log-normal de rangeLower a rangeUpper.
 *
 * Capital efficiency = 1 / fractionInRange (range mais estreito = uso mais eficiente)
 */
export function calcTickLiquidity(params: TickLiquidityParams): TickLiquidityResult {
  const { tvl, price, volatilityAnn, rangeLower, rangeUpper } = params;

  // Validações básicas
  if (rangeLower <= 0 || rangeUpper <= rangeLower || price <= 0) {
    return {
      fractionInRange: 1,
      capitalEfficiency: 1,
      estimatedLiquidityInRange: tvl,
      method: 'log_normal',
      warning: 'Invalid range or price — returning full-range estimate',
    };
  }

  // σ diária da volatilidade anualizada (252 dias de trading)
  const sigmaDaily = volatilityAnn / Math.sqrt(252);
  // σ para o horizonte relevante (7 dias — horizonte típico de LP)
  const sigma = sigmaDaily * Math.sqrt(7);

  // Transformar rangeLower e rangeUpper em termos de log-retorno normalizado
  const logPrice = Math.log(price);
  const zLower = (Math.log(rangeLower) - logPrice) / sigma;
  const zUpper = (Math.log(rangeUpper) - logPrice) / sigma;

  // Integral da normal padrão de zLower a zUpper
  const fraction = normalCDF(zUpper) - normalCDF(zLower);

  // Clamp para evitar frações impossíveis
  const fractionInRange = Math.max(0.01, Math.min(1, fraction));
  const capitalEfficiency = Math.min(50, 1 / fractionInRange); // cap 50x

  return {
    fractionInRange: Math.round(fractionInRange * 10000) / 10000,
    capitalEfficiency: Math.round(capitalEfficiency * 100) / 100,
    estimatedLiquidityInRange: Math.round(tvl * fractionInRange),
    method: 'log_normal',
  };
}

// ============================================
// RANGE BENCHMARK (Fase 6 — 6.2)
// ============================================

export interface RangeBenchmarkParams {
  startPrice: number;        // price at position entry
  endPrice: number;          // price at position exit / now
  rangeLower: number;        // user's range lower bound
  rangeUpper: number;        // user's range upper bound
  feesEarnedUsd: number;     // total fees collected in period
  capitalUsd: number;        // capital deployed
  periodDays: number;        // duration (days)
  feeTier: number;           // e.g. 0.003 = 0.3%
  volatilityAnn: number;     // annualized volatility
}

export interface RangeBenchmarkResult {
  periodDays: number;
  startPrice: number;
  endPrice: number;
  priceChangePct: number;

  // Returns (pct over period, not annualized)
  rangeReturnPct: number;       // actual CL LP return (fees + IL)
  hodlReturnPct: number;        // hold 50/50 tokens
  v2LpReturnPct: number;        // full-range (V2-equivalent) LP
  idealNarrowReturnPct: number; // ±10% around startPrice (narrow CL)

  // Comparisons
  vsHodl: number;               // rangeReturnPct - hodlReturnPct
  vsV2: number;                 // rangeReturnPct - v2LpReturnPct

  verdict: 'OUTPERFORMING' | 'UNDERPERFORMING' | 'NEUTRAL';
  explanation: string;
}

/**
 * Benchmarks CL LP position against HODL, full-range V2, and ideal narrow range.
 *
 * Todos os retornos são percentuais SOBRE O PERÍODO (não anualizados).
 */
export function calcRangeBenchmark(params: RangeBenchmarkParams): RangeBenchmarkResult {
  const {
    startPrice, endPrice, rangeLower, rangeUpper,
    feesEarnedUsd, capitalUsd, periodDays, feeTier, volatilityAnn,
  } = params;

  const priceChangePct = (endPrice - startPrice) / startPrice * 100;

  // --- 1. Actual CL LP return ---
  // IL usando a fórmula analítica para CL
  const ilResult = calcIL({
    entryPrice: startPrice,
    currentPrice: endPrice,
    rangeLower,
    rangeUpper,
    poolType: 'CL',
  });
  const feesReturnPct = capitalUsd > 0 ? feesEarnedUsd / capitalUsd * 100 : 0;
  const rangeReturnPct = feesReturnPct + ilResult.ilPercent; // ilPercent is negative for IL

  // --- 2. HODL return (hold 50/50 at entry) ---
  // If you had held 50% token0 + 50% token1 from start
  const token0ValueRatio = 0.5 * (endPrice / startPrice);
  const token1ValueRatio = 0.5 * 1;  // token1 (stable-ish denominator)
  const hodlReturnPct = (token0ValueRatio + token1ValueRatio - 1) * 100;

  // --- 3. V2 LP (full range, 0 to ∞) ---
  // IL for full-range LP: standard formula k = sqrt(P_end/P_start)
  const k = Math.sqrt(endPrice / startPrice);
  const v2ILPct = (2 * k / (1 + k) - 1) * 100;
  // Fees for V2 (lower capital efficiency — assume 1x vs CL concentration factor)
  const tickResult = calcTickLiquidity({
    tvl: capitalUsd, price: startPrice, volatilityAnn,
    rangeLower, rangeUpper,
  });
  // V2 earns fees proportional to its fraction vs CL capital efficiency
  const v2FeesReturnPct = feesReturnPct / tickResult.capitalEfficiency;
  const v2LpReturnPct = v2FeesReturnPct + v2ILPct;

  // --- 4. Ideal narrow range (±10% around startPrice) ---
  const idealLower = startPrice * 0.90;
  const idealUpper = startPrice * 1.10;
  const idealIL = calcIL({
    entryPrice: startPrice, currentPrice: endPrice,
    rangeLower: idealLower, rangeUpper: idealUpper,
    poolType: 'CL',
  });
  const idealTickResult = calcTickLiquidity({
    tvl: capitalUsd, price: startPrice, volatilityAnn,
    rangeLower: idealLower, rangeUpper: idealUpper,
  });
  const idealFeesReturnPct = feesReturnPct * idealTickResult.capitalEfficiency / tickResult.capitalEfficiency;
  const idealNarrowReturnPct = idealFeesReturnPct + idealIL.ilPercent;

  // --- Verdict ---
  const vsHodl = rangeReturnPct - hodlReturnPct;
  const vsV2 = rangeReturnPct - v2LpReturnPct;

  let verdict: RangeBenchmarkResult['verdict'];
  let explanation: string;

  if (vsHodl > 1 && vsV2 > 0.5) {
    verdict = 'OUTPERFORMING';
    explanation = `Range LP superou HODL em ${vsHodl.toFixed(2)}% e LP full-range em ${vsV2.toFixed(2)}% no período.`;
  } else if (vsHodl < -2 || vsV2 < -2) {
    verdict = 'UNDERPERFORMING';
    explanation = `Range LP ficou abaixo de HODL em ${Math.abs(vsHodl).toFixed(2)}% e abaixo do LP full-range em ${Math.abs(vsV2).toFixed(2)}%.`;
  } else {
    verdict = 'NEUTRAL';
    explanation = `Desempenho neutro: diferença de ${vsHodl.toFixed(2)}% vs HODL e ${vsV2.toFixed(2)}% vs V2.`;
  }

  // feeTier is received but not used in this calculation (available for future extensions)
  void feeTier;

  return {
    periodDays,
    startPrice, endPrice, priceChangePct: Math.round(priceChangePct * 100) / 100,
    rangeReturnPct: Math.round(rangeReturnPct * 100) / 100,
    hodlReturnPct: Math.round(hodlReturnPct * 100) / 100,
    v2LpReturnPct: Math.round(v2LpReturnPct * 100) / 100,
    idealNarrowReturnPct: Math.round(idealNarrowReturnPct * 100) / 100,
    vsHodl: Math.round(vsHodl * 100) / 100,
    vsV2: Math.round(vsV2 * 100) / 100,
    verdict,
    explanation,
  };
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
  calcPositionPnL,
  calcMonteCarlo,
  calcBacktest,
  calcLVR,
  calcPortfolioAnalytics,
  calcAutoCompound,
  calcTokenCorrelation,
  calcIL,
  calcTickLiquidity,
  calcRangeBenchmark,
};

export { calcService };
