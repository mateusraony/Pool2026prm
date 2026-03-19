import { Pool, MarketRegime, RegimeAnalysis, MarketConditions } from '../types/index.js';
import { logService } from './log.service.js';

export class MarketRegimeService {
  /**
   * Classifica o regime de mercado de uma pool individual.
   */
  classifyPool(pool: Pool): RegimeAnalysis {
    const volatilityAnn = pool.volatilityAnn ?? 0;
    const volPct = volatilityAnn * 100;

    // Proxy para priceChange24h usando volume/tvl + volatilidade
    const volumeTvlRatio = pool.tvl > 0 ? pool.volume24h / pool.tvl : 0;
    const priceChangePct = (volumeTvlRatio > 0.5 && volPct > 50) ? 0.06 : 0.02;

    const regime = this.classifyRegime(volatilityAnn, priceChangePct, volumeTvlRatio);
    const lpFriendly = this.isLpFriendly(regime);

    // Confidence baseada na qualidade dos dados disponíveis
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    if (pool.volatilityAnn != null && pool.volume24h > 0 && pool.tvl > 100000) {
      confidence = 'HIGH';
    } else if (pool.volume24h > 0 || pool.tvl > 0) {
      confidence = 'MEDIUM';
    } else {
      confidence = 'LOW';
    }

    const reason = this.getReasonText(regime, lpFriendly);

    return { regime, lpFriendly, confidence, reason };
  }

  /**
   * Agrega o regime global de uma lista de pools.
   */
  getGlobalConditions(pools: Pool[]): MarketConditions {
    if (pools.length === 0) {
      return {
        globalRegime: 'UNKNOWN',
        noOperateGlobal: false,
        poolCount: 0,
        highRiskCount: 0,
        updatedAt: new Date(),
      };
    }

    const regimeCounts: Record<MarketRegime, number> = {
      RANGING: 0,
      TRENDING_UP: 0,
      TRENDING_DOWN: 0,
      HIGH_VOLATILITY: 0,
      LOW_LIQUIDITY: 0,
      UNKNOWN: 0,
    };

    let highRiskCount = 0;

    for (const pool of pools) {
      try {
        const analysis = this.classifyPool(pool);
        regimeCounts[analysis.regime]++;

        if (
          analysis.regime === 'HIGH_VOLATILITY' ||
          analysis.regime === 'TRENDING_UP' ||
          analysis.regime === 'TRENDING_DOWN'
        ) {
          highRiskCount++;
        }
      } catch (err) {
        logService.warn('SYSTEM', 'MarketRegimeService: error classifying pool', { err, poolId: (pool as { externalId?: string }).externalId });
        regimeCounts['UNKNOWN']++;
      }
    }

    // Regime predominante: o mais frequente
    const globalRegime = (Object.entries(regimeCounts) as [MarketRegime, number][])
      .reduce((best, [regime, count]) => (count > best[1] ? [regime, count] : best), ['UNKNOWN' as MarketRegime, -1])[0];

    // noOperateGlobal: 70%+ das pools em regime ruim OU regime global é HIGH_VOLATILITY
    const highRiskRatio = pools.length > 0 ? highRiskCount / pools.length : 0;
    const noOperateGlobal = highRiskRatio > 0.7 || globalRegime === 'HIGH_VOLATILITY';

    let noOperateReason: string | undefined;
    if (noOperateGlobal) {
      if (globalRegime === 'HIGH_VOLATILITY') {
        noOperateReason = `Mercado em alta volatilidade (${Math.round(highRiskRatio * 100)}% das pools em regime de risco)`;
      } else {
        noOperateReason = `${Math.round(highRiskRatio * 100)}% das pools estao em regime desfavoravel para LP (${globalRegime})`;
      }
    }

    return {
      globalRegime,
      noOperateGlobal,
      noOperateReason,
      poolCount: pools.length,
      highRiskCount,
      updatedAt: new Date(),
    };
  }

  /**
   * Determina o regime com base em volatilidade, variação de preço e ratio volume/tvl.
   * Inputs:
   *   volatilityAnn — volatilidade anualizada em decimal (ex: 0.8 = 80%)
   *   priceChangePct — variação de preço em decimal (ex: 0.06 = 6%)
   *   volumeTvlRatio — volume24h / tvl
   */
  private classifyRegime(
    volatilityAnn: number,
    priceChangePct: number,
    volumeTvlRatio: number,
  ): MarketRegime {
    const volPct = volatilityAnn * 100;

    // Prioridade 1: liquidez muito baixa
    if (volumeTvlRatio < 0.001) return 'LOW_LIQUIDITY';

    // Prioridade 2: volatilidade extrema (>= 80%)
    if (volPct >= 80) return 'HIGH_VOLATILITY';

    // Prioridade 3: tendência de alta (>5% de variação positiva)
    if (priceChangePct > 0.05) return 'TRENDING_UP';

    // Prioridade 4: tendência de queda (<-5% de variação negativa)
    if (priceChangePct < -0.05) return 'TRENDING_DOWN';

    // Prioridade 5: volatilidade moderada (30% a 80%)
    if (volPct >= 30 && volPct < 80) return 'HIGH_VOLATILITY';

    // Default: mercado lateral (favorável para LP)
    return 'RANGING';
  }

  /**
   * Determina se o regime é favorável para fornecer liquidez.
   */
  private isLpFriendly(regime: MarketRegime): boolean {
    return regime === 'RANGING';
  }

  /**
   * Gera texto descritivo do regime para exibição.
   */
  private getReasonText(regime: MarketRegime, lpFriendly: boolean): string {
    const descriptions: Record<MarketRegime, string> = {
      RANGING: 'Mercado lateral com baixa volatilidade — condições ideais para LP',
      TRENDING_UP: 'Tendência de alta detectada — risco elevado de Impermanent Loss',
      TRENDING_DOWN: 'Tendência de queda detectada — risco elevado de Impermanent Loss',
      HIGH_VOLATILITY: 'Alta volatilidade — range pode ser ultrapassado rapidamente',
      LOW_LIQUIDITY: 'Liquidez insuficiente — volume muito baixo em relação ao TVL',
      UNKNOWN: 'Dados insuficientes para classificar o regime de mercado',
    };
    const suffix = lpFriendly ? '' : ' — considere aguardar melhores condições';
    return descriptions[regime] + suffix;
  }
}

export const marketRegimeService = new MarketRegimeService();
