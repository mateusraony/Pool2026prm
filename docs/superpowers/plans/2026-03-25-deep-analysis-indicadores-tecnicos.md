# Deep Analysis — Indicadores Técnicos Reais

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar indicadores técnicos reais (RSI, MACD, Bollinger Bands, Volume Profile, Momentum Score) calculados a partir de dados OHLCV, exibidos como painel "Deep Analysis" na página de detalhe da pool.

**Architecture:** Serviço backend de matemática pura (`technical-indicators.service.ts`) consome `OhlcvCandle[]` do `priceHistoryService` e retorna indicadores calculados. Endpoint REST expõe via cache. Job cron recalcula periodicamente para pools favoritas/recomendadas. Frontend consome via React Query hook e exibe em componentes dedicados dentro do `ScoutPoolDetail`.

**Tech Stack:** TypeScript strict, Vitest (TDD), Express, node-cron, React 18, React Query, TailwindCSS, shadcn/ui, Recharts

---

## File Map

| Ação | Arquivo | Responsabilidade |
|------|---------|-----------------|
| **Create** | `backend/src/services/technical-indicators.service.ts` | Funções puras: RSI, MACD, Bollinger, Volume Profile, Momentum Score |
| **Create** | `backend/src/__tests__/technical-indicators.service.test.ts` | Testes unitários para cada indicador (TDD) |
| **Create** | `backend/src/jobs/deep-analysis.job.ts` | Job cron que recalcula indicadores para pools prioritárias |
| **Modify** | `backend/src/jobs/index.ts` | Registrar deep-analysis job no `initializeJobs()` |
| **Modify** | `backend/src/routes/pools.routes.ts` | Adicionar `GET /api/pools/:chain/:address/deep-analysis` |
| **Modify** | `backend/src/routes/validation.ts` | Schema Zod para query params do endpoint |
| **Create** | `frontend/src/hooks/useDeepAnalysis.ts` | React Query hook para consumir endpoint |
| **Modify** | `frontend/src/api/client.ts` | Função `fetchDeepAnalysis()` |
| **Create** | `frontend/src/components/common/DeepAnalysisPanel.tsx` | Container do painel com loading/error states |
| **Create** | `frontend/src/components/common/TechnicalSection.tsx` | Subcomponentes visuais por indicador |
| **Modify** | `frontend/src/pages/ScoutPoolDetail.tsx` | Integrar `<DeepAnalysisPanel>` entre AI Insights e HODL vs LP |

> **Nota para execução:** Tasks 1-3 (backend) e Tasks 5-7 (frontend) são independentes e DEVEM rodar em paralelo via subagents para evitar timeouts.

---

## Task 1: Tipos + RSI (backend — TDD)

**Files:**
- Create: `pool-intelligence-pro/backend/src/services/technical-indicators.service.ts`
- Create: `pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts`

### Tipos exportados

```typescript
// technical-indicators.service.ts
import type { OhlcvCandle } from './price-history.service.js';

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

export interface MomentumResult {
  score: number;          // -100 to +100
  label: 'Strong Sell' | 'Sell' | 'Neutral' | 'Buy' | 'Strong Buy';
  components: {
    rsiSignal: number;    // -1, 0, +1
    macdSignal: number;
    bollingerSignal: number;
    volumeSignal: number;
  };
}

export interface DeepAnalysis {
  rsi: RsiResult;
  macd: MacdResult;
  bollinger: BollingerResult;
  volumeProfile: VolumeProfileResult;
  momentum: MomentumResult;
  meta: {
    chain: string;
    address: string;
    timeframe: string;
    candlesUsed: number;
    calculatedAt: string; // ISO
  };
}
```

- [ ] **Step 1: Escrever testes de RSI**

```typescript
// technical-indicators.service.test.ts
import { describe, it, expect } from 'vitest';
import { calcRsi } from '../services/technical-indicators.service.js';
import type { OhlcvCandle } from '../services/price-history.service.js';

function makeCandles(closes: number[]): OhlcvCandle[] {
  return closes.map((close, i) => ({
    timestamp: Date.now() - (closes.length - i) * 3600_000,
    open: close,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1000,
  }));
}

describe('calcRsi', () => {
  it('returns null when fewer than periods+1 candles', () => {
    const candles = makeCandles([100, 101, 102]);
    expect(calcRsi(candles, 14)).toBeNull();
  });

  it('returns 100 when all gains (monotonic up)', () => {
    // 16 candles, each +1 → all gains, no losses → RSI = 100
    const closes = Array.from({ length: 16 }, (_, i) => 100 + i);
    const result = calcRsi(makeCandles(closes), 14);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(100, 0);
    expect(result!.signal).toBe('overbought');
  });

  it('returns 0 when all losses (monotonic down)', () => {
    const closes = Array.from({ length: 16 }, (_, i) => 200 - i);
    const result = calcRsi(makeCandles(closes), 14);
    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(0, 0);
    expect(result!.signal).toBe('oversold');
  });

  it('returns ~50 when equal gains and losses', () => {
    // Alternating +1, -1 → equal avg gain/loss → RSI ≈ 50
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const result = calcRsi(makeCandles(closes), 14);
    expect(result).not.toBeNull();
    expect(result!.value).toBeGreaterThan(40);
    expect(result!.value).toBeLessThan(60);
    expect(result!.signal).toBe('neutral');
  });

  it('uses Wilder smoothing (not SMA)', () => {
    // With real-world-like data, verify smoothing produces expected range
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
                    46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41,
                    46.22, 45.64];
    const result = calcRsi(makeCandles(closes), 14);
    expect(result).not.toBeNull();
    // Welles Wilder RSI for this series ≈ 55-65
    expect(result!.value).toBeGreaterThan(50);
    expect(result!.value).toBeLessThan(70);
  });
});
```

- [ ] **Step 2: Rodar teste, verificar que falha**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: FAIL — calcRsi not found
```

- [ ] **Step 3: Implementar `calcRsi`**

```typescript
// technical-indicators.service.ts — RSI implementation
import type { OhlcvCandle } from './price-history.service.js';

export function calcRsi(candles: OhlcvCandle[], periods = 14): RsiResult | null {
  if (candles.length < periods + 1) return null;

  const closes = candles.map(c => c.close);
  const changes = closes.slice(1).map((c, i) => c - closes[i]);

  // Initial averages (SMA of first `periods` changes)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < periods; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= periods;
  avgLoss /= periods;

  // Wilder's smoothing for remaining periods
  for (let i = periods; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (periods - 1) + gain) / periods;
    avgLoss = (avgLoss * (periods - 1) + loss) / periods;
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

  const signal: RsiResult['signal'] =
    rsi <= 30 ? 'oversold' : rsi >= 70 ? 'overbought' : 'neutral';

  return { value: Math.round(rsi * 100) / 100, signal, periods };
}
```

- [ ] **Step 4: Rodar teste, verificar que passa**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: PASS — all 5 RSI tests green
```

- [ ] **Step 5: Commit**

```bash
git add pool-intelligence-pro/backend/src/services/technical-indicators.service.ts \
       pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts
git commit -m "feat: adicionar servico de indicadores tecnicos com RSI (TDD)"
```

---

## Task 2: MACD + Bollinger Bands (backend — TDD)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/services/technical-indicators.service.ts`
- Modify: `pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts`

- [ ] **Step 1: Escrever testes de MACD**

```typescript
// Adicionar ao test file
import { calcMacd } from '../services/technical-indicators.service.js';

describe('calcMacd', () => {
  it('returns null when fewer than 26 candles', () => {
    const candles = makeCandles(Array.from({ length: 20 }, () => 100));
    expect(calcMacd(candles)).toBeNull();
  });

  it('MACD line is positive in uptrend', () => {
    // 35 candles trending up → fast EMA > slow EMA → MACD > 0
    const closes = Array.from({ length: 35 }, (_, i) => 100 + i * 0.5);
    const result = calcMacd(makeCandles(closes));
    expect(result).not.toBeNull();
    expect(result!.macdLine).toBeGreaterThan(0);
    expect(result!.signal).toBe('bullish');
  });

  it('MACD line is negative in downtrend', () => {
    const closes = Array.from({ length: 35 }, (_, i) => 200 - i * 0.5);
    const result = calcMacd(makeCandles(closes));
    expect(result).not.toBeNull();
    expect(result!.macdLine).toBeLessThan(0);
    expect(result!.signal).toBe('bearish');
  });

  it('histogram is MACD - signal', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 5) * 10);
    const result = calcMacd(makeCandles(closes));
    expect(result).not.toBeNull();
    expect(result!.histogram).toBeCloseTo(result!.macdLine - result!.signalLine, 6);
  });

  it('detects bullish crossover', () => {
    // Down then sharply up → MACD crosses above signal
    const closes = [
      ...Array.from({ length: 30 }, (_, i) => 100 - i * 0.3),
      ...Array.from({ length: 10 }, (_, i) => 91 + i * 2),
    ];
    const result = calcMacd(makeCandles(closes));
    expect(result).not.toBeNull();
    // After sharp reversal, MACD should be trending bullish
    expect(result!.macdLine).toBeGreaterThan(result!.signalLine);
  });
});
```

- [ ] **Step 2: Rodar teste, verificar que falha**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: FAIL — calcMacd not found
```

- [ ] **Step 3: Implementar `calcMacd`**

```typescript
// Helpers
function calcEma(values: number[], periods: number): number[] {
  const k = 2 / (periods + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calcMacd(
  candles: OhlcvCandle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MacdResult | null {
  if (candles.length < slowPeriod) return null;

  const closes = candles.map(c => c.close);
  const fastEma = calcEma(closes, fastPeriod);
  const slowEma = calcEma(closes, slowPeriod);

  // MACD line = fast EMA - slow EMA
  const macdLine = fastEma.map((f, i) => f - slowEma[i]);

  // Signal line = EMA of MACD line (last signalPeriod values minimum)
  const signalEma = calcEma(macdLine, signalPeriod);

  const lastIdx = macdLine.length - 1;
  const prevIdx = lastIdx - 1;

  const currentMacd = macdLine[lastIdx];
  const currentSignal = signalEma[lastIdx];
  const histogram = currentMacd - currentSignal;

  // Crossover detection
  let crossover: MacdResult['crossover'] = 'none';
  if (prevIdx >= 0) {
    const prevMacd = macdLine[prevIdx];
    const prevSignal = signalEma[prevIdx];
    if (prevMacd <= prevSignal && currentMacd > currentSignal) crossover = 'bullish_cross';
    else if (prevMacd >= prevSignal && currentMacd < currentSignal) crossover = 'bearish_cross';
  }

  const signal: MacdResult['signal'] =
    currentMacd > currentSignal ? 'bullish' : currentMacd < currentSignal ? 'bearish' : 'neutral';

  return {
    macdLine: Math.round(currentMacd * 1e8) / 1e8,
    signalLine: Math.round(currentSignal * 1e8) / 1e8,
    histogram: Math.round(histogram * 1e8) / 1e8,
    signal,
    crossover,
  };
}
```

- [ ] **Step 4: Rodar testes, verificar MACD passa**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: PASS — RSI + MACD tests green
```

- [ ] **Step 5: Escrever testes de Bollinger Bands**

```typescript
import { calcBollinger } from '../services/technical-indicators.service.js';

describe('calcBollinger', () => {
  it('returns null when fewer than period candles', () => {
    const candles = makeCandles(Array.from({ length: 10 }, () => 100));
    expect(calcBollinger(candles, 20)).toBeNull();
  });

  it('bands are tight with constant prices', () => {
    // All same price → std dev ≈ 0 → bands converge to middle
    const candles = makeCandles(Array.from({ length: 25 }, () => 100));
    const result = calcBollinger(candles, 20);
    expect(result).not.toBeNull();
    expect(result!.middle).toBeCloseTo(100, 1);
    expect(result!.bandwidth).toBeCloseTo(0, 4);
    expect(result!.upper).toBeCloseTo(100, 1);
    expect(result!.lower).toBeCloseTo(100, 1);
  });

  it('upper > middle > lower always', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const result = calcBollinger(makeCandles(closes), 20);
    expect(result).not.toBeNull();
    expect(result!.upper).toBeGreaterThan(result!.middle);
    expect(result!.middle).toBeGreaterThan(result!.lower);
  });

  it('percentB is 0 at lower band, 1 at upper band', () => {
    // Construct candles where last close = lower band
    const closes = Array.from({ length: 25 }, () => 100);
    closes[closes.length - 1] = 90; // Well below average
    const result = calcBollinger(makeCandles(closes), 20);
    expect(result).not.toBeNull();
    expect(result!.percentB).toBeLessThan(0.1);
  });

  it('bandwidth increases with volatility', () => {
    const stable = makeCandles(Array.from({ length: 25 }, () => 100));
    const volatile = makeCandles(Array.from({ length: 25 }, (_, i) => 100 + (i % 2 === 0 ? 10 : -10)));
    const rStable = calcBollinger(stable, 20);
    const rVolatile = calcBollinger(volatile, 20);
    expect(rStable).not.toBeNull();
    expect(rVolatile).not.toBeNull();
    expect(rVolatile!.bandwidth).toBeGreaterThan(rStable!.bandwidth);
  });
});
```

- [ ] **Step 6: Rodar teste, verificar que falha**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: FAIL — calcBollinger not found
```

- [ ] **Step 7: Implementar `calcBollinger`**

```typescript
export function calcBollinger(
  candles: OhlcvCandle[],
  period = 20,
  stdDevMultiplier = 2
): BollingerResult | null {
  if (candles.length < period) return null;

  const closes = candles.map(c => c.close);
  const recentCloses = closes.slice(-period);

  // SMA
  const middle = recentCloses.reduce((sum, v) => sum + v, 0) / period;

  // Standard deviation
  const variance = recentCloses.reduce((sum, v) => sum + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);

  const upper = middle + stdDevMultiplier * stdDev;
  const lower = middle - stdDevMultiplier * stdDev;
  const bandwidth = middle === 0 ? 0 : (upper - lower) / middle;

  const lastClose = closes[closes.length - 1];
  const range = upper - lower;
  const percentB = range === 0 ? 0.5 : (lastClose - lower) / range;

  let signal: BollingerResult['signal'];
  if (percentB > 1) signal = 'above_upper';
  else if (percentB > 0.8) signal = 'near_upper';
  else if (percentB < 0) signal = 'below_lower';
  else if (percentB < 0.2) signal = 'near_lower';
  else signal = 'middle';

  return {
    upper: Math.round(upper * 1e8) / 1e8,
    middle: Math.round(middle * 1e8) / 1e8,
    lower: Math.round(lower * 1e8) / 1e8,
    bandwidth: Math.round(bandwidth * 1e6) / 1e6,
    percentB: Math.round(percentB * 1e4) / 1e4,
    signal,
  };
}
```

- [ ] **Step 8: Rodar testes, verificar tudo passa**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: PASS — RSI + MACD + Bollinger all green
```

- [ ] **Step 9: Commit**

```bash
git add pool-intelligence-pro/backend/src/services/technical-indicators.service.ts \
       pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts
git commit -m "feat: adicionar MACD e Bollinger Bands ao servico de indicadores (TDD)"
```

---

## Task 3: Volume Profile + Momentum Score + Orquestrador (backend — TDD)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/services/technical-indicators.service.ts`
- Modify: `pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts`

- [ ] **Step 1: Escrever testes de Volume Profile**

```typescript
import { calcVolumeProfile } from '../services/technical-indicators.service.js';

describe('calcVolumeProfile', () => {
  it('returns null with empty candles', () => {
    expect(calcVolumeProfile([], 1_000_000)).toBeNull();
  });

  it('detects abnormal volume (>2x avg)', () => {
    const candles = makeCandles(Array.from({ length: 20 }, () => 100));
    // Override last candle volume to 5x
    candles.forEach((c, i) => { c.volume = i < 19 ? 1000 : 5000; });
    const result = calcVolumeProfile(candles, 1_000_000);
    expect(result).not.toBeNull();
    expect(result!.isAbnormal).toBe(true);
  });

  it('calculates volumeTvlRatio correctly', () => {
    const candles = makeCandles(Array.from({ length: 20 }, () => 100));
    candles.forEach(c => { c.volume = 50_000; });
    const result = calcVolumeProfile(candles, 1_000_000);
    expect(result).not.toBeNull();
    expect(result!.volumeTvlRatio).toBeCloseTo(0.05, 2); // 50k / 1M
  });

  it('trend is positive when recent > historical', () => {
    const candles = makeCandles(Array.from({ length: 20 }, () => 100));
    // First 10 low volume, last 10 high volume
    candles.forEach((c, i) => { c.volume = i < 10 ? 500 : 2000; });
    const result = calcVolumeProfile(candles, 1_000_000);
    expect(result).not.toBeNull();
    expect(result!.volumeTrend).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar teste, verificar que falha**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: FAIL — calcVolumeProfile not found
```

- [ ] **Step 3: Implementar `calcVolumeProfile`**

```typescript
export function calcVolumeProfile(
  candles: OhlcvCandle[],
  tvl: number
): VolumeProfileResult | null {
  if (candles.length === 0) return null;

  const volumes = candles.map(c => c.volume);
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];

  // Trend: compare recent half vs older half
  const mid = Math.floor(volumes.length / 2);
  const oldAvg = volumes.slice(0, mid).reduce((s, v) => s + v, 0) / Math.max(mid, 1);
  const newAvg = volumes.slice(mid).reduce((s, v) => s + v, 0) / Math.max(volumes.length - mid, 1);
  const volumeTrend = oldAvg === 0 ? 0 : ((newAvg - oldAvg) / oldAvg) * 100;

  const volumeTvlRatio = tvl === 0 ? 0 : currentVolume / tvl;
  const isAbnormal = currentVolume > avgVolume * 2;

  return {
    avgVolume: Math.round(avgVolume * 100) / 100,
    currentVolume: Math.round(currentVolume * 100) / 100,
    volumeTrend: Math.round(volumeTrend * 100) / 100,
    volumeTvlRatio: Math.round(volumeTvlRatio * 1e6) / 1e6,
    isAbnormal,
  };
}
```

- [ ] **Step 4: Rodar testes, verificar Volume Profile passa**

- [ ] **Step 5: Escrever testes de Momentum Score**

```typescript
import { calcMomentum } from '../services/technical-indicators.service.js';

describe('calcMomentum', () => {
  it('returns Strong Buy when all indicators bullish', () => {
    const result = calcMomentum(
      { value: 25, signal: 'oversold', periods: 14 },           // RSI oversold → buy
      { macdLine: 1, signalLine: 0.5, histogram: 0.5, signal: 'bullish', crossover: 'bullish_cross' },
      { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 0.1, signal: 'near_lower' },
      { avgVolume: 1000, currentVolume: 2500, volumeTrend: 50, volumeTvlRatio: 0.05, isAbnormal: true }
    );
    expect(result.score).toBeGreaterThan(50);
    expect(result.label).toBe('Strong Buy');
  });

  it('returns Strong Sell when all indicators bearish', () => {
    const result = calcMomentum(
      { value: 80, signal: 'overbought', periods: 14 },
      { macdLine: -1, signalLine: -0.5, histogram: -0.5, signal: 'bearish', crossover: 'bearish_cross' },
      { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 0.95, signal: 'near_upper' },
      { avgVolume: 1000, currentVolume: 2500, volumeTrend: -30, volumeTvlRatio: 0.05, isAbnormal: true }
    );
    expect(result.score).toBeLessThan(-50);
    expect(result.label).toBe('Strong Sell');
  });

  it('returns Neutral when mixed signals', () => {
    const result = calcMomentum(
      { value: 50, signal: 'neutral', periods: 14 },
      { macdLine: 0.1, signalLine: 0.1, histogram: 0, signal: 'neutral', crossover: 'none' },
      { upper: 110, middle: 100, lower: 90, bandwidth: 0.2, percentB: 0.5, signal: 'middle' },
      { avgVolume: 1000, currentVolume: 1000, volumeTrend: 0, volumeTvlRatio: 0.05, isAbnormal: false }
    );
    expect(result.score).toBeGreaterThan(-25);
    expect(result.score).toBeLessThan(25);
    expect(result.label).toBe('Neutral');
  });

  it('score is clamped between -100 and +100', () => {
    const extreme = calcMomentum(
      { value: 5, signal: 'oversold', periods: 14 },
      { macdLine: 100, signalLine: 0, histogram: 100, signal: 'bullish', crossover: 'bullish_cross' },
      { upper: 200, middle: 100, lower: 0, bandwidth: 2, percentB: 0.01, signal: 'below_lower' },
      { avgVolume: 100, currentVolume: 10000, volumeTrend: 200, volumeTvlRatio: 1, isAbnormal: true }
    );
    expect(extreme.score).toBeLessThanOrEqual(100);
    expect(extreme.score).toBeGreaterThanOrEqual(-100);
  });
});
```

- [ ] **Step 6: Implementar `calcMomentum`**

```typescript
export function calcMomentum(
  rsi: RsiResult,
  macd: MacdResult,
  bollinger: BollingerResult,
  volume: VolumeProfileResult
): MomentumResult {
  // RSI signal: oversold = +1 (buy), overbought = -1 (sell)
  const rsiSignal = rsi.signal === 'oversold' ? 1 : rsi.signal === 'overbought' ? -1 : 0;

  // MACD signal: bullish = +1, bearish = -1
  let macdSignal = macd.signal === 'bullish' ? 1 : macd.signal === 'bearish' ? -1 : 0;
  // Crossover amplifies signal
  if (macd.crossover === 'bullish_cross') macdSignal = 1;
  if (macd.crossover === 'bearish_cross') macdSignal = -1;

  // Bollinger signal: near_lower/below = +1 (buy dip), near_upper/above = -1 (sell top)
  const bollingerSignal =
    bollinger.signal === 'below_lower' || bollinger.signal === 'near_lower' ? 1 :
    bollinger.signal === 'above_upper' || bollinger.signal === 'near_upper' ? -1 : 0;

  // Volume signal: abnormal + positive trend = confirms direction
  const volumeDirection = volume.volumeTrend > 0 ? 1 : volume.volumeTrend < 0 ? -1 : 0;
  const volumeSignal = volume.isAbnormal ? volumeDirection : 0;

  // Weighted composite: RSI 30%, MACD 30%, Bollinger 25%, Volume 15%
  const raw = (rsiSignal * 30 + macdSignal * 30 + bollingerSignal * 25 + volumeSignal * 15);
  const score = Math.max(-100, Math.min(100, raw));

  let label: MomentumResult['label'];
  if (score >= 50) label = 'Strong Buy';
  else if (score >= 15) label = 'Buy';
  else if (score <= -50) label = 'Strong Sell';
  else if (score <= -15) label = 'Sell';
  else label = 'Neutral';

  return {
    score,
    label,
    components: { rsiSignal, macdSignal, bollingerSignal, volumeSignal },
  };
}
```

- [ ] **Step 7: Rodar testes, verificar tudo passa**

```bash
cd pool-intelligence-pro/backend && npx vitest run src/__tests__/technical-indicators.service.test.ts
# Expected: PASS — RSI + MACD + Bollinger + VolumeProfile + Momentum all green
```

- [ ] **Step 8: Implementar `computeDeepAnalysis` (orquestrador)**

```typescript
export function computeDeepAnalysis(
  candles: OhlcvCandle[],
  tvl: number,
  chain: string,
  address: string,
  timeframe: string
): DeepAnalysis | null {
  const rsi = calcRsi(candles);
  const macd = calcMacd(candles);
  const bollinger = calcBollinger(candles);
  const volumeProfile = calcVolumeProfile(candles, tvl);

  // Precisa de pelo menos RSI e volume para gerar análise
  if (!rsi || !volumeProfile) return null;

  const momentum = calcMomentum(
    rsi,
    macd ?? { macdLine: 0, signalLine: 0, histogram: 0, signal: 'neutral', crossover: 'none' },
    bollinger ?? { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 0.5, signal: 'middle' },
    volumeProfile
  );

  return {
    rsi,
    macd: macd ?? { macdLine: 0, signalLine: 0, histogram: 0, signal: 'neutral', crossover: 'none' },
    bollinger: bollinger ?? { upper: 0, middle: 0, lower: 0, bandwidth: 0, percentB: 0.5, signal: 'middle' },
    volumeProfile,
    momentum,
    meta: {
      chain,
      address: address.toLowerCase(),
      timeframe,
      candlesUsed: candles.length,
      calculatedAt: new Date().toISOString(),
    },
  };
}
```

- [ ] **Step 9: Commit**

```bash
git add pool-intelligence-pro/backend/src/services/technical-indicators.service.ts \
       pool-intelligence-pro/backend/src/__tests__/technical-indicators.service.test.ts
git commit -m "feat: adicionar Volume Profile, Momentum Score e orquestrador computeDeepAnalysis"
```

---

## Task 4: Endpoint REST + Job Cron + Wiring (backend)

**Files:**
- Modify: `pool-intelligence-pro/backend/src/routes/pools.routes.ts` (add endpoint)
- Modify: `pool-intelligence-pro/backend/src/routes/validation.ts` (add schema)
- Create: `pool-intelligence-pro/backend/src/jobs/deep-analysis.job.ts`
- Modify: `pool-intelligence-pro/backend/src/jobs/index.ts` (register job)

- [ ] **Step 1: Adicionar schema de validação**

```typescript
// Em validation.ts — adicionar ao final das schemas existentes:
export const deepAnalysisQuerySchema = z.object({
  timeframe: z.enum(['hour', 'day']).optional().default('hour'),
});
```

- [ ] **Step 2: Adicionar endpoint em pools.routes.ts**

Inserir ANTES do último `export default router`:

```typescript
import { computeDeepAnalysis } from '../services/technical-indicators.service.js';
import { deepAnalysisQuerySchema } from './validation.js';

// GET /pools/:chain/:address/deep-analysis — Indicadores técnicos reais
router.get('/pools/:chain/:address/deep-analysis', async (req, res) => {
  try {
    const { chain, address } = req.params;
    const parsed = deepAnalysisQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid query params' });
    }
    const { timeframe } = parsed.data;
    const normalizedAddress = address.toLowerCase();

    // Cache key
    const cacheKey = `deep_analysis_${chain}_${normalizedAddress}_${timeframe}`;
    const cached = cacheService.get<import('../services/technical-indicators.service.js').DeepAnalysis>(cacheKey);
    if (cached.data && !cached.isStale) {
      return res.json({ success: true, data: cached.data, fromCache: true, timestamp: new Date() });
    }

    // Fetch OHLCV
    const limit = timeframe === 'hour' ? 168 : 90;
    const ohlcv = await priceHistoryService.getOhlcv(chain, normalizedAddress, timeframe, limit);
    if (!ohlcv || ohlcv.candles.length < 15) {
      return res.status(404).json({ success: false, error: 'Insufficient OHLCV data for analysis' });
    }

    // Get TVL from MemoryStore
    const poolId = `${chain}_${normalizedAddress}`;
    const pool = memoryStore.getPool(poolId);
    const tvl = pool?.tvlUSD ?? 0;

    // Compute
    const analysis = computeDeepAnalysis(ohlcv.candles, tvl, chain, normalizedAddress, timeframe);
    if (!analysis) {
      return res.status(422).json({ success: false, error: 'Could not compute analysis (insufficient data)' });
    }

    // Cache (hour=5min, day=15min)
    const ttl = timeframe === 'hour' ? 300 : 900;
    cacheService.set(cacheKey, analysis, ttl);

    res.json({ success: true, data: analysis, fromCache: false, timestamp: new Date() });
  } catch (error: unknown) {
    logService.error('SYSTEM', 'GET /pools/:chain/:address/deep-analysis failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});
```

**Nota:** `cacheService` e `priceHistoryService` já são importados no topo de `pools.routes.ts`. `memoryStore` também. Verificar se `computeDeepAnalysis` e `deepAnalysisQuerySchema` são adicionados aos imports.

- [ ] **Step 3: Commit endpoint**

```bash
git add pool-intelligence-pro/backend/src/routes/pools.routes.ts \
       pool-intelligence-pro/backend/src/routes/validation.ts
git commit -m "feat: adicionar endpoint GET /api/pools/:chain/:address/deep-analysis"
```

- [ ] **Step 4: Criar deep-analysis.job.ts**

```typescript
// backend/src/jobs/deep-analysis.job.ts
import { priceHistoryService } from '../services/price-history.service.js';
import { computeDeepAnalysis } from '../services/technical-indicators.service.js';
import { cacheService } from '../services/cache.service.js';
import { memoryStore } from '../services/memory-store.service.js';
import { logService } from '../services/log.service.js';
import { getPrisma } from '../routes/prisma.js';

/**
 * Recalcula deep analysis para pools prioritárias (favoritos + top recomendações).
 * Roda a cada 10 minutos. Pre-popula o cache para que o endpoint sirva dados frescos.
 */
export async function runDeepAnalysisJob(): Promise<{ analyzed: number; errors: number }> {
  let analyzed = 0;
  let errors = 0;

  // Coletar pool IDs prioritários: favoritos + top 10 recomendações
  const poolIds = new Set<string>();

  // Favoritos do DB
  try {
    const prisma = getPrisma();
    if (prisma) {
      const favorites = await prisma.favorite.findMany({ select: { poolId: true } });
      for (const f of favorites) poolIds.add(f.poolId);
    }
  } catch {
    logService.warn('DEEP_ANALYSIS', 'Could not fetch favorites from DB');
  }

  // Top recomendações do MemoryStore
  const recs = memoryStore.getRecommendations();
  if (recs) {
    for (const r of recs.slice(0, 10)) {
      poolIds.add(r.pool.externalId);
    }
  }

  if (poolIds.size === 0) {
    logService.info('DEEP_ANALYSIS', 'No priority pools to analyze');
    return { analyzed: 0, errors: 0 };
  }

  for (const poolId of poolIds) {
    try {
      // Parse chain_address format
      const parts = poolId.split('_');
      if (parts.length < 2) continue;
      const chain = parts[0];
      const address = parts.slice(1).join('_').toLowerCase();

      // Skip if cache is still fresh (TTL 5min for hourly)
      const cacheKey = `deep_analysis_${chain}_${address}_hour`;
      const cached = cacheService.get(cacheKey);
      if (cached.data && !cached.isStale) continue;

      // Fetch OHLCV
      const ohlcv = await priceHistoryService.getOhlcv(chain, address, 'hour', 168);
      if (!ohlcv || ohlcv.candles.length < 15) continue;

      // Get TVL
      const pool = memoryStore.getPool(poolId);
      const tvl = pool?.tvlUSD ?? 0;

      // Compute and cache
      const analysis = computeDeepAnalysis(ohlcv.candles, tvl, chain, address, 'hour');
      if (analysis) {
        cacheService.set(cacheKey, analysis, 300);
        analyzed++;
      }
    } catch {
      errors++;
    }
  }

  logService.info('DEEP_ANALYSIS', `Job completed: ${analyzed} analyzed, ${errors} errors, ${poolIds.size} total`);
  return { analyzed, errors };
}
```

- [ ] **Step 5: Registrar job em initializeJobs()**

Em `pool-intelligence-pro/backend/src/jobs/index.ts`, adicionar:

```typescript
// No topo — novo import:
import { runDeepAnalysisJob } from './deep-analysis.job.js';

// Dentro de initializeJobs(), antes do comentário "// Run initial jobs in sequence":
// Deep Analysis: every 10 min (pre-populate cache for favorites/recommendations)
cron.schedule('*/10 * * * *', async () => {
  const start = Date.now();
  let success = true;
  try {
    await runDeepAnalysisJob();
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Deep analysis job failed', { error });
  } finally {
    metricsService.recordJob('deepAnalysis', Date.now() - start, success);
  }
});
```

- [ ] **Step 6: Verificar build backend compila**

```bash
cd pool-intelligence-pro/backend && npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 7: Rodar todos os testes**

```bash
cd pool-intelligence-pro/backend && npx vitest run
# Expected: todos os testes passam (264 + novos)
```

- [ ] **Step 8: Commit**

```bash
git add pool-intelligence-pro/backend/src/jobs/deep-analysis.job.ts \
       pool-intelligence-pro/backend/src/jobs/index.ts
git commit -m "feat: adicionar job cron de deep analysis para pools prioritarias"
```

---

## Task 5: API Client + Hook Frontend

> **Parallelizable:** Esta task é independente das Tasks 1-4 (backend). Na execução, rodar Tasks 5-7 em subagent separado.

**Files:**
- Modify: `pool-intelligence-pro/frontend/src/api/client.ts` (add fetchDeepAnalysis)
- Create: `pool-intelligence-pro/frontend/src/hooks/useDeepAnalysis.ts`

- [ ] **Step 1: Adicionar tipo e função no client.ts**

Adicionar ao final do arquivo (antes de qualquer `export default` se existir):

```typescript
// --- Deep Analysis Types ---
export interface DeepAnalysisData {
  rsi: {
    value: number;
    signal: 'oversold' | 'neutral' | 'overbought';
    periods: number;
  };
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
    signal: 'bullish' | 'neutral' | 'bearish';
    crossover: 'bullish_cross' | 'bearish_cross' | 'none';
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
    percentB: number;
    signal: string;
  };
  volumeProfile: {
    avgVolume: number;
    currentVolume: number;
    volumeTrend: number;
    volumeTvlRatio: number;
    isAbnormal: boolean;
  };
  momentum: {
    score: number;
    label: 'Strong Sell' | 'Sell' | 'Neutral' | 'Buy' | 'Strong Buy';
    components: {
      rsiSignal: number;
      macdSignal: number;
      bollingerSignal: number;
      volumeSignal: number;
    };
  };
  meta: {
    chain: string;
    address: string;
    timeframe: string;
    candlesUsed: number;
    calculatedAt: string;
  };
}

export async function fetchDeepAnalysis(
  chain: string,
  address: string,
  timeframe: 'hour' | 'day' = 'hour'
): Promise<DeepAnalysisData | null> {
  try {
    const { data } = await api.get(`/pools/${chain}/${address.toLowerCase()}/deep-analysis`, {
      params: { timeframe },
    });
    return data.success ? data.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Criar hook useDeepAnalysis.ts**

```typescript
// frontend/src/hooks/useDeepAnalysis.ts
import { useQuery } from '@tanstack/react-query';
import { fetchDeepAnalysis, type DeepAnalysisData } from '@/api/client';

interface UseDeepAnalysisOptions {
  timeframe?: 'hour' | 'day';
  enabled?: boolean;
}

interface UseDeepAnalysisResult {
  data: DeepAnalysisData | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useDeepAnalysis(
  chain: string | undefined,
  address: string | undefined,
  options: UseDeepAnalysisOptions = {}
): UseDeepAnalysisResult {
  const { timeframe = 'hour', enabled = true } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['deep-analysis', chain, address, timeframe],
    queryFn: () => {
      if (!chain || !address) return null;
      return fetchDeepAnalysis(chain, address, timeframe);
    },
    enabled: enabled && !!chain && !!address,
    staleTime: timeframe === 'hour' ? 300_000 : 900_000, // 5min / 15min
    refetchInterval: timeframe === 'hour' ? 600_000 : 1_800_000, // 10min / 30min
    retry: 1,
  });

  return { data, isLoading, error: error as Error | null, refetch };
}
```

- [ ] **Step 3: Verificar frontend compila**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 4: Commit**

```bash
git add pool-intelligence-pro/frontend/src/api/client.ts \
       pool-intelligence-pro/frontend/src/hooks/useDeepAnalysis.ts
git commit -m "feat: adicionar fetchDeepAnalysis e hook useDeepAnalysis no frontend"
```

---

## Task 6: Componentes Visuais — TechnicalSection + DeepAnalysisPanel

**Files:**
- Create: `pool-intelligence-pro/frontend/src/components/common/TechnicalSection.tsx`
- Create: `pool-intelligence-pro/frontend/src/components/common/DeepAnalysisPanel.tsx`

- [ ] **Step 1: Criar TechnicalSection.tsx**

Componente que renderiza cada indicador individualmente com visual consistente:

```tsx
// frontend/src/components/common/TechnicalSection.tsx
import { cn } from '@/lib/utils';

interface IndicatorBarProps {
  label: string;
  value: number;
  min: number;
  max: number;
  zones?: { threshold: number; color: string }[];
  formatValue?: (v: number) => string;
}

function IndicatorBar({ label, value, min, max, zones, formatValue }: IndicatorBarProps) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const display = formatValue ? formatValue(value) : value.toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{display}</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getBarColor(value, zones))}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function getBarColor(value: number, zones?: { threshold: number; color: string }[]): string {
  if (!zones) return 'bg-primary';
  for (let i = zones.length - 1; i >= 0; i--) {
    if (value >= zones[i].threshold) return zones[i].color;
  }
  return 'bg-primary';
}

interface SignalBadgeProps {
  signal: string;
  variant?: 'bullish' | 'bearish' | 'neutral';
}

function SignalBadge({ signal, variant = 'neutral' }: SignalBadgeProps) {
  const colors = {
    bullish: 'bg-green-500/10 text-green-500 border-green-500/20',
    bearish: 'bg-red-500/10 text-red-500 border-red-500/20',
    neutral: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border', colors[variant])}>
      {signal}
    </span>
  );
}

// --- RSI Section ---
export function RsiSection({ rsi }: { rsi: { value: number; signal: string; periods: number } }) {
  const variant = rsi.signal === 'oversold' ? 'bullish' : rsi.signal === 'overbought' ? 'bearish' : 'neutral';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">RSI ({rsi.periods})</h4>
        <SignalBadge signal={rsi.signal} variant={variant} />
      </div>
      <IndicatorBar
        label="RSI"
        value={rsi.value}
        min={0}
        max={100}
        zones={[
          { threshold: 0, color: 'bg-green-500' },
          { threshold: 30, color: 'bg-yellow-500' },
          { threshold: 70, color: 'bg-red-500' },
        ]}
      />
      <p className="text-xs text-muted-foreground">
        {rsi.value <= 30 ? 'Ativo sobrevendido — possivel reversao de alta' :
         rsi.value >= 70 ? 'Ativo sobrecomprado — possivel reversao de baixa' :
         'Zona neutra — sem pressao direcional clara'}
      </p>
    </div>
  );
}

// --- MACD Section ---
export function MacdSection({ macd }: { macd: {
  macdLine: number; signalLine: number; histogram: number;
  signal: string; crossover: string;
} }) {
  const variant = macd.signal === 'bullish' ? 'bullish' : macd.signal === 'bearish' ? 'bearish' : 'neutral';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">MACD (12, 26, 9)</h4>
        <SignalBadge signal={macd.signal} variant={variant} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">MACD</p>
          <p className={cn('font-mono text-sm', macd.macdLine >= 0 ? 'text-green-500' : 'text-red-500')}>
            {macd.macdLine.toFixed(6)}
          </p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">Signal</p>
          <p className="font-mono text-sm">{macd.signalLine.toFixed(6)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">Histogram</p>
          <p className={cn('font-mono text-sm', macd.histogram >= 0 ? 'text-green-500' : 'text-red-500')}>
            {macd.histogram.toFixed(6)}
          </p>
        </div>
      </div>
      {macd.crossover !== 'none' && (
        <p className="text-xs font-medium text-primary">
          {macd.crossover === 'bullish_cross' ? 'Cruzamento altista detectado' : 'Cruzamento baixista detectado'}
        </p>
      )}
    </div>
  );
}

// --- Bollinger Section ---
export function BollingerSection({ bollinger }: { bollinger: {
  upper: number; middle: number; lower: number;
  bandwidth: number; percentB: number; signal: string;
} }) {
  const variant =
    bollinger.signal === 'near_lower' || bollinger.signal === 'below_lower' ? 'bullish' :
    bollinger.signal === 'near_upper' || bollinger.signal === 'above_upper' ? 'bearish' : 'neutral';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Bollinger Bands (20, 2)</h4>
        <SignalBadge signal={bollinger.signal.replace('_', ' ')} variant={variant} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">Upper</p>
          <p className="font-mono text-sm">{bollinger.upper.toFixed(4)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">Middle</p>
          <p className="font-mono text-sm">{bollinger.middle.toFixed(4)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-2">
          <p className="text-xs text-muted-foreground">Lower</p>
          <p className="font-mono text-sm">{bollinger.lower.toFixed(4)}</p>
        </div>
      </div>
      <IndicatorBar label="%B (posicao na banda)" value={bollinger.percentB * 100} min={0} max={100}
        zones={[
          { threshold: 0, color: 'bg-green-500' },
          { threshold: 20, color: 'bg-yellow-500' },
          { threshold: 80, color: 'bg-red-500' },
        ]}
        formatValue={(v) => `${v.toFixed(1)}%`}
      />
    </div>
  );
}

// --- Volume Section ---
export function VolumeSection({ volume }: { volume: {
  avgVolume: number; currentVolume: number;
  volumeTrend: number; volumeTvlRatio: number; isAbnormal: boolean;
} }) {
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toFixed(0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Volume Profile</h4>
        {volume.isAbnormal && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-500/10 text-orange-500 border-orange-500/20">
            Volume anormal
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-secondary/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">Atual</p>
          <p className="font-mono text-sm">{fmt(volume.currentVolume)}</p>
        </div>
        <div className="rounded-lg bg-secondary/50 p-2 text-center">
          <p className="text-xs text-muted-foreground">Media</p>
          <p className="font-mono text-sm">{fmt(volume.avgVolume)}</p>
        </div>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">Tendencia</span>
        <span className={cn('font-mono', volume.volumeTrend >= 0 ? 'text-green-500' : 'text-red-500')}>
          {volume.volumeTrend >= 0 ? '+' : ''}{volume.volumeTrend.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// --- Momentum Section ---
export function MomentumSection({ momentum }: { momentum: {
  score: number;
  label: string;
  components: { rsiSignal: number; macdSignal: number; bollingerSignal: number; volumeSignal: number };
} }) {
  const colorMap: Record<string, string> = {
    'Strong Buy': 'text-green-500',
    'Buy': 'text-green-400',
    'Neutral': 'text-yellow-500',
    'Sell': 'text-red-400',
    'Strong Sell': 'text-red-500',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Momentum Score</h4>
        <span className={cn('text-lg font-bold font-mono', colorMap[momentum.label] || 'text-muted-foreground')}>
          {momentum.score > 0 ? '+' : ''}{momentum.score}
        </span>
      </div>
      <div className="text-center py-2">
        <p className={cn('text-xl font-bold', colorMap[momentum.label] || '')}>
          {momentum.label}
        </p>
      </div>
      <IndicatorBar label="Composite" value={momentum.score} min={-100} max={100}
        zones={[
          { threshold: -100, color: 'bg-red-500' },
          { threshold: -15, color: 'bg-yellow-500' },
          { threshold: 15, color: 'bg-green-500' },
        ]}
        formatValue={(v) => `${v > 0 ? '+' : ''}${v}`}
      />
      <div className="grid grid-cols-4 gap-1 text-center text-xs">
        {(['rsiSignal', 'macdSignal', 'bollingerSignal', 'volumeSignal'] as const).map((key) => {
          const val = momentum.components[key];
          const labels = { rsiSignal: 'RSI', macdSignal: 'MACD', bollingerSignal: 'BB', volumeSignal: 'Vol' };
          return (
            <div key={key} className="rounded bg-secondary/50 p-1">
              <p className="text-muted-foreground">{labels[key]}</p>
              <p className={cn('font-mono font-medium',
                val > 0 ? 'text-green-500' : val < 0 ? 'text-red-500' : 'text-yellow-500')}>
                {val > 0 ? '+1' : val < 0 ? '-1' : '0'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar DeepAnalysisPanel.tsx**

```tsx
// frontend/src/components/common/DeepAnalysisPanel.tsx
import { useState } from 'react';
import { Activity, Loader2, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDeepAnalysis } from '@/hooks/useDeepAnalysis';
import {
  RsiSection,
  MacdSection,
  BollingerSection,
  VolumeSection,
  MomentumSection,
} from './TechnicalSection';

interface DeepAnalysisPanelProps {
  chain: string;
  address: string;
}

export function DeepAnalysisPanel({ chain, address }: DeepAnalysisPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeframe, setTimeframe] = useState<'hour' | 'day'>('hour');
  const { data, isLoading, error, refetch } = useDeepAnalysis(chain, address, { timeframe });

  return (
    <div className="glass-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Deep Analysis</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setTimeframe('hour')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                timeframe === 'hour' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
              }`}
            >
              1H
            </button>
            <button
              onClick={() => setTimeframe('day')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                timeframe === 'day' ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
              }`}
            >
              1D
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Calculando indicadores...</span>
        </div>
      )}

      {/* Error */}
      {error && !isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <AlertCircle className="h-4 w-4" />
          <span>Dados insuficientes para analise tecnica</span>
        </div>
      )}

      {/* Content */}
      {data && !isLoading && (
        <div className="space-y-6">
          {/* Momentum — sempre visível */}
          <MomentumSection momentum={data.momentum} />

          {/* Toggle detalhe */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Ocultar detalhes' : 'Ver indicadores detalhados'}
          </button>

          {/* Detalhe expandido */}
          {expanded && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-border/50">
              <RsiSection rsi={data.rsi} />
              <MacdSection macd={data.macd} />
              <BollingerSection bollinger={data.bollinger} />
              <VolumeSection volume={data.volumeProfile} />
            </div>
          )}

          {/* Meta */}
          <p className="text-[10px] text-muted-foreground text-right">
            {data.meta.candlesUsed} candles · {data.meta.timeframe} · {new Date(data.meta.calculatedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar frontend compila**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 4: Commit**

```bash
git add pool-intelligence-pro/frontend/src/components/common/TechnicalSection.tsx \
       pool-intelligence-pro/frontend/src/components/common/DeepAnalysisPanel.tsx
git commit -m "feat: criar componentes DeepAnalysisPanel e TechnicalSection"
```

---

## Task 7: Integração no ScoutPoolDetail + Verificação Final

**Files:**
- Modify: `pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx`

- [ ] **Step 1: Adicionar import do DeepAnalysisPanel**

No topo de `ScoutPoolDetail.tsx`, adicionar entre os outros imports de componentes:

```typescript
import { DeepAnalysisPanel } from '@/components/common/DeepAnalysisPanel';
```

- [ ] **Step 2: Inserir o componente no JSX**

Localizar o bloco `{/* AI Insights */}` (linha ~369) e inserir **ANTES** dele:

```tsx
      {/* Deep Analysis — Indicadores Técnicos */}
      {chain && address && (
        <div className="mb-6">
          <DeepAnalysisPanel chain={chain} address={address} />
        </div>
      )}
```

O resultado fica:
```tsx
      {/* Token Correlation */}
      {chain && address && (
        <div className="mb-6">
          <TokenCorrelation chain={chain} address={address} />
        </div>
      )}

      {/* Deep Analysis — Indicadores Técnicos */}
      {chain && address && (
        <div className="mb-6">
          <DeepAnalysisPanel chain={chain} address={address} />
        </div>
      )}

      {/* AI Insights */}
      {chain && address && (
        <div className="mb-6">
          <AIInsightsCard chain={chain} address={address} />
        </div>
      )}
```

- [ ] **Step 3: Verificar frontend compila**

```bash
cd pool-intelligence-pro/frontend && npx tsc --noEmit
# Expected: 0 errors
```

- [ ] **Step 4: Commit integração**

```bash
git add pool-intelligence-pro/frontend/src/pages/ScoutPoolDetail.tsx
git commit -m "feat: integrar DeepAnalysisPanel na pagina ScoutPoolDetail"
```

- [ ] **Step 5: Verificação completa (REGRA #0)**

```bash
# Backend
cd pool-intelligence-pro/backend && npx vitest run && npx tsc --noEmit
# Expected: 264+ testes passando, 0 erros TS

# Frontend
cd pool-intelligence-pro/frontend && npm run build
# Expected: exit 0, Vite build success

# Full build
cd pool-intelligence-pro && npm run build
# Expected: exit 0

# Git status
git status && git log --oneline -10
```

- [ ] **Step 6: Commit final + push**

```bash
git push -u origin claude/write-deep-analysis-plan-rM6eK
```

---

## Execution Strategy — Parallel Agents

Para evitar timeouts na execução, dividir em **2 waves paralelas**:

### Wave 1 (paralela — 2 subagents)

| Subagent | Tasks | Escopo |
|----------|-------|--------|
| **Backend Agent** | Tasks 1, 2, 3, 4 | Serviço, testes, endpoint, job |
| **Frontend Agent** | Tasks 5, 6 | Client, hook, componentes |

> **Nota:** O Frontend Agent pode criar os tipos localmente no client.ts sem depender do backend estar pronto. A interface `DeepAnalysisData` no frontend é duplicada por design (frontend types independentes do backend).

### Wave 2 (sequencial — main agent)

| Tasks | Escopo |
|-------|--------|
| Task 7 | Integração ScoutPoolDetail + verificação final |

### Dependency Graph

```
Task 1 (RSI) ─────→ Task 2 (MACD+BB) ─→ Task 3 (Vol+Mom) ─→ Task 4 (Endpoint+Job) ─┐
                                                                                       ├→ Task 7 (Integration)
Task 5 (Client+Hook) ──────────────────→ Task 6 (Components) ────────────────────────────┘
```

---

## Checklist de Qualidade (REGRA #1)

- [ ] TypeScript compila sem erros (frontend + backend)
- [ ] Vitest: todos os testes passam (264 existentes + novos indicadores)
- [ ] Build completo: `npm run build` na raiz passa
- [ ] Nenhum arquivo existente teve comportamento alterado
- [ ] Imports com `.js` no backend (ESM)
- [ ] Sem `any` — todos os tipos explícitos
- [ ] Zod schema para query params do endpoint
- [ ] Cache TTL configurado (5min hour, 15min day)
- [ ] Job cron registrado em `initializeJobs()`
- [ ] CHECKPOINT.md atualizado ao final
