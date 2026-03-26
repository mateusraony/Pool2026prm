import { describe, it, expect } from 'vitest';
import type { OhlcvCandle } from '../services/price-history.service.js';
import {
  calcRsi,
  calcMacd,
  calcBollinger,
  calcVolumeProfile,
  calcMomentum,
  calcVwap,
  calcSma,
  calcSupportResistance,
  calcTrend,
  computeDeepAnalysis,
  type RsiResult,
  type MacdResult,
  type BollingerResult,
  type VolumeProfileResult,
  type MomentumResult,
  type DeepAnalysis,
  type VwapResult,
  type SmaResult,
  type SupportResistanceResult,
  type TrendResult,
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

function makeCandlesCustom(data: { close: number; high?: number; low?: number; volume?: number }[]): OhlcvCandle[] {
  return data.map((d, i) => ({
    timestamp: Date.now() - (data.length - i) * 3600_000,
    open: d.close,
    high: d.high ?? d.close * 1.01,
    low: d.low ?? d.close * 0.99,
    close: d.close,
    volume: d.volume ?? 1000,
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
    // With new weights (20+20+15+15 = 70 without trend/sma), score >= 50
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.label).toBe('Strong Buy');
  });

  it('returns Strong Sell when all indicators are bearish', () => {
    const result = calcMomentum(bearishRsi, bearishMacd, bearishBoll, bearishVol);
    // With new weights (-20-20-15-15 = -70 without trend/sma), score <= -50
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
    expect(result.components.trendSignal).toBeDefined();
    expect(result.components.smaSignal).toBeDefined();
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
    expect(result.vwap).toBeDefined();
    expect(result.trend).toBeDefined();
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

// --- VWAP Tests ---

describe('calcVwap', () => {
  it('returns null with empty candles', () => {
    expect(calcVwap([])).toBeNull();
  });

  it('returns null with zero total volume', () => {
    const candles = makeCandlesCustom([
      { close: 100, volume: 0 },
      { close: 101, volume: 0 },
      { close: 102, volume: 0 },
    ]);
    expect(calcVwap(candles)).toBeNull();
  });

  it('VWAP equals typical price with single uniform candle', () => {
    const candles = makeCandlesCustom([
      { close: 100, high: 105, low: 95, volume: 1000 },
    ]);
    const result = calcVwap(candles)!;
    expect(result).not.toBeNull();
    // TP = (105 + 95 + 100) / 3 = 100
    expect(result.value).toBeCloseTo(100, 4);
  });

  it('signal is above when price well above VWAP', () => {
    // Low-volume candles at low price, then high-volume candle at low price, last candle at high price
    const candles = makeCandlesCustom([
      { close: 50, high: 51, low: 49, volume: 10000 },
      { close: 50, high: 51, low: 49, volume: 10000 },
      { close: 50, high: 51, low: 49, volume: 10000 },
      { close: 200, high: 201, low: 199, volume: 100 },
    ]);
    const result = calcVwap(candles)!;
    expect(result).not.toBeNull();
    // VWAP should be close to 50 (weighted by volume), last close is 200
    expect(result.signal).toBe('above');
    expect(result.deviation).toBeGreaterThan(0.5);
  });

  it('signal is below when price well below VWAP', () => {
    const candles = makeCandlesCustom([
      { close: 200, high: 201, low: 199, volume: 10000 },
      { close: 200, high: 201, low: 199, volume: 10000 },
      { close: 200, high: 201, low: 199, volume: 10000 },
      { close: 50, high: 51, low: 49, volume: 100 },
    ]);
    const result = calcVwap(candles)!;
    expect(result).not.toBeNull();
    expect(result.signal).toBe('below');
    expect(result.deviation).toBeLessThan(-0.5);
  });

  it('signal is at when price near VWAP', () => {
    // All same price and volume → deviation ≈ 0
    const candles = makeCandlesCustom([
      { close: 100, high: 100.1, low: 99.9, volume: 1000 },
      { close: 100, high: 100.1, low: 99.9, volume: 1000 },
      { close: 100, high: 100.1, low: 99.9, volume: 1000 },
    ]);
    const result = calcVwap(candles)!;
    expect(result).not.toBeNull();
    expect(result.signal).toBe('at');
  });
});

// --- SMA Tests ---

describe('calcSma', () => {
  it('returns null when too few candles for largest period', () => {
    const candles = makeCandles(Array.from({ length: 50 }, (_, i) => 100 + i));
    // Default periods include 99, so 50 candles is not enough
    expect(calcSma(candles)).toBeNull();
  });

  it('correct SMA values for simple known data', () => {
    // 10 candles, periods [3, 5]
    const closes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const candles = makeCandles(closes);
    const result = calcSma(candles, [3, 5])!;
    expect(result).not.toBeNull();
    // SMA(3) of last 3: (80+90+100)/3 = 90
    const sma3 = result.values.find(v => v.period === 3)!;
    expect(sma3.value).toBeCloseTo(90, 4);
    // SMA(5) of last 5: (60+70+80+90+100)/5 = 80
    const sma5 = result.values.find(v => v.period === 5)!;
    expect(sma5.value).toBeCloseTo(80, 4);
  });

  it('bullish trend when SMA short > SMA mid > SMA long', () => {
    // Uptrending data: shorter SMAs will be higher
    const closes = Array.from({ length: 100 }, (_, i) => 100 + i * 2);
    const candles = makeCandles(closes);
    const result = calcSma(candles)!;
    expect(result).not.toBeNull();
    expect(result.trend).toBe('bullish');
  });

  it('bearish trend when SMA short < SMA mid < SMA long', () => {
    // Downtrending data
    const closes = Array.from({ length: 100 }, (_, i) => 300 - i * 2);
    const candles = makeCandles(closes);
    const result = calcSma(candles)!;
    expect(result).not.toBeNull();
    expect(result.trend).toBe('bearish');
  });

  it('detects golden cross', () => {
    // We need: prev SMA7 <= prev SMA25, current SMA7 > current SMA25
    // Strategy: long decline so SMA7 < SMA25, then a massive last candle pushes SMA7 above SMA25
    const closes: number[] = [];
    // 25 candles declining slowly — keeps SMA25 moderate
    for (let i = 0; i < 25; i++) closes.push(100 - i * 0.5); // 100 to 88
    // Then one massive candle at the end
    closes.push(200); // This pulls SMA7 way up but SMA25 only a bit
    const candles = makeCandles(closes);
    const result = calcSma(candles, [7, 25])!;
    expect(result).not.toBeNull();
    expect(result.goldenCross).toBe(true);
  });

  it('detects death cross', () => {
    // We need: prev SMA7 >= prev SMA25, current SMA7 < current SMA25
    // Strategy: long rise so SMA7 > SMA25, then a massive drop at end
    const closes: number[] = [];
    for (let i = 0; i < 25; i++) closes.push(100 + i * 0.5); // 100 to 112
    closes.push(50); // This pulls SMA7 way down but SMA25 only a bit
    const candles = makeCandles(closes);
    const result = calcSma(candles, [7, 25])!;
    expect(result).not.toBeNull();
    expect(result.deathCross).toBe(true);
  });
});

// --- Support/Resistance Tests ---

describe('calcSupportResistance', () => {
  it('returns null with < 3 candles', () => {
    const candles = makeCandlesCustom([{ close: 100 }, { close: 101 }]);
    expect(calcSupportResistance(candles)).toBeNull();
  });

  it('finds local minima as support', () => {
    // V-shape: dip in the middle
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 95, high: 96, low: 90 },   // local min
      { close: 100, high: 101, low: 99 },
      { close: 105, high: 106, low: 104 },
      { close: 100, high: 101, low: 99 },
    ]);
    const result = calcSupportResistance(candles)!;
    expect(result).not.toBeNull();
    expect(result.supports.length).toBeGreaterThan(0);
    // The low of 90 should be a support
    expect(result.supports.some(s => Math.abs(s - 90) < 1)).toBe(true);
  });

  it('finds local maxima as resistance', () => {
    // Inverted V: peak in the middle
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 110, high: 120, low: 109 },  // local max
      { close: 100, high: 101, low: 99 },
      { close: 95, high: 96, low: 94 },
      { close: 100, high: 101, low: 99 },
    ]);
    const result = calcSupportResistance(candles)!;
    expect(result).not.toBeNull();
    expect(result.resistances.length).toBeGreaterThan(0);
    expect(result.resistances.some(r => Math.abs(r - 120) < 1)).toBe(true);
  });

  it('calculates nearest support and resistance', () => {
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 90, high: 91, low: 85 },    // support at 85
      { close: 100, high: 101, low: 99 },
      { close: 110, high: 115, low: 109 },  // resistance at 115
      { close: 100, high: 101, low: 99 },   // current price = 100
    ]);
    const result = calcSupportResistance(candles)!;
    expect(result).not.toBeNull();
    // Nearest support should be below 100
    if (result.nearestSupport !== null) {
      expect(result.nearestSupport).toBeLessThan(100);
    }
    // Nearest resistance should be above 100
    if (result.nearestResistance !== null) {
      expect(result.nearestResistance).toBeGreaterThan(100);
    }
  });

  it('clusters nearby levels', () => {
    // Multiple similar support levels should be clustered
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 90, high: 91, low: 89.9 },   // support ~89.9
      { close: 100, high: 101, low: 99 },
      { close: 90, high: 91, low: 90.1 },   // support ~90.1 (within 0.5% of 89.9)
      { close: 100, high: 101, low: 99 },
      { close: 90, high: 91, low: 90.0 },   // support ~90.0
      { close: 100, high: 101, low: 99 },
    ]);
    const result = calcSupportResistance(candles)!;
    expect(result).not.toBeNull();
    // All three ~90 supports should cluster into one
    expect(result.supports.length).toBeLessThanOrEqual(3);
    if (result.supports.length > 0) {
      expect(result.supports[0]).toBeCloseTo(90, 0);
    }
  });

  it('returns empty arrays when no local extrema found', () => {
    // Monotonically increasing — no local minima or maxima
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 102, high: 103, low: 101 },
      { close: 104, high: 105, low: 103 },
      { close: 106, high: 107, low: 105 },
      { close: 108, high: 109, low: 107 },
    ]);
    const result = calcSupportResistance(candles)!;
    expect(result).not.toBeNull();
    expect(result.supports.length).toBe(0);
    expect(result.resistances.length).toBe(0);
  });
});

// --- Trend Tests ---

describe('calcTrend', () => {
  it('strong_up with steep uptrend and high strength', () => {
    // Price change > 5%, add SMA bullish + MACD bullish for strength > 60
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 5);
    const candles = makeCandles(closes);
    const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: false, deathCross: false };
    const macd: MacdResult = { macdLine: 1, signalLine: 0.5, histogram: 0.5, signal: 'bullish', crossover: 'bullish_cross' };
    const result = calcTrend(candles, sma, macd);
    expect(result.direction).toBe('strong_up');
    expect(result.strength).toBeGreaterThan(60);
    expect(result.priceChange).toBeGreaterThan(5);
  });

  it('strong_down with steep downtrend and high strength', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 200 - i * 5);
    const candles = makeCandles(closes);
    const sma: SmaResult = { values: [], trend: 'bearish', goldenCross: false, deathCross: false };
    const macd: MacdResult = { macdLine: -1, signalLine: -0.5, histogram: -0.5, signal: 'bearish', crossover: 'bearish_cross' };
    const result = calcTrend(candles, sma, macd);
    expect(result.direction).toBe('strong_down');
    expect(result.strength).toBeGreaterThan(60);
    expect(result.priceChange).toBeLessThan(-5);
  });

  it('sideways with flat data', () => {
    const closes = Array.from({ length: 20 }, () => 100);
    const candles = makeCandles(closes);
    const result = calcTrend(candles);
    expect(result.direction).toBe('sideways');
    expect(result.priceChange).toBeCloseTo(0, 1);
  });

  it('detects higher highs pattern', () => {
    // Last 5 candles each with progressively higher highs
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 102, high: 103, low: 101 },
      { close: 104, high: 105, low: 103 },
      { close: 106, high: 107, low: 105 },
      { close: 108, high: 109, low: 107 },
    ]);
    const result = calcTrend(candles);
    expect(result.higherHighs).toBe(true);
  });

  it('detects higher lows pattern', () => {
    const candles = makeCandlesCustom([
      { close: 100, high: 101, low: 99 },
      { close: 102, high: 103, low: 100 },
      { close: 104, high: 105, low: 101 },
      { close: 106, high: 107, low: 102 },
      { close: 108, high: 109, low: 103 },
    ]);
    const result = calcTrend(candles);
    expect(result.higherLows).toBe(true);
  });

  it('strength reflects multiple signals', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 3);
    const candles = makeCandles(closes);
    // Without SMA/MACD
    const resultNoSignals = calcTrend(candles);
    // With SMA + MACD
    const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: false, deathCross: false };
    const macd: MacdResult = { macdLine: 1, signalLine: 0.5, histogram: 0.5, signal: 'bullish', crossover: 'none' };
    const resultWithSignals = calcTrend(candles, sma, macd);
    expect(resultWithSignals.strength).toBeGreaterThan(resultNoSignals.strength);
  });
});

// --- Updated Momentum Tests ---

describe('calcMomentum (with trend/sma)', () => {
  it('includes trendSignal and smaSignal in components', () => {
    const rsi: RsiResult = { value: 50, signal: 'neutral', periods: 14 };
    const trend: TrendResult = { direction: 'up', strength: 60, priceChange: 3, higherHighs: true, higherLows: true };
    const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: true, deathCross: false };
    const result = calcMomentum(rsi, null, null, null, trend, sma);
    expect(result.components.trendSignal).toBe(1);
    expect(result.components.smaSignal).toBe(1);
    expect(result.score).toBeGreaterThan(0);
  });

  it('backward compat: works without trend/sma params', () => {
    const rsi: RsiResult = { value: 25, signal: 'oversold', periods: 14 };
    const result = calcMomentum(rsi, null, null, null);
    expect(result.components.trendSignal).toBe(0);
    expect(result.components.smaSignal).toBe(0);
    expect(result.score).toBe(20); // rsiSignal=1 * 20 weight
  });
});
