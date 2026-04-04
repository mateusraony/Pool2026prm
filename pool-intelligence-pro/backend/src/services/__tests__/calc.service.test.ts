/**
 * Testes unitários para calc.service.ts
 * Foco: calcIL, calcMonteCarlo, calcBacktest
 *
 * logService é mockado para evitar side-effects em produção.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calcIL,
  calcMonteCarlo,
  calcBacktest,
} from '../calc.service.js';

// -----------------------------------------------------------------------
// Mock de dependências externas
// -----------------------------------------------------------------------

vi.mock('../log.service.js', () => ({
  logService: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// -----------------------------------------------------------------------
// calcIL — Impermanent Loss analítico para posição CL / V2
// -----------------------------------------------------------------------

describe('calcIL', () => {
  // --- Saída com formato correto ---

  it('retorna objeto com ilPercent, ilUsd e outOfRange', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 100, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result).toHaveProperty('ilPercent');
    expect(result).toHaveProperty('ilUsd');
    expect(result).toHaveProperty('outOfRange');
  });

  // --- Sem movimento de preço → sem IL ---

  it('retorna ilPercent = 0 quando entryPrice = currentPrice', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 100, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
    expect(result.outOfRange).toBe(false);
  });

  // --- IL dentro do range ---

  it('price=100 lower=90 upper=110: IL < 0 quando preço se move para 105', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 105, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBeLessThanOrEqual(0);
    expect(result.outOfRange).toBe(false);
  });

  // --- IL fora do range ---

  it('price=100 lower=90 upper=110: outOfRange=true quando currentPrice=130', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 130, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.outOfRange).toBe(true);
    expect(result.ilPercent).toBeLessThan(0);
  });

  it('price=100 lower=90 upper=110: outOfRange=true quando currentPrice=70', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 70, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.outOfRange).toBe(true);
    expect(result.ilPercent).toBeLessThan(0);
  });

  // --- IL fora > dentro (magnitude) ---

  it('IL fora do range >= IL dentro do range (magnitude)', () => {
    const inside = calcIL({ entryPrice: 100, currentPrice: 108, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    const outside = calcIL({ entryPrice: 100, currentPrice: 150, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(Math.abs(outside.ilPercent)).toBeGreaterThanOrEqual(Math.abs(inside.ilPercent));
  });

  // --- Fórmula V2 — k=2 → IL ≈ -5.72% ---

  it('V2 pool: IL ≈ -5.72% quando preço dobra (priceRatio = 2)', () => {
    // Fórmula: 2√2/(1+2) - 1 ≈ -0.0572 = -5.72%
    const result = calcIL({ entryPrice: 100, currentPrice: 200, rangeLower: 50, rangeUpper: 500, poolType: 'V2' });
    expect(result.ilPercent).toBeCloseTo(-5.72, 0);
  });

  // --- Edge cases: preços inválidos ---

  it('entryPrice = 0 → retorna ilPercent = 0 sem lançar erro', () => {
    const result = calcIL({ entryPrice: 0, currentPrice: 100, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
  });

  it('currentPrice = 0 → retorna ilPercent = 0 sem lançar erro', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 0, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
  });

  // --- ilUsd sempre zero (capital não é passado) ---

  it('ilUsd é sempre 0 (caller é responsável por multiplicar pelo capital)', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 120, rangeLower: 90, rangeUpper: 130, poolType: 'CL' });
    expect(result.ilUsd).toBe(0);
  });
});

// -----------------------------------------------------------------------
// calcMonteCarlo — Simulação Monte Carlo para posição de liquidez
// -----------------------------------------------------------------------

describe('calcMonteCarlo', () => {
  const BASE = {
    currentPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    capital: 10_000,
    volAnn: 0.5,
    fees24h: 5_000,
    tvl: 10_000_000,
    horizonDays: 30,
    scenarios: 200,
    mode: 'NORMAL' as const,
  };

  // --- Estrutura de saída ---

  it('retorna objeto com todos os campos obrigatórios', () => {
    const result = calcMonteCarlo(BASE);
    expect(result).toHaveProperty('scenarios');
    expect(result).toHaveProperty('horizonDays');
    expect(result).toHaveProperty('percentiles');
    expect(result).toHaveProperty('probProfit');
    expect(result).toHaveProperty('probOutOfRange');
    expect(result).toHaveProperty('avgPnl');
    expect(result).toHaveProperty('worstCase');
    expect(result).toHaveProperty('bestCase');
    expect(result).toHaveProperty('distribution');
  });

  it('percentiles tem p5, p25, p50, p75, p95', () => {
    const { percentiles } = calcMonteCarlo(BASE);
    expect(percentiles).toHaveProperty('p5');
    expect(percentiles).toHaveProperty('p25');
    expect(percentiles).toHaveProperty('p50');
    expect(percentiles).toHaveProperty('p75');
    expect(percentiles).toHaveProperty('p95');
  });

  it('cada outcome do percentil tem shape correto', () => {
    const outcome = calcMonteCarlo({ ...BASE, scenarios: 10 }).percentiles.p50;
    expect(outcome).toHaveProperty('finalPrice');
    expect(outcome).toHaveProperty('priceChange');
    expect(outcome).toHaveProperty('feesEarned');
    expect(outcome).toHaveProperty('ilLoss');
    expect(outcome).toHaveProperty('pnl');
    expect(outcome).toHaveProperty('pnlPercent');
    expect(outcome).toHaveProperty('isInRange');
    expect(typeof outcome.isInRange).toBe('boolean');
  });

  // --- Invariantes de probabilidade ---

  it('probProfit está entre 0 e 100', () => {
    const result = calcMonteCarlo(BASE);
    expect(result.probProfit).toBeGreaterThanOrEqual(0);
    expect(result.probProfit).toBeLessThanOrEqual(100);
  });

  it('probOutOfRange está entre 0 e 100', () => {
    const result = calcMonteCarlo(BASE);
    expect(result.probOutOfRange).toBeGreaterThanOrEqual(0);
    expect(result.probOutOfRange).toBeLessThanOrEqual(100);
  });

  // --- Ordenação de percentis ---

  it('worstCase.pnl <= p50.pnl <= bestCase.pnl', () => {
    const result = calcMonteCarlo(BASE);
    expect(result.worstCase.pnl).toBeLessThanOrEqual(result.percentiles.p50.pnl);
    expect(result.percentiles.p50.pnl).toBeLessThanOrEqual(result.bestCase.pnl);
  });

  // --- Distribuição ---

  it('distribution tem exatamente 10 buckets', () => {
    const result = calcMonteCarlo(BASE);
    expect(result.distribution).toHaveLength(10);
  });

  // --- scenarios e horizonDays refletem input ---

  it('scenarios count corresponde ao input', () => {
    const result = calcMonteCarlo({ ...BASE, scenarios: 100 });
    expect(result.scenarios).toBe(100);
  });

  it('horizonDays corresponde ao input', () => {
    const result = calcMonteCarlo({ ...BASE, horizonDays: 14 });
    expect(result.horizonDays).toBe(14);
  });

  // --- Edge case: capital = 0 ---

  it('capital = 0: não lança erro e pnlPercent = 0', () => {
    const result = calcMonteCarlo({ ...BASE, capital: 0 });
    expect(result.scenarios).toBeGreaterThan(0);
    expect(result.worstCase.pnlPercent).toBe(0);
  });

  // --- Volatilidade alta → mais saídas do range ---

  it('volatilidade alta aumenta probOutOfRange vs volatilidade baixa', () => {
    const low = calcMonteCarlo({ ...BASE, volAnn: 0.05, scenarios: 500 });
    const high = calcMonteCarlo({ ...BASE, volAnn: 3.0, scenarios: 500 });
    expect(high.probOutOfRange).toBeGreaterThan(low.probOutOfRange);
  });
});

// -----------------------------------------------------------------------
// calcBacktest — Backtest de estratégia de range com histórico de preços
// -----------------------------------------------------------------------

describe('calcBacktest', () => {
  const BASE = {
    capital: 10_000,
    entryPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    volAnn: 0.5,
    fees24h: 5_000,
    tvl: 10_000_000,
    mode: 'NORMAL' as const,
    periodDays: 30,
  };

  // --- Estrutura de saída ---

  it('retorna objeto com todos os campos obrigatórios', () => {
    const result = calcBacktest(BASE);
    expect(result).toHaveProperty('periodDays');
    expect(result).toHaveProperty('totalFees');
    expect(result).toHaveProperty('totalIL');
    expect(result).toHaveProperty('netPnl');
    expect(result).toHaveProperty('netPnlPercent');
    expect(result).toHaveProperty('maxDrawdown');
    expect(result).toHaveProperty('timeInRange');
    expect(result).toHaveProperty('rebalances');
    expect(result).toHaveProperty('dailyReturns');
    expect(result).toHaveProperty('transactionCosts');
  });

  it('transactionCosts tem entryCost, exitCost, rebalancingCosts e total', () => {
    const { transactionCosts } = calcBacktest(BASE);
    expect(transactionCosts).toHaveProperty('entryCost');
    expect(transactionCosts).toHaveProperty('exitCost');
    expect(transactionCosts).toHaveProperty('rebalancingCosts');
    expect(transactionCosts).toHaveProperty('total');
  });

  it('dailyReturns tem um entry por dia simulado', () => {
    const result = calcBacktest(BASE);
    expect(result.dailyReturns).toHaveLength(result.periodDays);
  });

  it('cada entry de dailyReturns tem day, cumPnl, fees, il', () => {
    const entry = calcBacktest(BASE).dailyReturns[0];
    expect(entry).toHaveProperty('day');
    expect(entry).toHaveProperty('cumPnl');
    expect(entry).toHaveProperty('fees');
    expect(entry).toHaveProperty('il');
  });

  // --- Invariantes de valores ---

  it('totalFees >= 0', () => {
    expect(calcBacktest(BASE).totalFees).toBeGreaterThanOrEqual(0);
  });

  it('totalIL >= 0', () => {
    expect(calcBacktest(BASE).totalIL).toBeGreaterThanOrEqual(0);
  });

  it('netPnl = totalFees - totalIL - transactionCosts.total', () => {
    const r = calcBacktest(BASE);
    expect(r.netPnl).toBeCloseTo(r.totalFees - r.totalIL - r.transactionCosts.total, 1);
  });

  it('transactionCosts.total = entryCost + exitCost + rebalancingCosts', () => {
    const { transactionCosts: tc } = calcBacktest(BASE);
    expect(tc.total).toBeCloseTo(tc.entryCost + tc.exitCost + tc.rebalancingCosts, 1);
  });

  it('timeInRange está entre 0 e 100', () => {
    const r = calcBacktest(BASE);
    expect(r.timeInRange).toBeGreaterThanOrEqual(0);
    expect(r.timeInRange).toBeLessThanOrEqual(100);
  });

  it('maxDrawdown >= 0', () => {
    expect(calcBacktest(BASE).maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  // --- priceHistory fornecido ---

  it('preço estável dentro do range → timeInRange = 100% e rebalances = 0', () => {
    const stableHistory = Array.from({ length: 30 }, () => 2500);
    const result = calcBacktest({ ...BASE, priceHistory: stableHistory });
    expect(result.timeInRange).toBe(100);
    expect(result.rebalances).toBe(0);
  });

  it('preço sempre fora do range → totalFees = 0 e timeInRange = 0', () => {
    const outOfRangeHistory = Array.from({ length: 10 }, () => 1000);
    const result = calcBacktest({ ...BASE, periodDays: 10, priceHistory: outOfRangeHistory });
    expect(result.totalFees).toBe(0);
    expect(result.timeInRange).toBe(0);
  });

  // --- Edge case: capital = 0 ---

  it('capital = 0: fees e IL são zero, sem erro', () => {
    const result = calcBacktest({ ...BASE, capital: 0 });
    expect(result.totalFees).toBe(0);
    expect(result.totalIL).toBe(0);
    expect(result.transactionCosts.total).toBe(0);
  });

  // --- Modo AGGRESSIVE acumula mais fees que DEFENSIVE (mesmo período) ---

  it('modo AGGRESSIVE gera mais fees que DEFENSIVE para mesmo capital e pool', () => {
    const def = calcBacktest({ ...BASE, mode: 'DEFENSIVE', priceHistory: Array.from({ length: 30 }, () => 2500) });
    const agg = calcBacktest({ ...BASE, mode: 'AGGRESSIVE', priceHistory: Array.from({ length: 30 }, () => 2500) });
    expect(agg.totalFees).toBeGreaterThan(def.totalFees);
  });
});
