/**
 * weight-optimizer.service.ts — Fase 6: Ajuste automático de pesos do score
 *
 * Ajusta os pesos de health/return/risk baseado no regime de mercado atual.
 * Em HIGH_VOLATILITY → maior peso em risk.
 * Em RANGING → maior peso em return.
 * Em TRENDING_* → maior peso em health.
 */
import { config } from '../config/index.js';
import { marketRegimeService } from './market-regime.service.js';
import { memoryStore } from './memory-store.service.js';
import { logService } from './log.service.js';
import type { Pool } from '../types/index.js';

export interface ScoreWeights {
  health: number;
  return: number;
  risk: number;
}

export interface WeightAdjustmentResult {
  before: ScoreWeights;
  after: ScoreWeights;
  reason: string;
  regime: string;
  adjustmentApplied: boolean;
}

class WeightOptimizerService {
  // Pesos atuais (inicializados dos defaults do config)
  private currentWeights: ScoreWeights = {
    health: config.scoreWeights.health,
    return: config.scoreWeights.return,
    risk: config.scoreWeights.risk,
  };

  private lastAdjustedAt?: Date;

  getCurrentWeights(): ScoreWeights {
    return { ...this.currentWeights };
  }

  /**
   * Ajusta pesos baseado no regime de mercado atual.
   * Chamado manualmente via API ou periodicamente.
   */
  autoAdjust(): WeightAdjustmentResult {
    const before = { ...this.currentWeights };
    const pools = memoryStore.getAllPools();

    if (pools.length === 0) {
      return {
        before,
        after: before,
        reason: 'Sem pools disponíveis para análise de regime.',
        regime: 'UNKNOWN',
        adjustmentApplied: false,
      };
    }

    // UnifiedPool é estruturalmente compatível com Pool nos campos usados pelo MarketRegimeService
    const conditions = marketRegimeService.getGlobalConditions(pools as unknown as Pool[]);
    const regime = conditions.globalRegime;

    // Delta de ajuste por regime (soma zero: redistribui entre os pesos)
    const deltas: Record<string, { health: number; return: number; risk: number }> = {
      HIGH_VOLATILITY: { health: 0,  return: -5, risk: +5 },
      TRENDING_UP:     { health: +5, return: -5, risk: 0  },
      TRENDING_DOWN:   { health: +5, return: -5, risk: 0  },
      RANGING:         { health: 0,  return: +5, risk: -5 },
      LOW_LIQUIDITY:   { health: +5, return: -5, risk: 0  },
      UNKNOWN:         { health: 0,  return: 0,  risk: 0  },
    };

    const delta = deltas[regime] ?? { health: 0, return: 0, risk: 0 };
    const isDeltaZero = delta.health === 0 && delta.return === 0 && delta.risk === 0;

    if (isDeltaZero) {
      return {
        before,
        after: before,
        reason: `Regime ${regime}: nenhum ajuste necessário.`,
        regime,
        adjustmentApplied: false,
      };
    }

    // Aplicar delta e clamp [15, 65]
    const clamp = (v: number) => Math.max(15, Math.min(65, v));
    const raw = {
      health: clamp(this.currentWeights.health + delta.health),
      return: clamp(this.currentWeights.return + delta.return),
      risk:   clamp(this.currentWeights.risk   + delta.risk),
    };

    // Normalizar para que somem 100
    const total = raw.health + raw.return + raw.risk;
    const after: ScoreWeights = {
      health: Math.round(raw.health / total * 100),
      return: Math.round(raw.return / total * 100),
      risk:   100 - Math.round(raw.health / total * 100) - Math.round(raw.return / total * 100),
    };

    this.currentWeights = after;
    this.lastAdjustedAt = new Date();

    const regimeMessages: Record<string, string> = {
      HIGH_VOLATILITY: 'Regime de alta volatilidade: aumentando peso de risco.',
      TRENDING_UP:     'Mercado em tendência de alta: aumentando peso de saúde.',
      TRENDING_DOWN:   'Mercado em tendência de baixa: aumentando peso de saúde.',
      RANGING:         'Mercado em range: aumentando peso de retorno.',
      LOW_LIQUIDITY:   'Baixa liquidez: aumentando peso de saúde.',
    };

    const reason = regimeMessages[regime] ?? `Ajuste para regime ${regime}.`;
    logService.info('SYSTEM', 'Score weights auto-adjusted', { regime, before, after });

    return { before, after, reason, regime, adjustmentApplied: true };
  }

  getLastAdjustedAt(): Date | undefined {
    return this.lastAdjustedAt;
  }

  /** Reseta para os pesos default do config */
  resetToDefaults(): ScoreWeights {
    this.currentWeights = {
      health: config.scoreWeights.health,
      return: config.scoreWeights.return,
      risk: config.scoreWeights.risk,
    };
    return { ...this.currentWeights };
  }
}

export const weightOptimizerService = new WeightOptimizerService();
