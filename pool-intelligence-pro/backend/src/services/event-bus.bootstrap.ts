/**
 * event-bus.bootstrap.ts — Fase 7: Amarração ponta a ponta do event bus
 *
 * Registra os listeners do event bus central. Deve ser chamado APENAS no
 * startup (index.ts), após todos os serviços terem sido inicializados.
 *
 * Regra: NÃO importar este arquivo em serviços — previne dependências circulares.
 *
 * Fluxo:
 *   alert.service  →  eventBus.emit('ALERT_FIRED', event)
 *                  →  [este bootstrap]
 *                  →  webhookService.dispatch(event)   (Discord, Slack, webhooks genéricos)
 *                  →  telegramBot.sendAlert(event)      (Telegram)
 */

import { eventBus, BusEvent } from './event-bus.service.js';
import { AlertEvent } from '../types/index.js';
import { logService } from './log.service.js';

// ===================================================
// LISTENERS
// ===================================================

function registerAlertFiredListener(): void {
  eventBus.on<AlertEvent>('ALERT_FIRED', async (event: BusEvent<AlertEvent>) => {
    const alertEvent = event.payload;

    // ── 1. Dispatch para webhook integrations (Discord, Slack, webhooks genéricos) ──
    try {
      const { webhookService } = await import('./webhook.service.js');
      await webhookService.dispatch(alertEvent);
    } catch (err) {
      logService.warn('ALERT', 'Webhook dispatch failed for ALERT_FIRED', {
        alertType: alertEvent.type,
        error: (err as Error)?.message ?? String(err),
      });
    }

    // ── 2. Dispatch para Telegram bot ──
    try {
      const { telegramBot } = await import('../bot/telegram.js');
      await telegramBot.sendAlert(alertEvent);
    } catch (err) {
      logService.warn('ALERT', 'Telegram sendAlert failed for ALERT_FIRED', {
        alertType: alertEvent.type,
        error: (err as Error)?.message ?? String(err),
      });
    }
  });
}

// ===================================================
// BOOTSTRAP ENTRY POINT
// ===================================================

/**
 * Registra todos os listeners do event bus.
 * Chamar uma vez no startup, após initPersistence().
 */
export function bootstrapEventBus(): void {
  registerAlertFiredListener();

  logService.info('SYSTEM' as const, 'Event bus bootstrap complete', {
    listeners: ['ALERT_FIRED → webhookService.dispatch + telegramBot.sendAlert'],
  });
}
