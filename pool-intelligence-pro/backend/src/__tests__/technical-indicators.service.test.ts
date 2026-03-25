import { describe, it, expect } from 'vitest';
import type { OhlcvCandle } from '../services/price-history.service.js';
import {
  calcRsi,
  calcMacd,
  calcBollinger,
  calcVolumeProfile,
  calcMomentum,
  computeDeepAnalysis,
  type RsiResult,
  type MacdResult,
  type BollingerResult,
  type VolumeProfileResult,
  type MomentumResult,
  type DeepAnalysis,
} from '../services/technical-indicators.service.js';

// --- Helpers ---

function makeCandles(closes: number[], volumes?: number[]): OhlcvCandle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() - (closes.length - i) * 3600_000,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: volumes ? volumes[i] : 1000,
  }));
}

function makeManyCandles(count: number, startPrice: number, step: number): OhlcvCandle[] {
  const closes: number[] = [];
  for (let i = 0; i < count; i++) {
    closes.push(startPrice + i * step);
  }
  return makeCandles(closes);
}

// --- RSI Tests ---

describe('calcRsi', () => {
  it('returns null when too few candles (< periods + 1)', () => {
    const candles = makeCandles([100, 101, 102]);
    expect(calcRsi(candles, 14)).toBeNull();
  });

  it('returns RSI = 100 for monotonically increasing prices', () => {
    // 16 candles, each higher → all gains, no losses → RSI = 100
    const closes = Array.from({ length: 16 }, (_, i) => 100 + i);
    const result = calcRsi(makeCandles(closes), 14)!;
    expect(result).not.toBeNull();
    expect(result.value).toBeCloseTo(100, 0);
    expect(result.signal).toBe('overbought');
    expect(result.periods).toBe(14);
  });

  it('returns RSI = 0 for monotonically decreasing prices', () => {
    const closes = Array.from({ length: 16 }, (_, i) => 200 - i);
    const result = calcRsi(makeCandles(closes), 14)!;
    expect(result).not.toBeNull();
    expect(result.value).toBeCloseTo(0, 0);
    expect(result.signal).toBe('oversold');
  });

  it('returns RSI ~50 for alternating up/down prices', () => {
    // Alternating equal gains and losses
    const closes: number[] = [];
    for (let i = 0; i < 30; i++) {
      closes.push(i % 2 === 0 ? 100 : 101);
    }
    const result = calcRsi(makeCandles(closes), 14)!;
    expect(result).not.toBeNull();
    expect(result.value).toBeGreaterThan(40);
    expect(result.value).toBeLessThan(60);
    expect(result.signal).toBe('neutral');
  });

  it('uses Wilder smoothing correctly', () => {
    // With exactly periods+1 candles, should use SMA for first calculation
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
    const result = calcRsi(makeCandles(closes), 14)!;
    expect(result).not.toBeNull();
    expect(result.value).toBeGreaterThan(0);
    expect(result.value).toBeLessThan(100);
  });

  it('defaults to 14 periods', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calcRsi(makeCandles(closes))!;
    expect(result.periods).toBe(14);
  });
});

// --- MACD Tests ---

describe('calcMacd', () => {
  it('returns null when < slow period candles', () => {
    const candles = makeCandles(Array.from({ length: 20 }, (_, i) => 100 + i));
    expect(calcMacd(candles)).toBeNull();
  });

  it('returns positive MACD line in uptrend', () => {
    // Strong uptrend: fast EMA > slow EMA → positive MACD
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i * 2);
    const result = calcMacd(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.macdLine).toBeGreaterThan(0);
  });

  it('returns negative MACD line in downtrend', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 200 - i * 2);
    const result = calcMacd(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.macdLine).toBeLessThan(0);
  });

  it('histogram equals MACD line minus signal line', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calcMacd(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.histogram).toBeCloseTo(result.macdLine - result.signalLine, 6);
  });

  it('detects bullish crossover', () => {
    // Downtrend then sharp reversal → bullish cross
    const closes: number[] = [];
    for (let i = 0; i < 40; i++) closes.push(200 - i * 2); // down
    for (let i = 0; i < 20; i++) closes.push(120 + i * 5);  // sharp up
    const result = calcMacd(makeCandles(closes))!;
    expect(result).not.toBeNull();
    // After a strong reversal, MACD should be bullish
    expect(result.signal).toBe('bullish');
  });

  it('uses default parameters (12, 26, 9)', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = calcMacd(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.macdLine).toBeDefined();
    expect(result.signalLine).toBeDefined();
    expect(result.histogram).toBeDefined();
  });
});

// --- Bollinger Bands Tests ---

describe('calcBollinger', () => {
  it('returns null when < period candles', () => {
    const candles = makeCandles(Array.from({ length: 10 }, () => 100));
    expect(calcBollinger(candles, 20)).toBeNull();
  });

  it('has very tight bands with constant prices', () => {
    const closes = Array.from({ length: 25 }, () => 100);
    const result = calcBollinger(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.middle).toBeCloseTo(100, 1);
    expect(result.upper).toBeCloseTo(100, 1);
    expect(result.lower).toBeCloseTo(100, 1);
    expect(result.bandwidth).toBeCloseTo(0, 4);
  });

  it('always has upper > middle > lower (with any variance)', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 10);
    const result = calcBollinger(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.upper).toBeGreaterThan(result.middle);
    expect(result.middle).toBeGreaterThan(result.lower);
  });

  it('%B is ~0.5 when price is at middle band', () => {
    // Constant prices → close = middle → %B = 0.5 (or NaN if bands are 0-width)
    // Use slight variation so bands exist
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 0.1 : -0.1));
    const result = calcBollinger(makeCandles(closes))!;
    expect(result).not.toBeNull();
    // With tiny alternating variation, %B should be near the middle (0.25-0.75 range)
    expect(result.percentB).toBeGreaterThan(0.2);
    expect(result.percentB).toBeLessThan(0.8);
  });

  it('bandwidth increases with volatility', () => {
    const stableCloses = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 0.5 : -0.5));
    const volatileCloses = Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10));
    const stableResult = calcBollinger(makeCandles(stableCloses))!;
    const volatileResult = calcBollinger(makeCandles(volatileCloses))!;
    expect(volatileResult.bandwidth).toBeGreaterThan(stableResult.bandwidth);
  });

  it('defaults to period=20, stdDevMultiplier=2', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i);
    const result = calcBollinger(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.middle).toBeDefined();
  });

  it('assigns correct signal based on %B', () => {
    // Price well above upper band
    const closes = Array.from({ length: 25 }, (_, i) => 100 + i * 0.1);
    // Add a spike at the end
    closes[closes.length - 1] = 200;
    const result = calcBollinger(makeCandles(closes))!;
    expect(result).not.toBeNull();
    expect(result.percentB).toBeGreaterThan(1);
    expect(result.signal).toBe('above_upper');
  });
});

// --- Volume Profile Tests ---

describe('calcVolumeProfile', () => {
  it('returns null with empty candles', () => {
    expect(calcVolumeProfile([], 1_000_000)).toBeNull();
  });

  it('detects abnormal volume (> 2x avg)', () => {
    const volumes = [100, 100, 100, 100, 500]; // last is 5x avg
    const candles = makeCandles([10, 10, 10, 10, 10], volumes);
    const result = calcVolumeProfile(candles, 1_000_000)!;
    expect(result).not.toBeNull();
    expect(result.isAbnormal).toBe(true);
    expect(result.currentVolume).toBe(500);
  });

  it('does not flag normal volume as abnormal', () => {
    const volumes = [100, 100, 100, 100, 100];
    const candles = makeCandles([10, 10, 10, 10, 10], volumes);
    const result = calcVolumeProfile(candles, 1_000_000)!;
    expect(result.isAbnormal).toBe(false);
  });

  it('calculates volumeTvlRatio correctly', () => {
    const volumes = [100, 200, 300, 400, 500];
    const candles = makeCandles([10, 10, 10, 10, 10], volumes);
    const tvl = 10_000;
    const result = calcVolumeProfile(candles, tvl)!;
    expect(result.volumeTvlRatio).toBeCloseTo(500 / 10_000, 4);
  });

  it('detects positive volume trend', () => {
    // Older half has lower volume, recent half has higher
    const volumes = [100, 100, 100, 500, 500, 500];
    const candles = makeCandles([10, 10, 10, 10, 10, 10], volumes);
    const result = calcVolumeProfile(candles, 1_000_000)!;
    expect(result.volumeTrend).toBeGreaterThan(0);
  });

  it('calculates avgVolume correctly', () => {
    const volumes = [100, 200, 300];
    const candles = makeCandles([10, 10, 10], volumes);
    const result = calcVolumeProfile(candles, 1_000_000)!;
    expect(result.avgVolume).toBeCloseTo(200, 0);
  });
});

// --- Momentum Score Tests ---

describe('calcMomentum', () => {
  const bullishRsi: RsiResult = { value: 25, signal: 'oversold', periods: 14 };
  const bearishRsi: RsiResult = { value: 75, signal: 'overbought', periods: 14 };
  const neutralRsi: RsiResult = { value: 50, signal: 'neutral', periods: 14 };

  const bullishMacd: MacdResult = {
    macdLine: 1, signalLine: 0.5, histogram: 0.5,
    signal: 'bullish', crossover: 'bullish_cross',
  };
  const bearishMacd: MacdResult = {
    macdLine: -1, signalLine: -0.5, histogram: -0.5,
    signal: 'bearish', crossover: 'bearish_cross',
  };
  const neutralMacd: MacdResult = {
    macdLine: 0, signalLine: 0, histogram: 0,
    signal: 'neutral', crossover: 'none',
  };

  const bullishBoll: BollingerResult = {
    upper: 110, middle: 100, lower: 90, bandwidth: 0.2,
    percentB: 0.05, signal: 'below_lower',
  };
  const bearishBoll: BollingerResult = {
    upper: 110, middle: 100, lower: 90, bandwidth: 0.2,
    percentB: 1.1, signal: 'above_upper',
  };
  const neutralBoll: BollingerResult = {
    upper: 110, middle: 100, lower: 90, bandwidth: 0.2,
    percentB: 0.5, signal: 'middle',
  };

  const bullishVol: VolumeProfileResult = {
    avgVolume: 1000, currentVolume: 3000, volumeTrend: 50,
    volumeTvlRatio: 0.1, isAbnormal: true,
  };
  const bearishVol: VolumeProfileResult = {
    avgVolume: 1000, currentVolume: 3000, volumeTrend: -50,
    volumeTvlRatio: 0.1, isAbnormal: true,
  };
  const neutralVol: VolumeProfileResult = {
    avgVolume: 1000, currentVolume: 1000, volumeTrend: 0,
    volumeTvlRatio: 0.01, isAbnormal: false,
  };

  it('returns Strong Buy when all indicators are bullish', () => {
    const result = calcMomentum(bullishRsi, bullishMacd, bullishBoll, bullishVol);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.label).toBe('Strong Buy');
  });

  it('returns Strong Sell when all indicators are bearish', () => {
    const result = calcMomentum(bearishRsi, bearishMacd, bearishBoll, bearishVol);
    expect(result.score).toBeLessThanOrEqual(-50);
    expect(result.label).toBe('Strong Sell');
  });

  it('returns Neutral with mixed signals', () => {
    const result = calcMomentum(neutralRsi, neutralMacd, neutralBoll, neutralVol);
    expect(result.score).toBeGreaterThanOrEqual(-14);
    expect(result.score).toBeLessThanOrEqual(14);
    expect(result.label).toBe('Neutral');
  });

  it('score is clamped between -100 and +100', () => {
    const result1 = calcMomentum(bullishRsi, bullishMacd, bullishBoll, bullishVol);
    expect(result1.score).toBeLessThanOrEqual(100);
    expect(result1.score).toBeGreaterThanOrEqual(-100);

    const result2 = calcMomentum(bearishRsi, bearishMacd, bearishBoll, bearishVol);
    expect(result2.score).toBeLessThanOrEqual(100);
    expect(result2.score).toBeGreaterThanOrEqual(-100);
  });

  it('has correct component structure', () => {
    const result = calcMomentum(neutralRsi, neutralMacd, neutralBoll, neutralVol);
    expect(result.components).toBeDefined();
    expect(result.components.rsiSignal).toBeDefined();
    expect(result.components.macdSignal).toBeDefined();
    expect(result.components.bollingerSignal).toBeDefined();
    expect(result.components.volumeSignal).toBeDefined();
  });
});

// --- computeDeepAnalysis Tests ---

describe('computeDeepAnalysis', () => {
  it('returns null with insufficient data (too few candles)', () => {
    const candles = makeCandles([100, 101, 102]);
    const result = computeDeepAnalysis(candles, 1_000_000, 'ethereum', '0xabc', 'hour');
    expect(result).toBeNull();
  });

  it('returns full DeepAnalysis with sufficient candles', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 10);
    const candles = makeCandles(closes);
    const result = computeDeepAnalysis(candles, 1_000_000, 'ethereum', '0xabc', 'hour')!;
    expect(result).not.toBeNull();
    expect(result.rsi).toBeDefined();
    expect(result.macd).toBeDefined();
    expect(result.bollinger).toBeDefined();
    expect(result.volumeProfile).toBeDefined();
    expect(result.momentum).toBeDefined();
    expect(result.meta.chain).toBe('ethereum');
    expect(result.meta.address).toBe('0xabc');
    expect(result.meta.timeframe).toBe('hour');
    expect(result.meta.candlesUsed).toBe(50);
    expect(result.meta.calculatedAt).toBeDefined();
  });

  it('works with exactly enough candles for RSI + volume (no MACD/Bollinger)', () => {
    // 16 candles: enough for RSI(14) but not MACD(26) or Bollinger(20)
    const closes = Array.from({ length: 16 }, (_, i) => 100 + i);
    const candles = makeCandles(closes);
    const result = computeDeepAnalysis(candles, 1_000_000, 'base', '0xdef', 'day')!;
    expect(result).not.toBeNull();
    expect(result.rsi).toBeDefined();
    expect(result.volumeProfile).toBeDefined();
    // MACD and Bollinger may be null-like defaults
    expect(result.meta.candlesUsed).toBe(16);
  });
});
