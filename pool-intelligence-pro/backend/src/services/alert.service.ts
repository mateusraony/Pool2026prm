import { AlertType, AlertEvent, Pool } from '../types/index.js';
import { logService } from './log.service.js';
import { config } from '../config/index.js';
import { webhookService } from './webhook.service.js'; // mantido para uso futuro via event bus listener
import { eventBus } from './event-bus.service.js';
import { memoryStore } from './memory-store.service.js';
import { getPrisma } from '../routes/prisma.js';
import { Prisma } from '@prisma/client';

export type RangeZoneStatus = 'SAFE' | 'DANGER_ZONE' | 'OUT_OF_RANGE';

/**
 * Determina a zona do preço em relação ao range configurado.
 * Inspirado no AutoRange.sol do Revert Finance (lowerTickLimit/upperTickLimit buffer).
 * Buffer = 15% da largura do range de cada lado.
 */
export function getRangeZone(
  currentPrice: number,
  lower: number,
  upper: number
): { status: RangeZoneStatus; distToEdgePct: number } {
  if (lower <= 0 || upper <= 0 || lower >= upper || currentPrice <= 0) {
    return { status: 'SAFE', distToEdgePct: 100 };
  }

  if (currentPrice < lower || currentPrice > upper) {
    return { status: 'OUT_OF_RANGE', distToEdgePct: 0 };
  }

  const rangeWidth = upper - lower;
  const buffer = rangeWidth * 0.15; // 15% de cada borda
  const distLower = currentPrice - lower;
  const distUpper = upper - currentPrice;
  const minDist = Math.min(distLower, distUpper);
  const distToEdgePct = (minDist / rangeWidth) * 100;

  if (minDist < buffer) {
    return { status: 'DANGER_ZONE', distToEdgePct: Math.round(distToEdgePct * 10) / 10 };
  }
  return { status: 'SAFE', distToEdgePct: Math.round(distToEdgePct * 10) / 10 };
}

/**
 * Verifica se deve enviar alerta de saída de range considerando janela de confirmação.
 * Previne alertas por wicks/spikes temporários (TWAP anti-wick).
 * Inspirado no AutoExit.sol do Revert Finance (validação TWAP antes de execução).
 *
 * @param poolId - ID único da pool
 * @param confirmWindowMs - janela de confirmação em ms (120000=2min, 300000=5min, etc.)
 * @returns true se deve alertar, false se ainda está no window ou é wick
 */
export function shouldSendRangeExitAlert(
  poolId: string,
  confirmWindowMs: number = 300_000 // 5 minutos padrão
): boolean {
  const outSince = memoryStore.getPriceOutTimestamp(poolId);
  const now = Date.now();

  if (!outSince) {
    memoryStore.setPriceOutTimestamp(poolId, now);
    logService.info('ALERT', 'Range exit detectado — aguardando confirmação anti-wick', {
      poolId,
      confirmWindowMin: Math.round(confirmWindowMs / 60000),
    });
    return false;
  }

  const elapsed = now - outSince;
  if (elapsed >= confirmWindowMs) {
    memoryStore.clearPriceOutTimestamp(poolId);
    logService.info('ALERT', 'Range exit confirmado — enviando alerta', { poolId, elapsedMin: Math.round(elapsed / 60000) });
    return true;
  }

  logService.info('ALERT', 'Range exit aguardando confirmação', {
    poolId,
    elapsedSec: Math.round(elapsed / 1000),
    remainingSec: Math.round((confirmWindowMs - elapsed) / 1000),
  });
  return false;
}

/**
 * Reseta o timestamp de saída quando o preço volta ao range (descarta wick).
 */
export function onPriceReturnedToRange(poolId: string): void {
  if (memoryStore.getPriceOutTimestamp(poolId)) {
    memoryStore.clearPriceOutTimestamp(poolId);
    logService.info('ALERT', 'Preço retornou ao range — wick descartado', { poolId });
  }
}

interface AlertRule {
  type: AlertType;
  poolId?: string;
  value?: number;
  condition?: Record<string, unknown>;
  lastTriggered?: Date;
  triggerCount: number;
}

interface AlertConfig {
  cooldownMinutes: number;
  maxAlertsPerHour: number;
  dedupeWindowMinutes: number;
}

export class AlertService {
  private rules: Map<string, AlertRule> = new Map();
  private recentAlerts: AlertEvent[] = [];
  private alertConfig: AlertConfig;

  constructor() {
    this.alertConfig = {
      cooldownMinutes: 60,
      maxAlertsPerHour: 30,
      dedupeWindowMinutes: 30,
    };
  }

  setConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  getAlertConfig(): AlertConfig {
    return { ...this.alertConfig };
  }

  // Add or update alert rule
  addRule(id: string, rule: Omit<AlertRule, 'triggerCount'>): void {
    this.rules.set(id, { ...rule, triggerCount: 0 });
    this.saveToDb();
  }

  hasRule(id: string): boolean {
    return this.rules.has(id);
  }

  removeRule(id: string): void {
    this.rules.delete(id);
    this.saveToDb();
  }

  async loadFromDb(): Promise<void> {
    try {
      const prisma = getPrisma();
      const config = await prisma.appConfig.findUnique({ where: { key: 'alertRules' } });
      if (config?.value && Array.isArray(config.value)) {
        for (const entry of (config.value as unknown) as Array<{ id: string; rule: AlertRule }>) {
          if (entry?.id && entry?.rule) {
            this.rules.set(entry.id, { ...entry.rule, triggerCount: entry.rule.triggerCount ?? 0 });
          }
        }
        logService.info('SYSTEM', `Loaded ${this.rules.size} alert rules from DB`);
      }
    } catch (err) {
      logService.warn('SYSTEM', 'Could not load alert rules from DB', { error: (err as Error)?.message });
    }
  }

  private async saveToDb(): Promise<void> {
    try {
      const prisma = getPrisma();
      const data = Array.from(this.rules.entries()).map(([id, rule]) => ({ id, rule }));
      await prisma.appConfig.upsert({
        where: { key: 'alertRules' },
        update: { value: data as unknown as Prisma.InputJsonValue },
        create: { key: 'alertRules', value: data as unknown as Prisma.InputJsonValue },
      });
    } catch (err) {
      logService.warn('SYSTEM', 'Could not save alert rules to DB', { error: (err as Error)?.message });
    }
  }

  // Check all rules against current data
  checkAlerts(
    pools: Map<string, { pool: Pool; previousPool?: Pool }>
  ): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const [ruleId, rule] of this.rules) {
      // Skip if in cooldown
      if (this.isInCooldown(rule)) {
        continue;
      }

      // Check rate limit
      if (this.isRateLimited()) {
        logService.warn('ALERT', 'Rate limit reached, skipping alerts');
        break;
      }

      const event = this.checkRule(rule, pools);
      if (event) {
        // Check for duplicate
        if (!this.isDuplicate(event)) {
          events.push(event);
          this.recordTrigger(ruleId);
          this.recentAlerts.push(event);
        }
      }
    }

    // Cleanup old alerts
    this.cleanupRecentAlerts();

    // Emitir eventos via bus (fire and forget — webhooks e outros listeners são acionados pelo bus)
    if (events.length > 0) {
      for (const event of events) {
        eventBus.emit('ALERT_FIRED', event).catch(err => {
          logService.warn('ALERT', 'Event bus emit failed', { err });
        });
      }
    }

    return events;
  }

  private checkRule(
    rule: AlertRule,
    pools: Map<string, { pool: Pool; previousPool?: Pool }>
  ): AlertEvent | null {
    // Global alerts (not pool-specific)
    if (!rule.poolId) {
      return this.checkGlobalRule(rule, pools);
    }

    // Pool-specific alert
    const poolData = pools.get(rule.poolId);
    if (!poolData) return null;

    const { pool, previousPool } = poolData;

    switch (rule.type) {
      case 'PRICE_ABOVE':
        if (rule.value && pool.price && pool.price > rule.value) {
          return this.createEvent(rule.type, pool, 
            'Preco de ' + pool.token0.symbol + '/' + pool.token1.symbol + ' ultrapassou $' + rule.value.toFixed(2),
            { currentPrice: pool.price, threshold: rule.value }
          );
        }
        break;

      case 'PRICE_BELOW':
        if (rule.value && pool.price && pool.price < rule.value) {
          return this.createEvent(rule.type, pool,
            'Preco de ' + pool.token0.symbol + '/' + pool.token1.symbol + ' caiu abaixo de $' + rule.value.toFixed(2),
            { currentPrice: pool.price, threshold: rule.value }
          );
        }
        break;

      case 'VOLUME_DROP': {
        const dropThreshold = rule.value != null && rule.value > 0 ? 1 - (rule.value / 100) : 0.5;
        if (previousPool && previousPool.volume24h > 0 && pool.volume24h < previousPool.volume24h * dropThreshold) {
          return this.createEvent(rule.type, pool,
            'Queda de volume em ' + pool.token0.symbol + '/' + pool.token1.symbol + ': -' +
            ((1 - pool.volume24h / previousPool.volume24h) * 100).toFixed(0) + '%',
            { currentVolume: pool.volume24h, previousVolume: previousPool.volume24h }
          );
        }
        break;
      }

      case 'LIQUIDITY_FLIGHT': {
        const flightThreshold = rule.value != null && rule.value > 0 ? 1 - (rule.value / 100) : 0.7;
        if (previousPool && previousPool.tvl > 0 && pool.tvl < previousPool.tvl * flightThreshold) {
          return this.createEvent(rule.type, pool,
            'ALERTA: Fuga de liquidez em ' + pool.token0.symbol + '/' + pool.token1.symbol + ': -' +
            ((1 - pool.tvl / previousPool.tvl) * 100).toFixed(0) + '%',
            { currentTvl: pool.tvl, previousTvl: previousPool.tvl }
          );
        }
        break;
      }

      case 'VOLATILITY_SPIKE':
        if (previousPool?.volatilityAnn && pool.volatilityAnn) {
          const volChange = ((pool.volatilityAnn - previousPool.volatilityAnn) / previousPool.volatilityAnn) * 100;
          // Trigger if volatility increased by 50%+ (e.g. from 10% to 15%+)
          if (volChange > (rule.value ?? 50)) {
            return this.createEvent(rule.type, pool,
              'Pico de volatilidade em ' + pool.token0.symbol + '/' + pool.token1.symbol +
              ': +' + volChange.toFixed(0) + '% (de ' + (previousPool.volatilityAnn * 100).toFixed(1) +
              '% para ' + (pool.volatilityAnn * 100).toFixed(1) + '%)',
              { currentVolatility: pool.volatilityAnn, previousVolatility: previousPool.volatilityAnn, changePercent: volChange }
            );
          }
        }
        break;

      case 'OUT_OF_RANGE': {
        const rangeLower = rule.condition?.rangeLower as number | undefined;
        const rangeUpper = rule.condition?.rangeUpper as number | undefined;
        if (rangeLower != null && rangeUpper != null && pool.price != null) {
          if (pool.price < rangeLower || pool.price > rangeUpper) {
            return this.createEvent(rule.type, pool,
              'Preço de ' + pool.token0.symbol + '/' + pool.token1.symbol +
              ' saiu do range ($' + rangeLower.toFixed(4) + ' - $' + rangeUpper.toFixed(4) + ')',
              { currentPrice: pool.price, rangeLower, rangeUpper }
            );
          }
        }
        break;
      }

      case 'NEAR_RANGE_EXIT': {
        const rangeLower = rule.condition?.rangeLower as number | undefined;
        const rangeUpper = rule.condition?.rangeUpper as number | undefined;
        const proximityPct = rule.value ?? 5; // default: alertar quando a 5% do limite
        if (rangeLower != null && rangeUpper != null && pool.price != null && pool.price > 0) {
          const distToLower = ((pool.price - rangeLower) / pool.price) * 100;
          const distToUpper = ((rangeUpper - pool.price) / pool.price) * 100;
          if (distToLower < proximityPct || distToUpper < proximityPct) {
            const nearLower = distToLower < distToUpper;
            const dist = nearLower ? distToLower : distToUpper;
            return this.createEvent(rule.type, pool,
              'Preço de ' + pool.token0.symbol + '/' + pool.token1.symbol +
              ' a ' + dist.toFixed(1) + '% do limite ' + (nearLower ? 'inferior' : 'superior') + ' do range',
              { currentPrice: pool.price, rangeLower, rangeUpper, distToLower, distToUpper }
            );
          }
        }
        break;
      }
    }

    return null;
  }

  private checkGlobalRule(
    rule: AlertRule,
    pools: Map<string, { pool: Pool; previousPool?: Pool }>
  ): AlertEvent | null {
    // NEW_RECOMMENDATION: verificado via memoryStore (não depende de pools individuais)
    if (rule.type === 'NEW_RECOMMENDATION') {
      const minScore = rule.value ?? 70;
      const recs = memoryStore.getRecommendations();
      if (recs && recs.length > 0) {
        const topRec = recs.find(r => r.score?.total != null && r.score.total >= minScore);
        if (topRec) {
          return this.createEvent(rule.type, topRec.pool,
            'Nova recomendação de alta qualidade: ' + topRec.pool.token0.symbol + '/' +
            topRec.pool.token1.symbol + ' (score: ' + topRec.score.total + ')',
            { score: topRec.score.total, poolId: topRec.pool.externalId, rank: topRec.rank }
          );
        }
      }
      return null;
    }

    // Check for any pool matching condition
    for (const [, { pool, previousPool }] of pools) {
      switch (rule.type) {
        case 'LIQUIDITY_FLIGHT':
          if (previousPool && pool.tvl < previousPool.tvl * 0.5) {
            return this.createEvent(rule.type, pool,
              'ALERTA CRITICO: Fuga massiva de liquidez em ' + pool.token0.symbol + '/' + pool.token1.symbol,
              { currentTvl: pool.tvl, previousTvl: previousPool.tvl }
            );
          }
          break;
      }
    }

    return null;
  }

  private createEvent(
    type: AlertType,
    pool: Pool,
    message: string,
    data: Record<string, unknown>
  ): AlertEvent {
    return {
      type,
      pool,
      message,
      data,
      timestamp: new Date(),
    };
  }

  private isInCooldown(rule: AlertRule): boolean {
    if (!rule.lastTriggered) return false;
    
    const cooldownMs = this.alertConfig.cooldownMinutes * 60 * 1000;
    return Date.now() - rule.lastTriggered.getTime() < cooldownMs;
  }

  private isRateLimited(): boolean {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentCount = this.recentAlerts.filter(a => 
      a.timestamp.getTime() > oneHourAgo
    ).length;
    
    return recentCount >= this.alertConfig.maxAlertsPerHour;
  }

  private isDuplicate(event: AlertEvent): boolean {
    const windowMs = this.alertConfig.dedupeWindowMinutes * 60 * 1000;
    const cutoff = Date.now() - windowMs;
    
    return this.recentAlerts.some(a =>
      a.type === event.type &&
      a.pool?.externalId === event.pool?.externalId &&
      a.timestamp.getTime() > cutoff
    );
  }

  private recordTrigger(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.lastTriggered = new Date();
      rule.triggerCount++;
    }
  }

  private cleanupRecentAlerts(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    this.recentAlerts = this.recentAlerts.filter(a => 
      a.timestamp.getTime() > oneHourAgo
    );
  }

  // Get alert stats
  getStats(): { rulesCount: number; recentAlertsCount: number; triggersToday: number } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let triggersToday = 0;
    for (const rule of this.rules.values()) {
      if (rule.lastTriggered && rule.lastTriggered >= today) {
        triggersToday += rule.triggerCount;
      }
    }

    return {
      rulesCount: this.rules.size,
      recentAlertsCount: this.recentAlerts.length,
      triggersToday,
    };
  }

  // Get all rules
  getRules(): { id: string; rule: AlertRule }[] {
    const rules: { id: string; rule: AlertRule }[] = [];
    for (const [id, rule] of this.rules) {
      rules.push({ id, rule });
    }
    return rules;
  }

  // Get recent alerts
  getRecentAlerts(): AlertEvent[] {
    return this.recentAlerts;
  }
}

export const alertService = new AlertService();
