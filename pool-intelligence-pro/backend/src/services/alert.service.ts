import { AlertType, AlertEvent, Pool } from '../types/index.js';
import { logService } from './log.service.js';
import { config } from '../config/index.js';

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
      maxAlertsPerHour: 10,
      dedupeWindowMinutes: 30,
    };
  }

  setConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  // Add or update alert rule
  addRule(id: string, rule: Omit<AlertRule, 'triggerCount'>): void {
    this.rules.set(id, { ...rule, triggerCount: 0 });
  }

  removeRule(id: string): void {
    this.rules.delete(id);
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

      case 'VOLUME_DROP':
        if (previousPool && pool.volume24h < previousPool.volume24h * 0.5) {
          return this.createEvent(rule.type, pool,
            'Queda de volume em ' + pool.token0.symbol + '/' + pool.token1.symbol + ': -' + 
            ((1 - pool.volume24h / previousPool.volume24h) * 100).toFixed(0) + '%',
            { currentVolume: pool.volume24h, previousVolume: previousPool.volume24h }
          );
        }
        break;

      case 'LIQUIDITY_FLIGHT':
        if (previousPool && pool.tvl < previousPool.tvl * 0.7) {
          return this.createEvent(rule.type, pool,
            'ALERTA: Fuga de liquidez em ' + pool.token0.symbol + '/' + pool.token1.symbol + ': -' +
            ((1 - pool.tvl / previousPool.tvl) * 100).toFixed(0) + '%',
            { currentTvl: pool.tvl, previousTvl: previousPool.tvl }
          );
        }
        break;

      case 'VOLATILITY_SPIKE':
        // Would need metrics data
        break;
    }

    return null;
  }

  private checkGlobalRule(
    rule: AlertRule,
    pools: Map<string, { pool: Pool; previousPool?: Pool }>
  ): AlertEvent | null {
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
}

export const alertService = new AlertService();
