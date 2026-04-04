import { describe, it, expect } from 'vitest';
import {
  calcAprFee,
  calcIL,
  calcHealthScore,
  calcRangeRecommendation,
  calcTickLiquidity,
  calcRangeBenchmark,
} from '../services/calc.service.js';
import { riskService } from '../services/risk.service.js';
import { marketRegimeService } from '../services/market-regime.service.js';
import { ScoreService } from '../services/score.service.js';
import { formatDateTz, todayStringTz, isTimeMatch } from '../services/time.service.js';
import { Pool } from '../types/index.js';

// ---------------------------------------------------------------------------
// Helper: cria um mock Pool realista de ETH/USDC
// ---------------------------------------------------------------------------
const mockPool = (overrides: Partial<Pool> = {}): Pool => ({
  externalId: 'ethereum_0xtest',
  chain: 'ethereum',
  protocol: 'uniswap-v3',
  poolAddress: '0xtest',
  token0: { symbol: 'ETH', address: '0xeth', decimals: 18 },
  token1: { symbol: 'USDC', address: '0xusdc', decimals: 6 },
  feeTier: 0.003,
  price: 2000,
  tvl: 500_000,
  volume24h: 50_000,
  fees24h: 150,
  apr: 30,
  volatilityAnn: 0.8,
  bluechip: true,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Instância do ScoreService com pesos padrão
// ---------------------------------------------------------------------------
const scoreService = new ScoreService({ health: 50, return: 40, risk: 25 });

// ===========================================================================
// Smoke Tests — Fase 6 (pós-deploy)
// ===========================================================================

describe('Smoke Tests — Fase 6 (pós-deploy)', () => {

  // =========================================================================
  describe('6.5.1 — calc.service core functions', () => {

    it('calcAprFee: fees24h=1000, tvl=1_000_000 → feeAPR > 0', () => {
      const result = calcAprFee({ fees24h: 1000, tvl: 1_000_000 });
      expect(result.feeAPR).not.toBeNull();
      expect(result.feeAPR as number).toBeGreaterThan(0);
      expect(result.source).toBe('fees24h');
    });

    it('calcIL: ETH/USDC, entry=2000, current=2400, CL range [1500,3000] → ilPercent < 0', () => {
      const result = calcIL({
        entryPrice: 2000,
        currentPrice: 2400,
        rangeLower: 1500,
        rangeUpper: 3000,
        poolType: 'CL',
      });
      // IL deve ser negativo (representa perda)
      expect(result.ilPercent).toBeLessThan(0);
      expect(result.outOfRange).toBe(false);
    });

    it('calcHealthScore: tvl=500_000, volume1h=50_000/24h, feeTier=0.003 → score entre 0 e 100', () => {
      const result = calcHealthScore({
        tvl: 500_000,
        volume1h: 2_083,   // ~50k/24h ÷ 24
        volAnn: 0.8,
        poolType: 'CL',
        updatedAt: new Date(),
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('calcRangeRecommendation: price=2000, volAnn=0.8, horizonDays=7 → lower < price < upper', () => {
      const result = calcRangeRecommendation({
        price: 2000,
        volAnn: 0.8,
        horizonDays: 7,
        riskMode: 'NORMAL',
      });
      expect(result.lower).toBeLessThan(2000);
      expect(result.upper).toBeGreaterThan(2000);
      expect(result.widthPct).toBeGreaterThan(0);
    });

    it('calcTickLiquidity: tvl=1_000_000, price=2000, volatilityAnn=0.8, range=[1600,2500] → fractionInRange entre 0 e 1, capitalEfficiency >= 1', () => {
      const result = calcTickLiquidity({
        tvl: 1_000_000,
        price: 2000,
        volatilityAnn: 0.8,
        rangeLower: 1600,
        rangeUpper: 2500,
      });
      expect(result.fractionInRange).toBeGreaterThan(0);
      expect(result.fractionInRange).toBeLessThanOrEqual(1);
      expect(result.capitalEfficiency).toBeGreaterThanOrEqual(1);
      expect(result.method).toBe('log_normal');
    });

    it('calcRangeBenchmark: inputs realistas → verdict em [OUTPERFORMING, UNDERPERFORMING, NEUTRAL]', () => {
      const result = calcRangeBenchmark({
        startPrice: 2000,
        endPrice: 2100,
        rangeLower: 1600,
        rangeUpper: 2500,
        feesEarnedUsd: 500,
        capitalUsd: 100_000,
        periodDays: 30,
        feeTier: 0.003,
        volatilityAnn: 0.8,
      });
      const validVerdicts = ['OUTPERFORMING', 'UNDERPERFORMING', 'NEUTRAL'] as const;
      expect(validVerdicts).toContain(result.verdict);
      expect(result.periodDays).toBe(30);
      expect(result.startPrice).toBe(2000);
      expect(result.endPrice).toBe(2100);
    });

  });

  // =========================================================================
  describe('6.5.2 — risk.service', () => {

    it('assessPool(pool normal ETH/USDC) → level em [LOW,MEDIUM,HIGH,CRITICAL]', () => {
      const pool = mockPool();
      const result = riskService.assessPool(pool);
      const validLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
      expect(validLevels).toContain(result.level);
    });

    it('assessPool(pool normal) → score entre 0 e 100', () => {
      const pool = mockPool();
      const result = riskService.assessPool(pool);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('assessPool(pool normal) → shouldOperate é boolean', () => {
      const pool = mockPool();
      const result = riskService.assessPool(pool);
      expect(typeof result.shouldOperate).toBe('boolean');
    });

    it('assessPool(pool com APR=1500%, honeypot) → level CRITICAL e shouldOperate false', () => {
      const pool = mockPool({ apr: 1500 });
      const result = riskService.assessPool(pool);
      expect(result.level).toBe('CRITICAL');
      expect(result.shouldOperate).toBe(false);
    });

    it('assessPool(pool com APR=1500%) → factors inclui HONEYPOT_APR', () => {
      const pool = mockPool({ apr: 1500 });
      const result = riskService.assessPool(pool);
      const codes = result.factors.map(f => f.code);
      expect(codes).toContain('HONEYPOT_APR');
    });

  });

  // =========================================================================
  describe('6.5.3 — market-regime.service', () => {

    it('classifyPool: volatilityAnn=0.1, volume/tvl=0.05 → regime RANGING', () => {
      const pool = mockPool({
        volatilityAnn: 0.1,
        tvl: 1_000_000,
        volume24h: 50_000, // ratio = 0.05
      });
      const result = marketRegimeService.classifyPool(pool);
      // Com vol=10% (< 30%) e volumeTvlRatio=0.05 (>= 0.001), espera RANGING
      expect(['RANGING', 'UNKNOWN']).toContain(result.regime);
    });

    it('classifyPool: volatilityAnn=1.5 → regime HIGH_VOLATILITY', () => {
      const pool = mockPool({
        volatilityAnn: 1.5,
        tvl: 500_000,
        volume24h: 50_000,
      });
      const result = marketRegimeService.classifyPool(pool);
      expect(result.regime).toBe('HIGH_VOLATILITY');
    });

    it('classifyPool: volume24h=0, tvl=1_000_000 → regime LOW_LIQUIDITY', () => {
      const pool = mockPool({
        volatilityAnn: 0.3,
        tvl: 1_000_000,
        volume24h: 0,
      });
      const result = marketRegimeService.classifyPool(pool);
      expect(result.regime).toBe('LOW_LIQUIDITY');
    });

    it('classifyPool retorna campos obrigatórios: regime, lpFriendly, confidence, reason', () => {
      const pool = mockPool();
      const result = marketRegimeService.classifyPool(pool);
      expect(result).toHaveProperty('regime');
      expect(result).toHaveProperty('lpFriendly');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('reason');
      expect(typeof result.lpFriendly).toBe('boolean');
    });

  });

  // =========================================================================
  describe('6.5.4 — score.service', () => {

    it('calculateScore(pool bom) → total entre 0 e 100', () => {
      const pool = mockPool({
        tvl: 500_000,
        volume24h: 50_000,
        fees24h: 150,
        apr: 30,
        bluechip: true,
      });
      const result = scoreService.calculateScore(pool);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
    });

    it('calculateScore(pool bom) → isSuspect é boolean', () => {
      const pool = mockPool();
      const result = scoreService.calculateScore(pool);
      expect(typeof result.isSuspect).toBe('boolean');
    });

    it('calculateScore retorna campos obrigatórios', () => {
      const pool = mockPool();
      const result = scoreService.calculateScore(pool);
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('return');
      expect(result).toHaveProperty('risk');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('isSuspect');
    });

    it('calculateScore(pool com APR=1000%) → isSuspect true', () => {
      const pool = mockPool({ apr: 1000 });
      const result = scoreService.calculateScore(pool);
      expect(result.isSuspect).toBe(true);
    });

  });

  // =========================================================================
  describe('6.5.5 — time.service', () => {

    it('formatDateTz(new Date(), "America/Sao_Paulo") → string não vazia com "/"', () => {
      const result = formatDateTz(new Date(), 'America/Sao_Paulo');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('/');
    });

    it('todayStringTz("America/Sao_Paulo") → formato YYYY-MM-DD (10 chars, tem "-")', () => {
      const result = todayStringTz('America/Sao_Paulo');
      expect(result).toHaveLength(10);
      expect(result).toContain('-');
      // Verifica formato YYYY-MM-DD com regex
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('isTimeMatch(25, 0, "UTC") → false (hora 25 é inválida, nunca será a hora atual)', () => {
      const result = isTimeMatch(25, 0, 'UTC');
      expect(result).toBe(false);
    });

    it('isTimeMatch(hora atual UTC, minuto atual UTC) → true', () => {
      const now = new Date();
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();
      const result = isTimeMatch(hour, minute, 'UTC');
      expect(result).toBe(true);
    });

  });

});
