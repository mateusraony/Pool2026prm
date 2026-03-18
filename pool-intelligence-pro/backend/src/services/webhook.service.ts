/**
 * Webhook Service — ETAPA 14
 * Envia notificações de alertas para integrações externas:
 * Discord Embeds, Slack Block Kit, Webhook Genérico HTTP POST.
 */

import { logService } from './log.service.js';
import { AlertEvent } from '../types/index.js';

export type IntegrationType = 'discord' | 'slack' | 'webhook';

export interface Integration {
  id: string;
  type: IntegrationType;
  name: string;
  url: string;
  enabled: boolean;
  events: string[]; // AlertType list, empty = all events
  createdAt: string;
  lastTriggeredAt?: string;
  successCount: number;
  errorCount: number;
  lastError?: string;
}

// ============================================================
// DISCORD EMBED FORMATTER
// ============================================================

const ALERT_COLORS: Record<string, number> = {
  OUT_OF_RANGE:     0xEF4444, // red
  NEAR_RANGE_EXIT:  0xF59E0B, // amber
  LIQUIDITY_FLIGHT: 0xEF4444, // red
  VOLATILITY_SPIKE: 0xF97316, // orange
  PRICE_ABOVE:      0x10B981, // green
  PRICE_BELOW:      0xEF4444, // red
  NEW_RECOMMENDATION: 0x3B82F6, // blue
  RSI_ABOVE:        0xF59E0B,
  RSI_BELOW:        0xF59E0B,
  MACD_CROSS_UP:    0x10B981,
  MACD_CROSS_DOWN:  0xEF4444,
  VOLUME_DROP:      0xF97316,
};

function formatDiscordPayload(event: AlertEvent): object {
  const color = ALERT_COLORS[event.type] ?? 0x6B7280;
  const pool = event.pool;
  const pair = pool ? `${pool.token0?.symbol ?? '?'}/${pool.token1?.symbol ?? '?'}` : 'Sistema';
  const chain = pool?.chain ?? '';
  const protocol = pool?.protocol ?? '';

  const fields: object[] = [];

  if (pool) {
    fields.push(
      { name: 'Par', value: pair, inline: true },
      { name: 'Chain', value: chain || '—', inline: true },
      { name: 'Protocolo', value: protocol || '—', inline: true },
    );
    if (pool.tvl) fields.push({ name: 'TVL', value: `$${(pool.tvl / 1e6).toFixed(2)}M`, inline: true });
    if (pool.apr) fields.push({ name: 'APR', value: `${pool.apr.toFixed(1)}%`, inline: true });
  }

  if (event.data && typeof event.data === 'object') {
    for (const [key, val] of Object.entries(event.data)) {
      if (val != null && fields.length < 10) {
        fields.push({ name: key, value: String(val), inline: true });
      }
    }
  }

  return {
    embeds: [{
      title: `🔔 ${event.type.replace(/_/g, ' ')}`,
      description: event.message,
      color,
      fields,
      footer: { text: 'Pool Intelligence Pro' },
      timestamp: event.timestamp.toISOString(),
    }],
  };
}

// ============================================================
// SLACK BLOCK KIT FORMATTER
// ============================================================

function formatSlackPayload(event: AlertEvent): object {
  const pool = event.pool;
  const pair = pool ? `${pool.token0?.symbol ?? '?'}/${pool.token1?.symbol ?? '?'}` : 'Sistema';
  const emoji = event.type.includes('ABOVE') || event.type === 'NEW_RECOMMENDATION' ? ':green_circle:' :
                 event.type.includes('BELOW') || event.type === 'OUT_OF_RANGE' ? ':red_circle:' : ':orange_circle:';

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${event.type.replace(/_/g, ' ')}`, emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: event.message },
    },
  ];

  if (pool) {
    blocks.push({
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Par:*\n${pair}` },
        { type: 'mrkdwn', text: `*Chain:*\n${pool.chain ?? '—'}` },
        { type: 'mrkdwn', text: `*Protocolo:*\n${pool.protocol ?? '—'}` },
        { type: 'mrkdwn', text: `*TVL:*\n${pool.tvl ? `$${(pool.tvl / 1e6).toFixed(2)}M` : '—'}` },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [{ type: 'plain_text', text: `Pool Intelligence Pro • ${event.timestamp.toLocaleString('pt-BR')}` }],
  });

  return { blocks };
}

// ============================================================
// GENERIC WEBHOOK FORMATTER
// ============================================================

function formatGenericPayload(event: AlertEvent): object {
  return {
    source: 'pool-intelligence-pro',
    type: event.type,
    message: event.message,
    timestamp: event.timestamp.toISOString(),
    pool: event.pool ? {
      pair: `${event.pool.token0?.symbol}/${event.pool.token1?.symbol}`,
      chain: event.pool.chain,
      protocol: event.pool.protocol,
      address: event.pool.poolAddress,
      tvl: event.pool.tvl,
      apr: event.pool.apr,
    } : null,
    data: event.data,
  };
}

// ============================================================
// WEBHOOK SERVICE
// ============================================================

class WebhookService {
  private integrations: Map<string, Integration> = new Map();
  private readonly TIMEOUT_MS = 8000;

  setIntegrations(list: Integration[]): void {
    this.integrations.clear();
    for (const i of list) {
      this.integrations.set(i.id, i);
    }
  }

  getAll(): Integration[] {
    return Array.from(this.integrations.values());
  }

  upsert(integration: Integration): void {
    this.integrations.set(integration.id, integration);
  }

  delete(id: string): boolean {
    return this.integrations.delete(id);
  }

  /**
   * Dispatch an alert event to all enabled integrations that subscribe to it.
   */
  async dispatch(event: AlertEvent): Promise<void> {
    const enabled = Array.from(this.integrations.values()).filter(i => {
      if (!i.enabled) return false;
      if (i.events.length > 0 && !i.events.includes(event.type)) return false;
      return true;
    });

    await Promise.allSettled(enabled.map(i => this.sendToIntegration(i, event)));
  }

  /**
   * Test webhook connectivity (sends a test payload).
   */
  async test(integration: Integration): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
    const testEvent: AlertEvent = {
      type: 'NEW_RECOMMENDATION',
      message: '🧪 Teste de integração — Pool Intelligence Pro está conectado!',
      data: { test: true },
      timestamp: new Date(),
    };
    try {
      const payload = this.buildPayload(integration.type, testEvent);
      const res = await this.postWithTimeout(integration.url, payload);
      return { ok: res.ok, statusCode: res.status };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { ok: false, error };
    }
  }

  private async sendToIntegration(integration: Integration, event: AlertEvent): Promise<void> {
    try {
      const payload = this.buildPayload(integration.type, event);
      const res = await this.postWithTimeout(integration.url, payload);
      integration.lastTriggeredAt = new Date().toISOString();
      if (res.ok) {
        integration.successCount++;
        logService.info('SYSTEM', `Webhook ${integration.type} sent`, { name: integration.name, status: res.status });
      } else {
        integration.errorCount++;
        integration.lastError = `HTTP ${res.status}`;
        logService.warn('SYSTEM', `Webhook ${integration.type} failed`, { name: integration.name, status: res.status });
      }
    } catch (e) {
      integration.errorCount++;
      integration.lastError = e instanceof Error ? e.message : String(e);
      logService.error('SYSTEM', `Webhook ${integration.type} error`, { name: integration.name, error: integration.lastError });
    }
  }

  private buildPayload(type: IntegrationType, event: AlertEvent): object {
    if (type === 'discord') return formatDiscordPayload(event);
    if (type === 'slack') return formatSlackPayload(event);
    return formatGenericPayload(event);
  }

  private async postWithTimeout(url: string, payload: object): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.TIMEOUT_MS);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export const webhookService = new WebhookService();
