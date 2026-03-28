/**
 * Technical Indicators Service — Deep Analysis
 * Pure math functions for RSI, MACD, Bollinger Bands, Volume Profile, and Momentum Score.
 */

import type { OhlcvCandle } from './price-history.service.js';

// --- Types ---

export interface RsiResult {
  value: number;          // 0-100
  signal: 'oversold' | 'neutral' | 'overbought';
  periods: number;
}

export interface MacdResult {
  macdLine: number;
  signalLine: number;
  histogram: number;
  signal: 'bullish' | 'neutral' | 'bearish';
  crossover: 'bullish_cross' | 'bearish_cross' | 'none';
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  bandwidth: number;      // (upper - lower) / middle
  percentB: number;       // (price - lower) / (upper - lower)
  signal: 'above_upper' | 'near_upper' | 'middle' | 'near_lower' | 'below_lower';
}

export interface VolumeProfileResult {
  avgVolume: number;
  currentVolume: number;
  volumeTrend: number;    // % change vs avg
  volumeTvlRatio: number;
  isAbnormal: boolean;    // > 2x avg
}

export interface VwapResult {
  value: number;
  deviation: number;     // % distance from current price to VWAP
  signal: 'above' | 'at' | 'below';
}

export interface SmaResult {
  values: { period: number; value: number }[];
  trend: 'bullish' | 'bearish' | 'neutral';
  goldenCross: boolean;
  deathCross: boolean;
}

export interface SupportResistanceResult {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  distanceToSupport: number;
  distanceToResistance: number;
}

export interface TrendResult {
  direction: 'strong_up' | 'up' | 'sideways' | 'down' | 'strong_down';
  strength: number;      // 0-100
  priceChange: number;
  higherHighs: boolean;
  higherLows: boolean;
}

export interface MomentumResult {
  score: number;          // -100 to +100
  label: 'Strong Sell' | 'Sell' | 'Neutral' | 'Buy' | 'Strong Buy';
  components: {
    rsiSignal: number;
    macdSignal: number;
    bollingerSignal: number;
    volumeSignal: number;
    trendSignal: number;
    smaSignal: number;
  };
}

export interface DeepAnalysis {
  rsi: RsiResult;
  macd: MacdResult;
  bollinger: BollingerResult;
  volumeProfile: VolumeProfileResult;
  momentum: MomentumResult;
  vwap: VwapResult | null;
  sma: SmaResult | null;
  supportResistance: SupportResistanceResult | null;
  trend: TrendResult;
  meta: {
    chain: string;
    address: string;
    timeframe: string;
    candlesUsed: number;
    calculatedAt: string;
  };
}

// --- Helper: EMA ---

function calcEma(values: number[], periods: number): number[] {
  if (values.length < periods) return [];
  const k = 2 / (periods + 1);
  const emaValues: number[] = [];

  // First EMA value = SMA of first `periods` values
  let sum = 0;
  for (let i = 0; i < periods; i++) {
    sum += values[i];
  }
  emaValues.push(sum / periods);

  // Subsequent values use EMA formula
  for (let i = periods; i < values.length; i++) {
    const prev = emaValues[emaValues.length - 1];
    emaValues.push(values[i] * k + prev * (1 - k));
  }

  return emaValues;
}

// --- RSI (Wilder's Smoothing) ---

export function calcRsi(candles: OhlcvCandle[], periods: number = 14): RsiResult | null {
  if (candles.length < periods + 1) return null;

  const closes = candles.map(c => c.close);
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // First average: SMA of first `periods` gains and losses
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < periods; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= periods;
  avgLoss /= periods;

  // Wilder's smoothing for remaining changes
  for (let i = periods; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (periods - 1) + gain) / periods;
    avgLoss = (avgLoss * (periods - 1) + loss) / periods;
  }

  let rsi: number;
  if (avgGain === 0 && avgLoss === 0) {
    rsi = 50; // No movement = neutral
  } else if (avgLoss === 0) {
    rsi = 100;
  } else if (avgGain === 0) {
    rsi = 0;
  } else {
    const rs = avgGain / avgLoss;
    rsi = 100 - 100 / (1 + rs);
  }

  let signal: RsiResult['signal'] = 'neutral';
  if (rsi <= 30) signal = 'oversold';
  else if (rsi >= 70) signal = 'overbought';

  return { value: rsi, signal, periods };
}

// --- MACD ---

export function calcMacd(
  candles: OhlcvCandle[],
  fast: number = 12,
  slow: number = 26,
  signalPeriod: number = 9,
): MacdResult | null {
  if (candles.length < slow) return null;

  const closes = candles.map(c => c.close);
  const fastEma = calcEma(closes, fast);
  const slowEma = calcEma(closes, slow);

  // Align: fastEma starts at index `fast`, slowEma at index `slow`
  // We need to align them so they correspond to the same candle indices
  const offset = slow - fast; // fastEma has `offset` more values at the start
  const macdLine: number[] = [];
  for (let i = 0; i < slowEma.length; i++) {
    macdLine.push(fastEma[i + offset] - slowEma[i]);
  }

  if (macdLine.length === 0) return null;

  const signalEma = calcEma(macdLine, signalPeriod);

  if (signalEma.length === 0) {
    // Not enough MACD values for signal line, use last MACD value
    const lastMacd = macdLine[macdLine.length - 1];
    return {
      macdLine: lastMacd,
      signalLine: lastMacd,
      histogram: 0,
      signal: lastMacd > 0 ? 'bullish' : lastMacd < 0 ? 'bearish' : 'neutral',
      crossover: 'none',
    };
  }

  const currentMacd = macdLine[macdLine.length - 1];
  const currentSignal = signalEma[signalEma.length - 1];
  const histogram = currentMacd - currentSignal;

  // Crossover detection: compare current and previous MACD/Signal relationship
  let crossover: MacdResult['crossover'] = 'none';
  if (macdLine.length >= 2 && signalEma.length >= 2) {
    // Previous MACD and signal (aligned)
    const signalOffset = macdLine.length - signalEma.length;
    const prevMacdIdx = macdLine.length - 2;
    const prevSignalIdx = prevMacdIdx - signalOffset;

    if (prevSignalIdx >= 0 && prevSignalIdx < signalEma.length) {
      const prevMacd = macdLine[prevMacdIdx];
      const prevSignal = signalEma[prevSignalIdx];
      const wasBelowOrEqual = prevMacd <= prevSignal;
      const isAbove = currentMacd > currentSignal;
      const wasAboveOrEqual = prevMacd >= prevSignal;
      const isBelow = currentMacd < currentSignal;

      if (wasBelowOrEqual && isAbove) crossover = 'bullish_cross';
      else if (wasAboveOrEqual && isBelow) crossover = 'bearish_cross';
    }
  }

  let signal: MacdResult['signal'] = 'neutral';
  if (currentMacd > currentSignal) signal = 'bullish';
  else if (currentMacd < currentSignal) signal = 'bearish';

  return { macdLine: currentMacd, signalLine: currentSignal, histogram, signal, crossover };
}

// --- Bollinger Bands ---

export function calcBollinger(
  candles: OhlcvCandle[],
  period: number = 20,
  stdDevMultiplier: number = 2,
): BollingerResult | null {
  if (candles.length < period) return null;

  const closes = candles.slice(-period).map(c => c.close);
  const lastClose = candles[candles.length - 1].close;

  // SMA
  const sum = closes.reduce((a, b) => a + b, 0);
  const middle = sum / period;

  // Population standard deviation
  const variance = closes.reduce((acc, val) => acc + (val - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;

  const bandwidth = middle !== 0 ? (upper - lower) / middle : 0;
  const range = upper - lower;
  const percentB = range !== 0 ? (lastClose - lower) / range : 0.5;

  let signal: BollingerResult['signal'];
  if (percentB > 1) signal = 'above_upper';
  else if (percentB > 0.8) signal = 'near_upper';
  else if (percentB < 0) signal = 'below_lower';
  else if (percentB < 0.2) signal = 'near_lower';
  else signal = 'middle';

  return { upper, middle, lower, bandwidth, percentB, signal };
}

// --- Volume Profile ---

export function calcVolumeProfile(
  candles: OhlcvCandle[],
  tvl: number,
): VolumeProfileResult | null {
  if (candles.length === 0) return null;

  const volumes = candles.map(c => c.volume);
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];

  // Volume trend: compare recent half vs older half
  const mid = Math.floor(volumes.length / 2);
  const olderHalf = volumes.slice(0, mid);
  const recentHalf = volumes.slice(mid);

  const olderAvg = olderHalf.length > 0
    ? olderHalf.reduce((a, b) => a + b, 0) / olderHalf.length
    : 0;
  const recentAvg = recentHalf.length > 0
    ? recentHalf.reduce((a, b) => a + b, 0) / recentHalf.length
    : 0;

  const volumeTrend = olderAvg !== 0
    ? ((recentAvg - olderAvg) / olderAvg) * 100
    : 0;

  const volumeTvlRatio = tvl !== 0 ? currentVolume / tvl : 0;
  const isAbnormal = currentVolume > 2 * avgVolume;

  return { avgVolume, currentVolume, volumeTrend, volumeTvlRatio, isAbnormal };
}

// --- VWAP ---

export function calcVwap(candles: OhlcvCandle[]): VwapResult | null {
  if (candles.length === 0) return null;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumulativeTPV += tp * c.volume;
    cumulativeVolume += c.volume;
  }

  if (cumulativeVolume === 0) return null;

  const vwap = cumulativeTPV / cumulativeVolume;
  const lastClose = candles[candles.length - 1].close;
  const deviation = vwap !== 0 ? ((lastClose - vwap) / vwap) * 100 : 0;

  let signal: VwapResult['signal'];
  if (deviation > 0.5) signal = 'above';
  else if (deviation < -0.5) signal = 'below';
  else signal = 'at';

  return { value: vwap, deviation, signal };
}

// --- SMA ---

export function calcSma(candles: OhlcvCandle[], periods: number[] = [7, 25, 99]): SmaResult | null {
  const maxPeriod = Math.max(...periods);
  if (candles.length < maxPeriod) return null;

  const closes = candles.map(c => c.close);

  const values = periods.map(period => {
    const slice = closes.slice(-period);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    return { period, value: avg };
  });

  // Sort periods ascending for comparison
  const sorted = [...periods].sort((a, b) => a - b);

  // Trend: check if SMAs are aligned (shortest > middle > longest)
  const smaMap = new Map(values.map(v => [v.period, v.value]));
  let bullish = true;
  let bearish = true;
  for (let i = 0; i < sorted.length - 1; i++) {
    const shorter = smaMap.get(sorted[i])!;
    const longer = smaMap.get(sorted[i + 1])!;
    if (shorter <= longer) bullish = false;
    if (shorter >= longer) bearish = false;
  }

  const trend: SmaResult['trend'] = bullish ? 'bullish' : bearish ? 'bearish' : 'neutral';

  // Golden/Death cross: compare short vs long SMA for current and previous candle
  let goldenCross = false;
  let deathCross = false;

  const shortPeriod = sorted[0];
  const longPeriod = sorted[sorted.length - 1];

  if (candles.length > maxPeriod) {
    // Current SMAs
    const currentShort = smaMap.get(shortPeriod)!;
    const currentLong = smaMap.get(longPeriod)!;

    // Previous SMAs (shift by 1 candle)
    const prevCloses = closes.slice(0, -1);
    const prevShort = prevCloses.slice(-shortPeriod).reduce((a, b) => a + b, 0) / shortPeriod;
    const prevLong = prevCloses.slice(-longPeriod).reduce((a, b) => a + b, 0) / longPeriod;

    if (prevShort <= prevLong && currentShort > currentLong) goldenCross = true;
    if (prevShort >= prevLong && currentShort < currentLong) deathCross = true;
  }

  return { values, trend, goldenCross, deathCross };
}

// --- Support / Resistance ---

export function calcSupportResistance(candles: OhlcvCandle[], levels: number = 3): SupportResistanceResult | null {
  if (candles.length < 3) return null;

  const rawSupports: number[] = [];
  const rawResistances: number[] = [];

  // Find local minima and maxima
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].low < candles[i - 1].low && candles[i].low < candles[i + 1].low) {
      rawSupports.push(candles[i].low);
    }
    if (candles[i].high > candles[i - 1].high && candles[i].high > candles[i + 1].high) {
      rawResistances.push(candles[i].high);
    }
  }

  // Cluster nearby levels (within 0.5% of each other)
  function clusterLevels(arr: number[]): number[] {
    if (arr.length === 0) return [];
    const sorted = [...arr].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const clusterAvg = lastCluster.reduce((a, b) => a + b, 0) / lastCluster.length;
      if (clusterAvg === 0 || Math.abs(sorted[i] - clusterAvg) / Math.abs(clusterAvg) <= 0.005) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }

    return clusters.map(c => c.reduce((a, b) => a + b, 0) / c.length);
  }

  const clusteredSupports = clusterLevels(rawSupports);
  const clusteredResistances = clusterLevels(rawResistances);

  // Sort supports descending, resistances ascending; take top `levels`
  const supports = clusteredSupports.sort((a, b) => b - a).slice(0, levels);
  const resistances = clusteredResistances.sort((a, b) => a - b).slice(0, levels);

  const lastClose = candles[candles.length - 1].close;

  // Nearest support = highest support below current price
  const supportsBelow = supports.filter(s => s < lastClose);
  const nearestSupport = supportsBelow.length > 0 ? Math.max(...supportsBelow) : null;

  // Nearest resistance = lowest resistance above current price
  const resistancesAbove = resistances.filter(r => r > lastClose);
  const nearestResistance = resistancesAbove.length > 0 ? Math.min(...resistancesAbove) : null;

  const safeLastClose = lastClose !== 0 ? lastClose : 1;
  const distanceToSupport = nearestSupport !== null
    ? ((lastClose - nearestSupport) / safeLastClose) * 100
    : 0;
  const distanceToResistance = nearestResistance !== null
    ? ((nearestResistance - lastClose) / safeLastClose) * 100
    : 0;

  return { supports, resistances, nearestSupport, nearestResistance, distanceToSupport, distanceToResistance };
}

// --- Trend ---

export function calcTrend(
  candles: OhlcvCandle[],
  sma?: SmaResult | null,
  macd?: MacdResult | null,
): TrendResult {
  if (candles.length === 0) {
    return { direction: 'sideways', strength: 0, priceChange: 0, higherHighs: false, higherLows: false };
  }
  const firstClose = candles[0].close;
  const lastClose = candles[candles.length - 1].close;
  const priceChange = firstClose !== 0 ? ((lastClose - firstClose) / firstClose) * 100 : 0;

  // Check higher highs / higher lows on last 5+ candles
  let higherHighs = false;
  let higherLows = false;
  const checkCount = Math.min(candles.length, 5);
  if (checkCount >= 2) {
    const tail = candles.slice(-checkCount);
    higherHighs = tail.every((c, i) => i === 0 || c.high > tail[i - 1].high);
    higherLows = tail.every((c, i) => i === 0 || c.low > tail[i - 1].low);
  }

  // Strength calculation
  let strength = Math.min(Math.abs(priceChange) * 2, 50); // base: up to 50 from price change
  if (sma) {
    if (sma.trend === 'bullish' || sma.trend === 'bearish') strength += 25;
  }
  if (macd) {
    if (macd.signal === 'bullish' || macd.signal === 'bearish') strength += 25;
    if (macd.crossover === 'bullish_cross' || macd.crossover === 'bearish_cross') strength += 15;
  }
  strength = Math.min(strength, 100);

  let direction: TrendResult['direction'];
  if (priceChange > 5 && strength > 60) direction = 'strong_up';
  else if (priceChange > 1) direction = 'up';
  else if (priceChange < -5 && strength > 60) direction = 'strong_down';
  else if (priceChange < -1) direction = 'down';
  else direction = 'sideways';

  return { direction, strength, priceChange, higherHighs, higherLows };
}

// --- Momentum Score ---

export function calcMomentum(
  rsi: RsiResult | null,
  macd: MacdResult | null,
  bollinger: BollingerResult | null,
  volume: VolumeProfileResult | null,
  trend?: TrendResult | null,
  sma?: SmaResult | null,
): MomentumResult {
  // RSI signal: oversold = +1 (buy), overbought = -1 (sell)
  let rsiSignal = 0;
  if (rsi) {
    if (rsi.signal === 'oversold') rsiSignal = 1;
    else if (rsi.signal === 'overbought') rsiSignal = -1;
  }

  // MACD signal
  let macdSignal = 0;
  if (macd) {
    if (macd.signal === 'bullish' || macd.crossover === 'bullish_cross') macdSignal = 1;
    else if (macd.signal === 'bearish' || macd.crossover === 'bearish_cross') macdSignal = -1;
  }

  // Bollinger signal
  let bollingerSignal = 0;
  if (bollinger) {
    if (bollinger.signal === 'near_lower' || bollinger.signal === 'below_lower') bollingerSignal = 1;
    else if (bollinger.signal === 'near_upper' || bollinger.signal === 'above_upper') bollingerSignal = -1;
  }

  // Volume signal: abnormal volume * trend direction
  let volumeSignal = 0;
  if (volume) {
    if (volume.isAbnormal) {
      volumeSignal = volume.volumeTrend > 0 ? 1 : volume.volumeTrend < 0 ? -1 : 0;
    }
  }

  // Trend signal (new, defaults to 0 for backward compat)
  let trendSignal = 0;
  if (trend) {
    if (trend.direction === 'strong_up' || trend.direction === 'up') trendSignal = 1;
    else if (trend.direction === 'strong_down' || trend.direction === 'down') trendSignal = -1;
  }

  // SMA signal (new, defaults to 0 for backward compat)
  let smaSignal = 0;
  if (sma) {
    if (sma.goldenCross) smaSignal = 1;
    else if (sma.deathCross) smaSignal = -1;
    else if (sma.trend === 'bullish') smaSignal = 0.5;
    else if (sma.trend === 'bearish') smaSignal = -0.5;
  }

  // Weighted composite: RSI 20%, MACD 20%, Bollinger 15%, Volume 15%, Trend 20%, SMA 10%
  const rawScore = (rsiSignal * 20 + macdSignal * 20 + bollingerSignal * 15 + volumeSignal * 15 + trendSignal * 20 + smaSignal * 10);
  const score = Math.max(-100, Math.min(100, rawScore));

  let label: MomentumResult['label'];
  if (score >= 50) label = 'Strong Buy';
  else if (score >= 15) label = 'Buy';
  else if (score <= -50) label = 'Strong Sell';
  else if (score <= -15) label = 'Sell';
  else label = 'Neutral';

  return {
    score,
    label,
    components: { rsiSignal, macdSignal, bollingerSignal, volumeSignal, trendSignal, smaSignal },
  };
}

// --- Orchestrator ---

export function computeDeepAnalysis(
  candles: OhlcvCandle[],
  tvl: number,
  chain: string,
  address: string,
  timeframe: string,
): DeepAnalysis | null {
  const rsi = calcRsi(candles);
  const volume = calcVolumeProfile(candles, tvl);

  // Minimum: need RSI + volume to be useful
  if (!rsi || !volume) return null;

  // Tier 2: MACD (26+), Bollinger (20+), SMA (99+), VWAP, S/R
  const macd = calcMacd(candles);
  const bollinger = calcBollinger(candles);
  const vwap = calcVwap(candles);
  const sma = calcSma(candles);
  const supportResistance = calcSupportResistance(candles);

  // Trend uses SMA + MACD for richer signal
  const trend = calcTrend(candles, sma, macd);

  // Momentum now uses all signals
  const momentum = calcMomentum(rsi, macd, bollinger, volume, trend, sma);

  // Default values for when indicators couldn't be calculated
  const defaultMacd: MacdResult = {
    macdLine: 0, signalLine: 0, histogram: 0,
    signal: 'neutral', crossover: 'none',
  };
  const defaultBollinger: BollingerResult = {
    upper: 0, middle: 0, lower: 0,
    bandwidth: 0, percentB: 0.5, signal: 'middle',
  };

  return {
    rsi,
    macd: macd ?? defaultMacd,
    bollinger: bollinger ?? defaultBollinger,
    volumeProfile: volume,
    momentum,
    vwap,
    sma,
    supportResistance,
    trend,
    meta: {
      chain,
      address,
      timeframe,
      candlesUsed: candles.length,
      calculatedAt: new Date().toISOString(),
    },
  };
}
