/**
 * event-bus.service.ts — Fase 5: Event bus central do sistema
 *
 * Único ponto de saída de eventos. Serviços emitem eventos; o bus os roteia
 * para Telegram, WebSocket e Webhook via listeners registrados.
 *
 * Regras:
 * - emit() usa Promise.allSettled para chamar todos os listeners em paralelo
 * - Erros em listeners individuais são logados (não relançados)
 * - Sem dependência circular: este módulo NÃO importa Telegram/WebSocket/Alert
 */

import { logService } from './log.service.js';

// ============================================
// TIPOS
// ============================================

export type BusEventType =
  | 'POOLS_UPDATED'
  | 'ALERT_FIRED'
  | 'RECOMMENDATION_UPDATED'
  | 'HEALTH_DEGRADED'
  | 'RANGE_TRIGGERED'
  | 'DAILY_REPORT';

export interface BusEvent<T = unknown> {
  type: BusEventType;
  payload: T;
  timestamp: Date;
}

export type BusListener<T = unknown> = (event: BusEvent<T>) => void | Promise<void>;

// ============================================
// EVENT BUS SERVICE
// ============================================

class EventBusService {
  private listeners: Map<BusEventType, BusListener[]> = new Map();

  /**
   * Registra um listener para um tipo de evento.
   */
  on<T>(type: BusEventType, listener: BusListener<T>): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener as BusListener);
    this.listeners.set(type, existing);
  }

  /**
   * Remove um listener previamente registrado.
   */
  off(type: BusEventType, listener: BusListener): void {
    const existing = this.listeners.get(type);
    if (!existing) return;
    const updated = existing.filter(l => l !== listener);
    this.listeners.set(type, updated);
  }

  /**
   * Emite um evento — notifica todos os listeners do tipo em paralelo.
   * Erros em listeners individuais são logados mas não interrompem os demais.
   */
  async emit<T>(type: BusEventType, payload: T): Promise<void> {
    const handlers = this.listeners.get(type);
    if (!handlers || handlers.length === 0) return;

    const event: BusEvent<T> = { type, payload, timestamp: new Date() };

    const results = await Promise.allSettled(
      handlers.map(handler => Promise.resolve(handler(event as BusEvent<unknown>)))
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejected.length > 0) {
      logService.warn('SYSTEM', `${rejected.length} event handler(s) failed for ${type}`, {
        errors: rejected.map(r => String(r.reason)),
      });
    }
  }
}

export const eventBus = new EventBusService();
