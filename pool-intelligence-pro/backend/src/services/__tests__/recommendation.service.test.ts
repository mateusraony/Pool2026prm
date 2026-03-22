import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecommendationService } from '../recommendation.service.js';
import { Pool, Score, Mode } from '../../types/index.js';

// -----------------------------------------------------------------------
// Mock external dependencies so tests run without DB / config side-effects
// -----------------------------------------------------------------------

vi.mock('../log.service.js', () => ({
  logService: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../config/index.js', () => ({
  config: {
    thresholds: {
      minVolume24h: 10_000,
    },
  },
}));

vi.mock('../market-regime.service.js', () => ({
  marketRegimeService: {
    classifyPool: vi.fn().mockReturnValue({
      regime: 'RANGING',
      reason: 'Stable price action',
      lpFriendly: true,
      confidence: 0.8,
    }),
  },
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makePool(overrides: Partial<Pool> = {}): Pool {
  return {
    externalId: 'test-pool-1',
    chain: 'ethereum',
    protocol: 'uniswap-v3',
    poolAddress: '0xabc123',
    token0: { symbol: 'WETH', address: '0xa', decimals: 18 },
    token1: { symbol: 'USDC', address: '0xb', decimals: 6 },
    feeTier: 0.003,
    price: 2500,
    tvl: 5_000_000,
    volume24h: 500_000,
    fees24h: 1500,
    apr: 25,
    bluechip: true,
    ...overrides,
  };
}

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    total: 75,
    health: 30,
    return: 25,
    risk: 20,
    recommendedMode: 'NORMAL',
    isSuspect: false,
    breakdown: {
      health: {
        liquidityStability: 10,
        ageScore: 10,
        volumeConsistency: 10,
      },
      return: {
        volumeTvlRatio: 8,
        feeEfficiency: 8,
        aprEstimate: 40, // 40% APR in breakdown
      },
      risk: {
        volatilityPenalty: 5,
        liquidityDropPenalty: 0,
        inconsistencyPenalty: 0,
        spreadPenalty: 0,
      },
    },
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService();
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // estimateGains — retorno com IL deduzido
  // Testado indiretamente via generateTop3 → generateRecommendation
  // -----------------------------------------------------------------------

  describe('estimateGains — retorno com IL deduzido', () => {

    it('DEFENSIVE tem concentrationFactor maior → IL maior que AGGRESSIVE para mesma volatilidade', () => {
      // Pool com vol 80% anualizada
      // DEFENSIVE: rangeWidth=0.10 → concFactor = 0.15/0.10 = 1.5
      // AGGRESSIVE: rangeWidth=0.22 → concFactor = 0.15/0.22 ≈ 0.68
      // Como DEFENSIVE tem concFactor MAIOR, a dedução de IL é maior
      // O modeMultiplier de DEFENSIVE (0.7) também é menor → fees brutas menores
      // Para alta volatilidade, o AGGRESSIVE deve resultar em gainPercent maior

      const pool = makePool({ volatilityAnn: 0.80, apr: 40 });
      const score = makeScore({ total: 80 });

      const recsDefensive = service.generateTop3(
        [{ pool, score }],
        'DEFENSIVE',
        10_000
      );
      const recsAggressive = service.generateTop3(
        [{ pool, score }],
        'AGGRESSIVE',
        10_000
      );

      const gainDefensive = recsDefensive[0].estimatedGainPercent;
      const gainAggressive = recsAggressive[0].estimatedGainPercent;

      // Para vol=80%, o AGGRESSIVE deve bater DEFENSIVE
      // DEFENSIVE: fees = (40/52) × 0.7 × 0.80 ≈ 0.430; IL ≈ 0.5 × (0.80 × √(7/365))² × 1.5 × 100
      // AGGRESSIVE: fees = (40/52) × 1.3 × 0.80 ≈ 0.799; IL ≈ 0.5 × (0.80 × √(7/365))² × 0.68 × 100
      // AGGRESSIVE ganha mais fees e tem menos IL → deve ser maior
      expect(gainAggressive).toBeGreaterThan(gainDefensive);
    });

    it('pool com 150% vol anualizada gera gainPercent negativo em DEFENSIVE', () => {
      // Com vol=1.50 e modo DEFENSIVE:
      //   sigmaWeekly = 1.50 × √(7/365) ≈ 0.2078
      //   concFactor = 0.15/0.10 = 1.5
      //   weeklyIL = 0.5 × 0.2078² × 1.5 × 100 ≈ 3.23%
      //   weeklyGross = aprEstimate / 52; para APR=40%: 40/52 ≈ 0.769%
      //   grossAdjusted = 0.769 × 0.7 (DEFENSIVE) = 0.538%
      //   confidenceFactor = score.total / 100 = 0.75
      //   netReturn = 0.538 × 0.75 - 3.23 ≈ 0.404 - 3.23 ≈ -2.83%
      // → gainPercent deve ser negativo

      const pool = makePool({ volatilityAnn: 1.50, apr: 40 });
      const score = makeScore({ total: 75 });

      const recs = service.generateTop3(
        [{ pool, score }],
        'DEFENSIVE',
        10_000
      );

      expect(recs[0].estimatedGainPercent).toBeLessThan(0);
    });

    it('pool estável com APR alto tem gainPercent positivo em todos os modos', () => {
      // vol=0.20 (20% anualizado — pool estável como ETH/USDC)
      // APR=100% — pool com muito volume
      //   sigmaWeekly = 0.20 × √(7/365) ≈ 0.0520
      //   weeklyGross = 100/52 ≈ 1.923%
      //   Para DEFENSIVE: grossAdjusted = 1.923 × 0.7 = 1.346%; concFactor=1.5
      //     weeklyIL = 0.5 × 0.0520² × 1.5 × 100 ≈ 0.202%
      //     netReturn = 1.346 × 0.75 - 0.202 ≈ 0.809 (positivo)
      //   Para todos os modos: fees superam IL com boa margem

      const pool = makePool({ volatilityAnn: 0.20, apr: 100 });
      const score = makeScore({ total: 75 });
      const modes: Mode[] = ['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'];

      for (const mode of modes) {
        const recs = service.generateTop3(
          [{ pool, score }],
          mode,
          10_000
        );
        expect(recs[0].estimatedGainPercent).toBeGreaterThan(0);
      }
    });

    it('AGGRESSIVE tem modeMultiplier 1.3x → mais fees brutas que NORMAL (1.0x) em pool de baixa vol', () => {
      // Para pool de baixa volatilidade (vol=0.20), IL é pequeno e similar nos dois modos
      // AGGRESSIVE (mult=1.3) deve ter gainPercent maior que NORMAL (mult=1.0)
      // porque o diferencial de fees supera o diferencial de IL (pequeno neste caso)

      const pool = makePool({ volatilityAnn: 0.20, apr: 60 });
      const score = makeScore({ total: 80 });

      const recsNormal = service.generateTop3(
        [{ pool, score }],
        'NORMAL',
        10_000
      );
      const recsAggressive = service.generateTop3(
        [{ pool, score }],
        'AGGRESSIVE',
        10_000
      );

      const gainNormal = recsNormal[0].estimatedGainPercent;
      const gainAggressive = recsAggressive[0].estimatedGainPercent;

      // AGGRESSIVE deve ter retorno maior para vol baixa (IL diferencial pequeno)
      expect(gainAggressive).toBeGreaterThan(gainNormal);
    });
  });

  // -----------------------------------------------------------------------
  // generateTop3 — usa modo do caller
  // -----------------------------------------------------------------------

  describe('generateTop3 — usa modo do caller', () => {

    it('usa mode do caller, não recommendedMode dos pools', () => {
      // Criar 3 pools com recommendedMode='AGGRESSIVE' nos scores
      // Chamar generateTop3 com mode='DEFENSIVE'
      // Verificar que as recomendações retornadas têm mode='DEFENSIVE'

      const pools = [1, 2, 3].map((i) => ({
        pool: makePool({
          externalId: `pool-${i}`,
          poolAddress: `0xabc${i}`,
          volatilityAnn: 0.30,
        }),
        score: makeScore({
          total: 70 + i,
          recommendedMode: 'AGGRESSIVE', // score sugere AGGRESSIVE
        }),
      }));

      const recs = service.generateTop3(pools, 'DEFENSIVE', 10_000);

      expect(recs.length).toBeGreaterThan(0);
      for (const rec of recs) {
        // deve usar o modo do caller, não recommendedMode='AGGRESSIVE'
        expect(rec.mode).toBe('DEFENSIVE');
      }
    });

    it('gainPercent negativo é retornado sem ser truncado a zero', () => {
      // Pool extremamente volátil deve retornar gainPercent < 0
      // O sistema não deve arredondar para 0 ou lançar erro
      // É informação real para o usuário

      const pool = makePool({ volatilityAnn: 2.0, apr: 20 });
      // vol=2.0, APR=20%, DEFENSIVE:
      //   sigmaWeekly = 2.0 × √(7/365) ≈ 0.2774
      //   concFactor = 1.5
      //   weeklyIL = 0.5 × 0.2774² × 1.5 × 100 ≈ 5.77%
      //   weeklyGross = 20/52 ≈ 0.385%; grossAdjusted = 0.385 × 0.7 ≈ 0.269%
      //   netReturn = 0.269 × conf - 5.77 → fortemente negativo
      const score = makeScore({ total: 60 });

      const recs = service.generateTop3(
        [{ pool, score }],
        'DEFENSIVE',
        10_000
      );

      const gainPercent = recs[0].estimatedGainPercent;

      // Deve ser negativo — não truncado
      expect(gainPercent).toBeLessThan(0);

      // gainUsd deve ser consistente com gainPercent (capital × gainPercent/100)
      const expectedGainUsd = Math.round(10_000 * (gainPercent / 100) * 100) / 100;
      expect(recs[0].estimatedGainUsd).toBe(expectedGainUsd);

      // Também não deve lançar exceção — o bloco try/catch implícito do vitest
      // capturaria se houvesse throw; chegando aqui, está ok
    });
  });
});
