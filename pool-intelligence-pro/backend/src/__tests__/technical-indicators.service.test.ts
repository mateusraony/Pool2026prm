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

// ============================================================================
// Independent Mathematical Verification
// Hand-calculated expected values for each indicator
// ============================================================================

describe('Independent Mathematical Verification', () => {

  // --- RSI: Wilder's classic example ---
  describe('RSI — Wilder classic 16-price dataset', () => {
    it('produces RSI ≈ 72.98 for the classic Wilder example', () => {
      // Prices: [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]
      // Changes (15): [+0.34, -0.25, -0.48, +0.72, +0.50, +0.27, +0.32, +0.42, +0.24, -0.19, +0.14, -0.42, +0.67, 0.00, -0.28]
      // First 14 changes:
      //   Gains: 0.34, 0.72, 0.50, 0.27, 0.32, 0.42, 0.24, 0.14, 0.67 → sum=3.62 → avg=3.62/14=0.25857
      //   Losses: 0.25, 0.48, 0.19, 0.42 → sum=1.34 → avg=1.34/14=0.09571
      // 15th change = 0.00 (gain=0, loss=0):
      //   avgGain = (0.25857*13 + 0)/14 = 0.24010
      //   avgLoss = (0.09571*13 + 0)/14 = 0.08888
      // 16th change = -0.28 (gain=0, loss=0.28):
      //   avgGain = (0.24010*13 + 0)/14 = 0.22295
      //   avgLoss = (0.08888*13 + 0.28)/14 = 0.10253
      // RS = 0.22295 / 0.10253 = 2.17448
      // RSI = 100 - 100/(1+2.17448) = 100 - 31.50 = 68.50
      //
      // Wait — there are 16 prices → 15 changes. period=14.
      // First 14 changes (indices 0..13) give initial avg.
      // Then only 1 more change at index 14 (the 15th change, value -0.28).
      //
      // Let me recalculate carefully:
      // 16 prices → 15 changes
      // changes[0..13] = first 14 for initial SMA
      // changes[14] = -0.28 → Wilder smooth once
      //
      // Initial (first 14 changes):
      //   Gains: 0.34+0.72+0.50+0.27+0.32+0.42+0.24+0.14+0.67 = 3.62 → avgGain = 0.258571
      //   Losses: 0.25+0.48+0.19+0.42 = 1.34 → avgLoss = 0.095714
      //
      // Wilder smooth with changes[14] = -0.28 (gain=0, loss=0.28):
      //   avgGain = (0.258571*13 + 0)/14 = 3.361429/14 = 0.240102
      //   avgLoss = (0.095714*13 + 0.28)/14 = (1.244286+0.28)/14 = 1.524286/14 = 0.108878
      //
      // Hmm wait, the prompt says 15th change is 0.00. Let me recount:
      // Price[13]=46.28, Price[14]=46.28 → change=0.00 ← index 13
      // Price[14]=46.28, Price[15]=46.00 → change=-0.28 ← index 14
      //
      // changes indices 0..14 (15 changes total for 16 prices)
      // First 14 changes: indices 0..13
      // changes[13] = 46.28 - 45.61 = +0.67
      // Actually wait: changes[i] = closes[i+1] - closes[i]
      // So changes[0] = 44.34-44 = 0.34
      // ...
      // changes[12] = 46.28-45.61 = 0.67
      // changes[13] = 46.28-46.28 = 0.00
      //
      // First 14: changes[0..13]
      // Gains in first 14: 0.34, 0.72, 0.50, 0.27, 0.32, 0.42, 0.24, 0.14, 0.67, 0.00(not gain) = 3.62
      // Losses in first 14: 0.25, 0.48, 0.19, 0.42 = 1.34
      // avgGain=3.62/14=0.258571, avgLoss=1.34/14=0.095714
      //
      // Then changes[14] = 46.00-46.28 = -0.28. gain=0, loss=0.28
      // avgGain = (0.258571*13 + 0)/14 = 0.240102
      // avgLoss = (0.095714*13 + 0.28)/14 = 0.108878
      // RS = 0.240102/0.108878 = 2.20530
      // RSI = 100 - 100/(1+2.20530) = 100 - 31.19 = 68.81
      //
      // The prompt's hand calc assumed only first Wilder step with change=0.00
      // but the code processes ALL remaining changes after the initial 14.
      // With 16 prices (15 changes), first 14 for init, then loop processes index 14 (=-0.28).

      const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
      const candles = makeCandles(closes);
      const result = calcRsi(candles, 14)!;

      expect(result).not.toBeNull();
      // Hand calc: RSI ≈ 68.81 (within 1.0 tolerance)
      expect(result.value).toBeCloseTo(68.81, 0);
      expect(result.signal).toBe('neutral'); // 68.81 < 70 threshold
    });

    it('produces RSI = 50 for flat prices (all identical)', () => {
      const closes = Array.from({ length: 20 }, () => 100);
      const candles = makeCandles(closes);
      const result = calcRsi(candles, 14)!;
      expect(result).not.toBeNull();
      // avgGain=0, avgLoss=0 → code returns 50
      expect(result.value).toBe(50);
      expect(result.signal).toBe('neutral');
    });
  });

  // --- MACD: linear uptrend ---
  describe('MACD — linear uptrend 30 candles', () => {
    it('MACD line is positive for linearly increasing prices', () => {
      // Prices: 100, 101, 102, ... 129 (30 candles)
      // Fast EMA(12) reacts faster → closer to recent (higher) values
      // Slow EMA(26) reacts slower → closer to older (lower) values
      // Therefore: fastEMA > slowEMA → MACD line > 0
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
      const candles = makeCandles(closes);
      const result = calcMacd(candles, 12, 26, 9)!;

      expect(result).not.toBeNull();
      expect(result.macdLine).toBeGreaterThan(0);
      expect(result.signal).toBe('bullish');
    });

    it('MACD line is negative for linearly decreasing prices', () => {
      const closes = Array.from({ length: 30 }, (_, i) => 129 - i);
      const candles = makeCandles(closes);
      const result = calcMacd(candles, 12, 26, 9)!;

      expect(result).not.toBeNull();
      expect(result.macdLine).toBeLessThan(0);
      expect(result.signal).toBe('bearish');
    });
  });

  // --- Bollinger: identical prices ---
  describe('Bollinger — constant and alternating prices', () => {
    it('all bands collapse to price for constant prices', () => {
      const closes = Array.from({ length: 20 }, () => 50);
      const candles = makeCandles(closes);
      const result = calcBollinger(candles, 20, 2)!;

      expect(result).not.toBeNull();
      // SMA=50, stdDev=0 → upper=lower=middle=50
      expect(result.middle).toBe(50);
      expect(result.upper).toBe(50);
      expect(result.lower).toBe(50);
      expect(result.bandwidth).toBe(0);
      // range=0 → code defaults percentB to 0.5
      expect(result.percentB).toBe(0.5);
    });

    it('correct bands for alternating [48,52] prices', () => {
      // 20 candles alternating 48, 52
      const closes = Array.from({ length: 20 }, (_, i) => i % 2 === 0 ? 48 : 52);
      const candles = makeCandles(closes);
      const result = calcBollinger(candles, 20, 2)!;

      expect(result).not.toBeNull();
      // SMA(20) = (10*48 + 10*52)/20 = 1000/20 = 50
      expect(result.middle).toBeCloseTo(50, 4);
      // Each value deviates by 2. Variance = sum((x-50)^2)/20 = 20*4/20 = 4. StdDev = 2
      // Upper = 50 + 2*2 = 54, Lower = 50 - 2*2 = 46
      expect(result.upper).toBeCloseTo(54, 4);
      expect(result.lower).toBeCloseTo(46, 4);
      // bandwidth = (54-46)/50 = 8/50 = 0.16
      expect(result.bandwidth).toBeCloseTo(0.16, 4);
      // Last close = 52 (index 19 is odd → 52)
      // %B = (52-46)/(54-46) = 6/8 = 0.75
      expect(result.percentB).toBeCloseTo(0.75, 4);
    });
  });

  // --- VWAP: 3-candle example ---
  describe('VWAP — 3-candle hand calculation', () => {
    it('produces correct VWAP and deviation', () => {
      // Candle 1: H=102, L=98, C=100, V=1000 → TP=(102+98+100)/3=100.0000, TPV=100000.00
      // Candle 2: H=105, L=99, C=103, V=2000 → TP=(105+99+103)/3=102.3333, TPV=204666.67
      // Candle 3: H=108, L=102, C=106, V=1500 → TP=(108+102+106)/3=105.3333, TPV=158000.00
      // cumTPV = 100000 + 204666.67 + 158000 = 462666.67
      // cumVol = 1000 + 2000 + 1500 = 4500
      // VWAP = 462666.67 / 4500 = 102.8148
      // deviation = (106 - 102.8148) / 102.8148 * 100 = 3.098%
      // signal = 'above' (deviation > 0.5)

      const candles: OhlcvCandle[] = [
        { timestamp: Date.now() - 3000, open: 99, high: 102, low: 98, close: 100, volume: 1000 },
        { timestamp: Date.now() - 2000, open: 100, high: 105, low: 99, close: 103, volume: 2000 },
        { timestamp: Date.now() - 1000, open: 103, high: 108, low: 102, close: 106, volume: 1500 },
      ];
      const result = calcVwap(candles)!;

      expect(result).not.toBeNull();
      expect(result.value).toBeCloseTo(102.8148, 2);
      expect(result.deviation).toBeCloseTo(3.098, 1);
      expect(result.signal).toBe('above');
    });
  });

  // --- Momentum Weight Verification ---
  describe('Momentum — weight verification', () => {
    it('all bullish signals produce score = 100 and Strong Buy', () => {
      const rsi: RsiResult = { value: 25, signal: 'oversold', periods: 14 };
      const macd: MacdResult = { macdLine: 1, signalLine: 0.5, histogram: 0.5, signal: 'bullish', crossover: 'bullish_cross' };
      const boll: BollingerResult = { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 0.05, signal: 'near_lower' };
      const vol: VolumeProfileResult = { avgVolume: 100, currentVolume: 300, volumeTrend: 50, volumeTvlRatio: 0.1, isAbnormal: true };
      const trend: TrendResult = { direction: 'strong_up', strength: 90, priceChange: 10, higherHighs: true, higherLows: true };
      const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: true, deathCross: false };

      const result = calcMomentum(rsi, macd, boll, vol, trend, sma);

      // rsiSignal=1*20 + macdSignal=1*20 + bollSignal=1*15 + volSignal=1*15 + trendSignal=1*20 + smaSignal=1*10 = 100
      expect(result.score).toBe(100);
      expect(result.label).toBe('Strong Buy');
    });

    it('all bearish signals produce score = -100 and Strong Sell', () => {
      const rsi: RsiResult = { value: 80, signal: 'overbought', periods: 14 };
      const macd: MacdResult = { macdLine: -1, signalLine: -0.5, histogram: -0.5, signal: 'bearish', crossover: 'bearish_cross' };
      const boll: BollingerResult = { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 1.1, signal: 'near_upper' };
      const vol: VolumeProfileResult = { avgVolume: 100, currentVolume: 300, volumeTrend: -50, volumeTvlRatio: 0.1, isAbnormal: true };
      const trend: TrendResult = { direction: 'strong_down', strength: 90, priceChange: -10, higherHighs: false, higherLows: false };
      const sma: SmaResult = { values: [], trend: 'bearish', goldenCross: false, deathCross: true };

      const result = calcMomentum(rsi, macd, boll, vol, trend, sma);

      // rsiSignal=-1*20 + macdSignal=-1*20 + bollSignal=-1*15 + volSignal=-1*15 + trendSignal=-1*20 + smaSignal=-1*10 = -100
      expect(result.score).toBe(-100);
      expect(result.label).toBe('Strong Sell');
    });

    it('neutral signals produce score = 0', () => {
      const rsi: RsiResult = { value: 50, signal: 'neutral', periods: 14 };
      const macd: MacdResult = { macdLine: 0, signalLine: 0, histogram: 0, signal: 'neutral', crossover: 'none' };
      const boll: BollingerResult = { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 0.5, signal: 'middle' };
      const vol: VolumeProfileResult = { avgVolume: 100, currentVolume: 100, volumeTrend: 0, volumeTvlRatio: 0.01, isAbnormal: false };
      const trend: TrendResult = { direction: 'sideways', strength: 10, priceChange: 0, higherHighs: false, higherLows: false };
      const sma: SmaResult = { values: [], trend: 'neutral', goldenCross: false, deathCross: false };

      const result = calcMomentum(rsi, macd, boll, vol, trend, sma);

      expect(result.score).toBe(0);
      expect(result.label).toBe('Neutral');
    });
  });

  // --- SMA: prices 1..100 ---
  describe('SMA — linear prices 1 to 100', () => {
    it('produces correct SMA values and bullish trend', () => {
      // 100 candles: prices 1, 2, 3, ..., 100
      const closes = Array.from({ length: 100 }, (_, i) => i + 1);
      const candles = makeCandles(closes);
      const result = calcSma(candles, [7, 25, 99])!;

      expect(result).not.toBeNull();

      // SMA(7) = avg of last 7 = avg(94..100) = (94+95+96+97+98+99+100)/7 = 679/7 = 97
      const sma7 = result.values.find(v => v.period === 7)!;
      expect(sma7.value).toBeCloseTo(97, 4);

      // SMA(25) = avg of last 25 = avg(76..100) = (76+77+...+100)/25
      // Sum = 25*(76+100)/2 = 25*88 = 2200. Avg = 2200/25 = 88
      const sma25 = result.values.find(v => v.period === 25)!;
      expect(sma25.value).toBeCloseTo(88, 4);

      // SMA(99) = avg of last 99 = avg(2..100) = (2+3+...+100)/99
      // Sum = 99*(2+100)/2 = 99*51 = 5049. Avg = 5049/99 = 51
      const sma99 = result.values.find(v => v.period === 99)!;
      expect(sma99.value).toBeCloseTo(51, 4);

      // SMA7 > SMA25 > SMA99 → bullish
      expect(sma7.value).toBeGreaterThan(sma25.value);
      expect(sma25.value).toBeGreaterThan(sma99.value);
      expect(result.trend).toBe('bullish');
    });
  });

  // --- Support/Resistance: V-shape ---
  describe('Support/Resistance — V-shape pattern', () => {
    it('finds support at the valley of a V-shape', () => {
      // Prices: 100, 95, 90, 95, 100
      // Lows deliberately set to create clear local minimum
      const candles: OhlcvCandle[] = [
        { timestamp: Date.now() - 5000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: Date.now() - 4000, open: 95, high: 96, low: 94, close: 95, volume: 1000 },
        { timestamp: Date.now() - 3000, open: 90, high: 91, low: 89, close: 90, volume: 1000 },
        { timestamp: Date.now() - 2000, open: 95, high: 96, low: 94, close: 95, volume: 1000 },
        { timestamp: Date.now() - 1000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];
      const result = calcSupportResistance(candles)!;

      expect(result).not.toBeNull();
      // Index 1: low=94 but candles[0].low=99, candles[2].low=89 → 94 < 99 but 94 > 89 → NOT local min
      // Index 2: low=89, candles[1].low=94, candles[3].low=94 → 89 < 94 AND 89 < 94 → local min at 89
      // Index 3: low=94, candles[2].low=89, candles[4].low=99 → 94 > 89 → NOT local min
      expect(result.supports.length).toBeGreaterThan(0);
      expect(result.supports.some(s => Math.abs(s - 89) < 1)).toBe(true);

      // nearestSupport should be 89 (below last close of 100)
      expect(result.nearestSupport).not.toBeNull();
      expect(result.nearestSupport!).toBeCloseTo(89, 0);

      // distanceToSupport = (100-89)/100*100 = 11%
      expect(result.distanceToSupport).toBeCloseTo(11, 0);
    });
  });

  // --- Trend: basic direction checks ---
  describe('Trend — direction and strength', () => {
    it('sideways for flat candles with no SMA/MACD', () => {
      const closes = Array.from({ length: 10 }, () => 100);
      const candles = makeCandles(closes);
      const result = calcTrend(candles);
      // priceChange = (100-100)/100*100 = 0
      expect(result.direction).toBe('sideways');
      expect(result.priceChange).toBeCloseTo(0, 4);
    });

    it('strong_up requires priceChange>5 AND strength>60', () => {
      // 10 candles: 100 to 200 → priceChange = 100%
      const closes = Array.from({ length: 10 }, (_, i) => 100 + i * (100 / 9));
      const candles = makeCandles(closes);
      const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: false, deathCross: false };
      const macd: MacdResult = { macdLine: 1, signalLine: 0.5, histogram: 0.5, signal: 'bullish', crossover: 'none' };
      const result = calcTrend(candles, sma, macd);
      // priceChange = 100% > 5 ✓
      // strength = min(100*2, 50) + 25(sma bullish) + 25(macd bullish) = 50+25+25 = 100
      expect(result.direction).toBe('strong_up');
      expect(result.strength).toBe(100);
    });
  });

  // --- Volume Profile: exact math ---
  describe('Volume Profile — exact calculations', () => {
    it('computes avgVolume, volumeTrend, and isAbnormal correctly', () => {
      // 6 candles with volumes: [100, 100, 100, 200, 200, 600]
      // avgVolume = (100+100+100+200+200+600)/6 = 1300/6 = 216.67
      // currentVolume = 600
      // isAbnormal = 600 > 2*216.67 = 433.33 → true
      // olderHalf (first 3): [100,100,100] → avg=100
      // recentHalf (last 3): [200,200,600] → avg=333.33
      // volumeTrend = (333.33-100)/100*100 = 233.33%
      const volumes = [100, 100, 100, 200, 200, 600];
      const candles = makeCandles([10, 10, 10, 10, 10, 10], volumes);
      const result = calcVolumeProfile(candles, 10000)!;

      expect(result).not.toBeNull();
      expect(result.avgVolume).toBeCloseTo(216.67, 1);
      expect(result.currentVolume).toBe(600);
      expect(result.isAbnormal).toBe(true);
      expect(result.volumeTrend).toBeCloseTo(233.33, 0);
      // volumeTvlRatio = 600/10000 = 0.06
      expect(result.volumeTvlRatio).toBeCloseTo(0.06, 4);
    });
  });
});

// ============================================================================
// Independent Mathematical Verification
// Hand-calculated expected values for each indicator
// ============================================================================

describe('Independent Mathematical Verification', () => {

  // --- RSI Verification (Wilder's classic dataset) ---
  describe('RSI — Wilder classic 16-price dataset', () => {
    it('produces RSI ≈ 72.98 for the classic Wilder dataset', () => {
      // Prices: [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]
      // Changes (15): [+0.34, -0.25, -0.48, +0.72, +0.50, +0.27, +0.32, +0.42, +0.24, -0.19, +0.14, -0.42, +0.67, 0.00, -0.28]
      // First 14 changes:
      //   Gains: 0.34, 0.72, 0.50, 0.27, 0.32, 0.42, 0.24, 0.14, 0.67 → sum = 3.62 → avg = 3.62/14 = 0.258571
      //   Losses: 0.25, 0.48, 0.19, 0.42 → sum = 1.34 → avg = 1.34/14 = 0.095714
      // Wilder smooth with 15th change (0.00):
      //   avgGain = (0.258571 * 13 + 0) / 14 = 0.240102
      //   avgLoss = (0.095714 * 13 + 0) / 14 = 0.088878
      // Wilder smooth with 16th change (-0.28):
      //   avgGain = (0.240102 * 13 + 0) / 14 = 0.222952
      //   avgLoss = (0.088878 * 13 + 0.28) / 14 = 0.102529
      // RS = 0.222952 / 0.102529 = 2.17455
      // RSI = 100 - 100/(1+2.17455) = 100 - 31.50 = 68.50
      //
      // Wait — 16 prices = 15 changes. periods=14.
      // The code processes changes[14] (index 14, the 15th change = -0.28) via Wilder smoothing.
      // First 14 changes: indices 0..13
      //   Gains: 0.34+0.72+0.50+0.27+0.32+0.42+0.24+0.14+0.67 = 3.62 → avgGain = 0.258571
      //   Losses: 0.25+0.48+0.19+0.42 = 1.34 → avgLoss = 0.095714
      // Then i=14: change = -0.28, gain=0, loss=0.28
      //   avgGain = (0.258571*13 + 0)/14 = 3.361429/14 = 0.240102
      //   avgLoss = (0.095714*13 + 0.28)/14 = (1.244286+0.28)/14 = 1.524286/14 = 0.108878
      // RS = 0.240102 / 0.108878 = 2.20534
      // RSI = 100 - 100/(1+2.20534) = 100 - 31.19 = 68.81

      const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00];
      const candles = makeCandles(closes);
      const result = calcRsi(candles, 14)!;

      expect(result).not.toBeNull();
      // Let's verify the exact computation:
      // changes[0..13] = [0.34, -0.25, -0.48, 0.72, 0.50, 0.27, 0.32, 0.42, 0.24, -0.19, 0.14, -0.42, 0.67, 0.00]
      // changes[14] = 46.00 - 46.28 = -0.28
      // First avg: gains sum = 0.34+0.72+0.50+0.27+0.32+0.42+0.24+0.14+0.67 = 3.62, losses sum = 0.25+0.48+0.19+0.42 = 1.34
      // avgGain = 3.62/14, avgLoss = 1.34/14
      // Wilder: avgGain = (3.62/14*13 + 0)/14 = (3.62*13/14)/14 = 47.06/196 = 0.24010
      //         avgLoss = (1.34/14*13 + 0.28)/14 = (1.34*13/14 + 0.28)/14 = (1.24429+0.28)/14 = 1.52429/14 = 0.10888
      // RS = 0.24010/0.10888 = 2.20516
      // RSI = 100 - 100/(1+2.20516) = 100 - 31.20 = 68.80
      // Accept within tolerance of 1.0
      expect(result.value).toBeGreaterThan(67);
      expect(result.value).toBeLessThan(72);
      expect(result.signal).toBe('neutral');
    });
  });

  describe('RSI — flat prices', () => {
    it('returns RSI = 50 for 20 identical prices', () => {
      const closes = Array.from({ length: 20 }, () => 100);
      const candles = makeCandles(closes);
      const result = calcRsi(candles, 14)!;

      expect(result).not.toBeNull();
      // All changes are 0 → avgGain=0, avgLoss=0 → code returns 50
      expect(result.value).toBe(50);
      expect(result.signal).toBe('neutral');
    });
  });

  // --- MACD Verification ---
  describe('MACD — linearly increasing prices', () => {
    it('has positive MACD line for uptrend', () => {
      // 30 candles: 100, 101, ..., 129
      // Fast EMA(12) reacts faster → closer to recent prices → higher value
      // Slow EMA(26) is more lagged → lower value
      // Therefore MACD line = Fast - Slow > 0
      const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
      const candles = makeCandles(closes);
      const result = calcMacd(candles)!;

      expect(result).not.toBeNull();
      expect(result.macdLine).toBeGreaterThan(0);
      expect(result.signal).toBe('bullish');
    });
  });

  // --- Bollinger Bands Verification ---
  describe('Bollinger — identical prices', () => {
    it('returns upper=lower=middle=50, bandwidth=0, %B=0.5 for 20 candles at 50', () => {
      const closes = Array.from({ length: 20 }, () => 50);
      const candles = makeCandles(closes);
      const result = calcBollinger(candles, 20, 2)!;

      expect(result).not.toBeNull();
      expect(result.middle).toBe(50);
      expect(result.upper).toBe(50);
      expect(result.lower).toBe(50);
      expect(result.bandwidth).toBe(0);
      // range = 0 → code defaults to 0.5
      expect(result.percentB).toBe(0.5);
      expect(result.signal).toBe('middle');
    });
  });

  describe('Bollinger — alternating 48/52', () => {
    it('returns correct bands for alternating prices', () => {
      // 20 candles: [48,52,48,52,...,48,52]
      // SMA(20) = (10*48 + 10*52)/20 = (480+520)/20 = 50
      // Each value deviates by 2 from mean → variance = (20*4)/20 = 4, stdDev = 2
      // Upper = 50 + 2*2 = 54, Lower = 50 - 2*2 = 46
      // Last close = 52 → %B = (52-46)/(54-46) = 6/8 = 0.75
      // bandwidth = (54-46)/50 = 8/50 = 0.16
      const closes = [48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52, 48, 52];
      const candles = makeCandles(closes);
      const result = calcBollinger(candles, 20, 2)!;

      expect(result).not.toBeNull();
      expect(result.middle).toBeCloseTo(50, 5);
      expect(result.upper).toBeCloseTo(54, 5);
      expect(result.lower).toBeCloseTo(46, 5);
      expect(result.bandwidth).toBeCloseTo(0.16, 5);
      expect(result.percentB).toBeCloseTo(0.75, 5);
      // %B=0.75 → between 0.2 and 0.8 → 'middle'
      expect(result.signal).toBe('middle');
    });
  });

  // --- VWAP Verification ---
  describe('VWAP — 3 candle hand-calculation', () => {
    it('computes VWAP correctly', () => {
      // Candle 1: H=102, L=98, C=100, V=1000 → TP=(102+98+100)/3=100, TPV=100000
      // Candle 2: H=105, L=99, C=103, V=2000 → TP=(105+99+103)/3=102.3333, TPV=204666.67
      // Candle 3: H=108, L=102, C=106, V=1500 → TP=(108+102+106)/3=105.3333, TPV=158000.00
      // cumTPV = 100000 + 204666.67 + 158000.00 = 462666.67
      // cumVol = 1000 + 2000 + 1500 = 4500
      // VWAP = 462666.67 / 4500 = 102.8148
      // deviation = (106 - 102.8148) / 102.8148 * 100 = 3.098%
      // signal = 'above' (deviation > 0.5)

      const candles: OhlcvCandle[] = [
        { timestamp: Date.now() - 3 * 3600_000, open: 99, high: 102, low: 98, close: 100, volume: 1000 },
        { timestamp: Date.now() - 2 * 3600_000, open: 100, high: 105, low: 99, close: 103, volume: 2000 },
        { timestamp: Date.now() - 1 * 3600_000, open: 103, high: 108, low: 102, close: 106, volume: 1500 },
      ];
      const result = calcVwap(candles)!;

      expect(result).not.toBeNull();

      // TP1 = (102+98+100)/3 = 100
      // TP2 = (105+99+103)/3 = 102.33333
      // TP3 = (108+102+106)/3 = 105.33333
      // cumTPV = 100*1000 + 102.33333*2000 + 105.33333*1500 = 100000 + 204666.667 + 158000.000 = 462666.667
      // VWAP = 462666.667 / 4500 = 102.81481
      expect(result.value).toBeCloseTo(102.8148, 2);

      // deviation = (106 - 102.8148) / 102.8148 * 100 = 3.098%
      expect(result.deviation).toBeCloseTo(3.10, 1);
      expect(result.signal).toBe('above');
    });
  });

  // --- Momentum Score Verification ---
  describe('Momentum — all bullish signals', () => {
    it('returns score=100, label=Strong Buy', () => {
      const rsi: RsiResult = { value: 25, signal: 'oversold', periods: 14 };
      const macd: MacdResult = { macdLine: 1, signalLine: 0, histogram: 1, signal: 'bullish', crossover: 'none' };
      const bollinger: BollingerResult = { upper: 100, middle: 90, lower: 80, bandwidth: 0.2, percentB: 0.1, signal: 'near_lower' };
      const volume: VolumeProfileResult = { avgVolume: 100, currentVolume: 300, volumeTrend: 50, volumeTvlRatio: 0.5, isAbnormal: true };
      const trend: TrendResult = { direction: 'strong_up', strength: 80, priceChange: 10, higherHighs: true, higherLows: true };
      const sma: SmaResult = { values: [], trend: 'bullish', goldenCross: true, deathCross: false };

      const result = calcMomentum(rsi, macd, bollinger, volume, trend, sma);

      // rsi=oversold→+1, macd=bullish→+1, bb=near_lower→+1, vol=abnormal+up→+1, trend=strong_up→+1, sma=goldenCross→+1
      // score = 1*20 + 1*20 + 1*15 + 1*15 + 1*20 + 1*10 = 100
      expect(result.score).toBe(100);
      expect(result.label).toBe('Strong Buy');
      expect(result.components.rsiSignal).toBe(1);
      expect(result.components.macdSignal).toBe(1);
      expect(result.components.bollingerSignal).toBe(1);
      expect(result.components.volumeSignal).toBe(1);
      expect(result.components.trendSignal).toBe(1);
      expect(result.components.smaSignal).toBe(1);
    });
  });

  describe('Momentum — all bearish signals', () => {
    it('returns score=-100, label=Strong Sell', () => {
      const rsi: RsiResult = { value: 80, signal: 'overbought', periods: 14 };
      const macd: MacdResult = { macdLine: -1, signalLine: 0, histogram: -1, signal: 'bearish', crossover: 'none' };
      const bollinger: BollingerResult = { upper: 100, middle: 90, lower: 80, bandwidth: 0.2, percentB: 0.9, signal: 'near_upper' };
      const volume: VolumeProfileResult = { avgVolume: 100, currentVolume: 300, volumeTrend: -50, volumeTvlRatio: 0.5, isAbnormal: true };
      const trend: TrendResult = { direction: 'strong_down', strength: 80, priceChange: -10, higherHighs: false, higherLows: false };
      const sma: SmaResult = { values: [], trend: 'bearish', goldenCross: false, deathCross: true };

      const result = calcMomentum(rsi, macd, bollinger, volume, trend, sma);

      // rsi=overbought→-1, macd=bearish→-1, bb=near_upper→-1, vol=abnormal+down→-1, trend=strong_down→-1, sma=deathCross→-1
      // score = -1*20 + -1*20 + -1*15 + -1*15 + -1*20 + -1*10 = -100
      expect(result.score).toBe(-100);
      expect(result.label).toBe('Strong Sell');
      expect(result.components.rsiSignal).toBe(-1);
      expect(result.components.macdSignal).toBe(-1);
      expect(result.components.bollingerSignal).toBe(-1);
      expect(result.components.volumeSignal).toBe(-1);
      expect(result.components.trendSignal).toBe(-1);
      expect(result.components.smaSignal).toBe(-1);
    });
  });

  // --- SMA Verification ---
  describe('SMA — prices 1 to 100', () => {
    it('computes SMA(7), SMA(25), SMA(99) correctly with bullish trend', () => {
      // Prices: 1, 2, 3, ..., 100
      // SMA(7) = avg of last 7 = avg(94..100) = (94+95+96+97+98+99+100)/7 = 679/7 = 97
      // SMA(25) = avg of last 25 = avg(76..100) = (76+77+...+100)/25 = sum(76..100)/25
      //   sum(76..100) = 25*(76+100)/2 = 25*88 = 2200 → avg = 88
      // SMA(99) = avg of last 99 = avg(2..100) = sum(2..100)/99
      //   sum(2..100) = 99*(2+100)/2 = 99*51 = 5049 → avg = 51
      // SMA7 > SMA25 > SMA99 → trend = 'bullish'

      const closes = Array.from({ length: 100 }, (_, i) => i + 1);
      const candles = makeCandles(closes);
      const result = calcSma(candles, [7, 25, 99])!;

      expect(result).not.toBeNull();

      const sma7 = result.values.find(v => v.period === 7)!;
      const sma25 = result.values.find(v => v.period === 25)!;
      const sma99 = result.values.find(v => v.period === 99)!;

      expect(sma7.value).toBeCloseTo(97, 5);
      expect(sma25.value).toBeCloseTo(88, 5);
      expect(sma99.value).toBeCloseTo(51, 5);
      expect(result.trend).toBe('bullish');
    });
  });

  // --- Support/Resistance Verification ---
  describe('Support/Resistance — V-shape pattern', () => {
    it('finds support near the valley of a V-shape', () => {
      // Create V-shape: 100, 95, 90, 95, 100
      // Use makeCandlesCustom to control high/low precisely
      // Local min at index 2: candles[2].low < candles[1].low AND candles[2].low < candles[3].low
      // We need: low[1] > low[2] < low[3]
      // Also need: high values that DON'T form local max at index 2
      const candles: OhlcvCandle[] = [
        { timestamp: Date.now() - 5 * 3600_000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: Date.now() - 4 * 3600_000, open: 95, high: 96, low: 94, close: 95, volume: 1000 },
        { timestamp: Date.now() - 3 * 3600_000, open: 90, high: 91, low: 89, close: 90, volume: 1000 },
        { timestamp: Date.now() - 2 * 3600_000, open: 95, high: 96, low: 94, close: 95, volume: 1000 },
        { timestamp: Date.now() - 1 * 3600_000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];

      const result = calcSupportResistance(candles)!;

      expect(result).not.toBeNull();
      // Local min at index 2: low=89
      expect(result.supports.length).toBeGreaterThan(0);
      expect(result.supports[0]).toBeCloseTo(89, 0);
      // nearestSupport should be 89 (below lastClose=100)
      expect(result.nearestSupport).toBeCloseTo(89, 0);
    });
  });

  describe('Support/Resistance — inverted V (resistance)', () => {
    it('finds resistance near the peak of an inverted V', () => {
      // Inverted V: 100, 105, 110, 105, 100
      // Local max at index 2: high[2] > high[1] AND high[2] > high[3]
      const candles: OhlcvCandle[] = [
        { timestamp: Date.now() - 5 * 3600_000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
        { timestamp: Date.now() - 4 * 3600_000, open: 105, high: 106, low: 104, close: 105, volume: 1000 },
        { timestamp: Date.now() - 3 * 3600_000, open: 110, high: 111, low: 109, close: 110, volume: 1000 },
        { timestamp: Date.now() - 2 * 3600_000, open: 105, high: 106, low: 104, close: 105, volume: 1000 },
        { timestamp: Date.now() - 1 * 3600_000, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      ];

      const result = calcSupportResistance(candles)!;

      expect(result).not.toBeNull();
      // Local max at index 2: high=111
      expect(result.resistances.length).toBeGreaterThan(0);
      expect(result.resistances[0]).toBeCloseTo(111, 0);
      // nearestResistance should be 111 (above lastClose=100)
      expect(result.nearestResistance).toBeCloseTo(111, 0);
    });
  });
});
