/**
 * decision-log.service.ts — Fase 6: Diário de decisão e replay
 *
 * Log persistente em memória (últimas 200 entradas) das decisões do sistema.
 * Auto-integra com o eventBus para registrar eventos automaticamente.
 */
import { logService } from './log.service.js';
import { eventBus } from './event-bus.service.js';

export type DecisionType =
  | 'RECOMMENDATION'
  | 'ALERT_FIRED'
  | 'RANGE_TRIGGERED'
  | 'POOLS_UPDATED'
  | 'HEALTH_DEGRADED'
  | 'MANUAL';

export interface DecisionEntry {
  id: string;
  timestamp: Date;
  type: DecisionType;
  poolId?: string;
  poolName?: string;
  summary: string;
  data: Record<string, unknown>;
}

class DecisionLogService {
  private entries: DecisionEntry[] = [];
  private readonly MAX_ENTRIES = 200;

  constructor() {
    this.registerEventListeners();
  }

  private registerEventListeners(): void {
    // Auto-log eventos do event bus
    eventBus.on('RECOMMENDATION_UPDATED', async (event) => {
      const payload = event.payload as {
        recommendation: {
          pool: {
            externalId: string;
            token0: { symbol: string };
            token1: { symbol: string };
          };
          score: { total: number };
          mode: string;
        };
        poolId: string;
      };
      const rec = payload.recommendation;
      this.addEntry({
        type: 'RECOMMENDATION',
        poolId: payload.poolId,
        poolName: `${rec.pool.token0.symbol}/${rec.pool.token1.symbol}`,
        summary: `Nova recomendação: ${rec.pool.token0.symbol}/${rec.pool.token1.symbol} — Score ${rec.score.total.toFixed(1)} — Modo ${rec.mode}`,
        data: { poolId: payload.poolId, score: rec.score.total, mode: rec.mode },
      });
    });

    eventBus.on('ALERT_FIRED', async (event) => {
      const alert = event.payload as {
        type: string;
        pool?: {
          externalId: string;
          token0: { symbol: string };
          token1: { symbol: string };
        };
        message: string;
      };
      this.addEntry({
        type: 'ALERT_FIRED',
        poolId: alert.pool?.externalId,
        poolName: alert.pool
          ? `${alert.pool.token0.symbol}/${alert.pool.token1.symbol}`
          : undefined,
        summary: `Alerta: ${alert.type} — ${alert.message}`,
        data: { alertType: alert.type, message: alert.message },
      });
    });

    eventBus.on('HEALTH_DEGRADED', async (event) => {
      const { message } = event.payload as { status: string; message: string };
      this.addEntry({
        type: 'HEALTH_DEGRADED',
        summary: `Saúde degradada: ${message}`,
        data: event.payload as Record<string, unknown>,
      });
    });
  }

  addEntry(entry: Omit<DecisionEntry, 'id' | 'timestamp'>): DecisionEntry {
    const full: DecisionEntry = {
      ...entry,
      id: `dec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date(),
    };
    this.entries.unshift(full); // mais recentes primeiro
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries = this.entries.slice(0, this.MAX_ENTRIES);
    }
    logService.info('SYSTEM', 'Decision logged', { type: full.type, summary: full.summary });
    return full;
  }

  getEntries(limit = 50, type?: DecisionType): DecisionEntry[] {
    let result = this.entries;
    if (type) result = result.filter(e => e.type === type);
    return result.slice(0, limit);
  }

  getStats(): { total: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    for (const e of this.entries) {
      byType[e.type] = (byType[e.type] ?? 0) + 1;
    }
    return { total: this.entries.length, byType };
  }
}

export const decisionLogService = new DecisionLogService();
