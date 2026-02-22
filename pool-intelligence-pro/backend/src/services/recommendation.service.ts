import { Pool, Score, Recommendation, Mode } from '../types/index.js';
import { config } from '../config/index.js';
import { logService } from './log.service.js';

interface RecommendationInput {
  pool: Pool;
  score: Score;
  mode: Mode;
  capital: number;
}

export class RecommendationService {
  // Generate Top N recommendations (default 10)
  generateTop3(
    poolsWithScores: { pool: Pool; score: Score }[],
    mode: Mode,
    capital: number,
    limit: number = 10
  ): Recommendation[] {
    // Generate recommendations for ALL modes to allow filtering later
    const allRecommendations: Recommendation[] = [];

    // Sort by score
    const sorted = poolsWithScores
      .filter(({ score }) => !score.isSuspect)
      .sort((a, b) => b.score.total - a.score.total);

    // Generate for each pool with its recommended mode
    for (let i = 0; i < Math.min(sorted.length, limit * 3); i++) {
      const item = sorted[i];
      const poolMode = item.score.recommendedMode;

      allRecommendations.push(
        this.generateRecommendation({
          pool: item.pool,
          score: item.score,
          mode: poolMode,
          capital,
        }, i + 1)
      );
    }

    // Return all (will be filtered by API if needed)
    return allRecommendations.slice(0, limit * 3);
  }

  private isModeCompatible(recommended: Mode, selected: Mode): boolean {
    const modeOrder: Mode[] = ['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'];
    const recommendedIndex = modeOrder.indexOf(recommended);
    const selectedIndex = modeOrder.indexOf(selected);
    
    // Can select same or more defensive mode
    return selectedIndex <= recommendedIndex;
  }

  private generateRecommendation(input: RecommendationInput, rank: number): Recommendation {
    const { pool, score, mode, capital } = input;
    
    // Calculate probability based on score and mode
    const probability = this.calculateProbability(score, mode);
    
    // Estimate gains
    const { gainPercent, gainUsd } = this.estimateGains(pool, score, capital, mode);
    
    // Generate conditions and risks
    const entryConditions = this.generateEntryConditions(pool, score, mode);
    const exitConditions = this.generateExitConditions(pool, score, mode);
    const mainRisks = this.identifyMainRisks(pool, score);
    
    // Generate commentary
    const commentary = this.generateCommentary(pool, score, mode, probability, gainPercent, mainRisks);
    
    // Set validity (24 hours for recommendations)
    const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    return {
      rank,
      pool,
      score,
      commentary,
      probability,
      estimatedGainPercent: gainPercent,
      estimatedGainUsd: gainUsd,
      capitalUsed: capital,
      entryConditions,
      exitConditions,
      mainRisks,
      mode,
      dataTimestamp: new Date(),
      validUntil,
    };
  }

  private calculateProbability(score: Score, mode: Mode): number {
    // Base probability from score
    let baseProbability = score.total * 0.7; // Max 70% from score
    
    // Adjust by mode
    const modeMultiplier: Record<Mode, number> = {
      DEFENSIVE: 1.2,  // Higher probability for defensive
      NORMAL: 1.0,
      AGGRESSIVE: 0.8, // Lower probability for aggressive
    };
    
    baseProbability *= modeMultiplier[mode];
    
    // Cap at 85% (never guarantee)
    return Math.min(85, Math.round(baseProbability));
  }

  private estimateGains(
    pool: Pool,
    score: Score,
    capital: number,
    mode: Mode
  ): { gainPercent: number; gainUsd: number } {
    // Use APR from score breakdown or estimate
    const baseApr = score.breakdown.return.aprEstimate || this.estimateAprFromPool(pool);
    
    // Weekly return (APR / 52)
    const weeklyReturn = baseApr / 52;
    
    // Adjust by mode
    const modeMultiplier: Record<Mode, number> = {
      DEFENSIVE: 0.7,  // Lower but more consistent
      NORMAL: 1.0,
      AGGRESSIVE: 1.3, // Higher but riskier
    };
    
    const adjustedReturn = weeklyReturn * modeMultiplier[mode];
    
    // Apply score as confidence factor
    const confidenceFactor = score.total / 100;
    const expectedReturn = adjustedReturn * confidenceFactor;
    
    return {
      gainPercent: Math.round(expectedReturn * 100) / 100,
      gainUsd: Math.round(capital * (expectedReturn / 100) * 100) / 100,
    };
  }

  private estimateAprFromPool(pool: Pool): number {
    if (pool.apr) return pool.apr;
    if (pool.tvl === 0) return 0;

    // Only estimate if we know the actual fee tier
    if (!pool.feeTier || pool.feeTier <= 0) return 0;

    const dailyFees = pool.volume24h * pool.feeTier;
    return (dailyFees * 365) / pool.tvl * 100;
  }

  private generateEntryConditions(pool: Pool, score: Score, mode: Mode): string[] {
    const conditions: string[] = [];
    
    // Price stability
    conditions.push('Preco atual proximo da media de 24h');
    
    // Volume condition
    const minVolume = mode === 'DEFENSIVE' ? pool.volume24h * 0.8 : pool.volume24h * 0.5;
    conditions.push('Volume 24h acima de $' + this.formatNumber(minVolume));
    
    // TVL condition
    conditions.push('TVL mantido acima de $' + this.formatNumber(pool.tvl * 0.9));
    
    // Mode-specific
    if (mode === 'AGGRESSIVE') {
      conditions.push('Momentum positivo confirmado (preco subindo)');
    } else if (mode === 'DEFENSIVE') {
      conditions.push('Volatilidade baixa nas ultimas 24h');
    }
    
    return conditions;
  }

  private generateExitConditions(pool: Pool, score: Score, mode: Mode): string[] {
    const conditions: string[] = [];
    
    // Stop loss
    const stopLoss = mode === 'AGGRESSIVE' ? 15 : mode === 'NORMAL' ? 10 : 5;
    conditions.push('Queda de ' + stopLoss + '% no valor da posicao');
    
    // TVL drop
    conditions.push('Queda de 30% ou mais no TVL da pool');
    
    // Volume death
    conditions.push('Volume diario abaixo de $' + this.formatNumber(config.thresholds.minVolume24h));
    
    // Take profit (for aggressive)
    if (mode === 'AGGRESSIVE') {
      conditions.push('Atingir ganho de 20%+ (take profit parcial)');
    }
    
    // Time-based (for all)
    conditions.push('Reavaliar posicao apos 7 dias');
    
    return conditions;
  }

  private identifyMainRisks(pool: Pool, score: Score): string[] {
    const risks: string[] = [];
    
    // Volatility risk
    if (score.breakdown.risk.volatilityPenalty > 10) {
      risks.push('Alta volatilidade - risco de Impermanent Loss elevado');
    }
    
    // Liquidity risk
    if (pool.tvl < 500000) {
      risks.push('Liquidez moderada - slippage pode ser significativo');
    }
    
    // Volume risk
    if (pool.volume24h < pool.tvl * 0.01) {
      risks.push('Baixo volume relativo - pode indicar falta de interesse');
    }
    
    // New pool risk (if we had age data)
    if (score.breakdown.health.ageScore < 30) {
      risks.push('Pool relativamente nova - historico limitado');
    }
    
    // Default risk
    if (risks.length === 0) {
      risks.push('Riscos gerais de mercado DeFi (smart contract, hack, etc)');
    }
    
    return risks;
  }

  private generateCommentary(
    pool: Pool,
    score: Score,
    mode: Mode,
    probability: number,
    gainPercent: number,
    risks: string[]
  ): string {
    const poolName = pool.token0.symbol + '/' + pool.token1.symbol;
    const modeText = mode === 'DEFENSIVE' ? 'defensiva' : mode === 'NORMAL' ? 'equilibrada' : 'agressiva';
    
    let commentary = '';
    
    // Opening
    commentary += 'Pool ' + poolName + ' no protocolo ' + pool.protocol + ' (' + pool.chain + '). ';
    
    // Score summary
    commentary += 'Score institucional: ' + score.total.toFixed(1) + '/100. ';
    
    // Strength points
    if (score.health >= 25) {
      commentary += 'Destaque positivo: boa saude e estabilidade da pool. ';
    }
    if (score.return >= 20) {
      commentary += 'Retorno potencial atrativo com base no volume e fees. ';
    }
    
    // Mode recommendation
    commentary += 'Estrategia recomendada: ' + modeText + '. ';
    
    // Probability and gain
    commentary += 'Probabilidade de cenario favoravel: ' + probability + '%. ';
    commentary += 'Retorno estimado (7 dias): ' + gainPercent.toFixed(2) + '%. ';
    
    // Risk warning
    if (risks.length > 0) {
      commentary += 'Atencao: ' + risks[0] + '. ';
    }
    
    // Disclaimer
    commentary += 'Esta analise e baseada em dados historicos e nao constitui garantia de resultados futuros.';
    
    return commentary;
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toFixed(0);
  }
}

export const recommendationService = new RecommendationService();
