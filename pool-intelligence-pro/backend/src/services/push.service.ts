/**
 * Push Notifications Service — ETAPA 17
 * Web Push API com VAPID keys.
 * Armazena subscriptions em memória (persistidas via persistService).
 */

import webpush from 'web-push';
import { logService } from './log.service.js';
import { persistService } from './persist.service.js';

export interface PushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export interface PushSubscriptionRecord {
  id: string;
  subscription: PushSubscription;
  userAgent?: string;
  createdAt: string;
}

const PERSIST_KEY = 'push-subscriptions';

class PushService {
  private subscriptions: Map<string, PushSubscriptionRecord> = new Map();
  private initialized = false;

  /**
   * Inicializa VAPID keys. Prioridade:
   * 1. Variáveis de ambiente (VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY) — recomendado para produção
   * 2. Chaves salvas no DB via persistService (geradas uma vez e reutilizadas)
   * 3. Gera um par novo, salva no DB para boots futuros (primeiro boot sem env vars)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    const contactEmail = process.env.VAPID_EMAIL || 'mailto:admin@poolintelligence.pro';

    let publicKey = process.env.VAPID_PUBLIC_KEY;
    let privateKey = process.env.VAPID_PRIVATE_KEY;
    let source = 'env';

    if (publicKey && privateKey) {
      // Fonte 1: variáveis de ambiente
      source = 'env';
    } else {
      // Fonte 2: chaves salvas no DB
      const saved = persistService.get('vapid-keys') as { publicKey: string; privateKey: string } | undefined;
      if (saved?.publicKey && saved?.privateKey) {
        publicKey = saved.publicKey;
        privateKey = saved.privateKey;
        source = 'db';
      } else {
        // Fonte 3: gerar uma vez e salvar no DB
        const keys = webpush.generateVAPIDKeys();
        publicKey = keys.publicKey;
        privateKey = keys.privateKey;
        source = 'generated';
        // Salvar para reutilização em boots futuros
        persistService.set('vapid-keys', { publicKey, privateKey });
      }
      // Expor no env para que getPublicKey() e outros módulos vejam
      process.env.VAPID_PUBLIC_KEY = publicKey;
      process.env.VAPID_PRIVATE_KEY = privateKey;
    }

    webpush.setVapidDetails(contactEmail, publicKey!, privateKey!);

    if (source === 'env') {
      logService.info('SYSTEM', 'Push service initialized with env VAPID keys');
    } else if (source === 'db') {
      logService.info('SYSTEM', 'Push service initialized with persisted VAPID keys (from DB)');
    } else {
      logService.info('SYSTEM', 'Push service: generated stable VAPID keys and saved to DB (set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY to pin them)', {
        publicKey,
      });
    }

    this.initialized = true;
    await this.loadFromDb();
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? '';
  }

  async loadFromDb(): Promise<void> {
    try {
      const saved = persistService.get(PERSIST_KEY) as PushSubscriptionRecord[] | undefined;
      if (saved && Array.isArray(saved)) {
        for (const record of saved) {
          if (record?.id && record?.subscription?.endpoint) {
            this.subscriptions.set(record.id, record);
          }
        }
        logService.info('SYSTEM', `Loaded ${this.subscriptions.size} push subscriptions`);
      }
    } catch (err) {
      logService.warn('SYSTEM', 'Could not load push subscriptions', { error: (err as Error)?.message });
    }
  }

  private saveToDb(): void {
    try {
      persistService.set(PERSIST_KEY, Array.from(this.subscriptions.values()));
    } catch (err) {
      logService.warn('SYSTEM', 'Could not save push subscriptions', { error: (err as Error)?.message });
    }
  }

  subscribe(subscription: PushSubscription, userAgent?: string): PushSubscriptionRecord {
    // Deduplicate by endpoint
    const existing = Array.from(this.subscriptions.values()).find(
      s => s.subscription.endpoint === subscription.endpoint
    );
    if (existing) return existing;

    const id = `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const record: PushSubscriptionRecord = {
      id,
      subscription,
      userAgent,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(id, record);
    this.saveToDb();
    logService.info('SYSTEM', `Push subscription added: ${id}`);
    return record;
  }

  unsubscribe(endpoint: string): boolean {
    for (const [id, record] of this.subscriptions) {
      if (record.subscription.endpoint === endpoint) {
        this.subscriptions.delete(id);
        this.saveToDb();
        logService.info('SYSTEM', `Push subscription removed: ${id}`);
        return true;
      }
    }
    return false;
  }

  getStats(): { total: number } {
    return { total: this.subscriptions.size };
  }

  /**
   * Envia push notification para todos os subscribers.
   */
  async broadcast(payload: { title: string; body: string; icon?: string; url?: string; tag?: string }): Promise<{ sent: number; failed: number }> {
    if (!this.initialized) return { sent: 0, failed: 0 };

    const message = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    const toRemove: string[] = [];

    await Promise.allSettled(
      Array.from(this.subscriptions.entries()).map(async ([id, record]) => {
        try {
          await webpush.sendNotification(record.subscription as webpush.PushSubscription, message);
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            // Subscription expired
            toRemove.push(id);
          }
          failed++;
          logService.warn('SYSTEM', `Push failed for ${id}`, { error: (err as Error)?.message });
        }
      })
    );

    // Cleanup expired subscriptions
    for (const id of toRemove) {
      this.subscriptions.delete(id);
    }
    if (toRemove.length > 0) this.saveToDb();

    return { sent, failed };
  }
}

export const pushService = new PushService();
