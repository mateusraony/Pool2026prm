/**
 * Persistence service using PostgreSQL (via Prisma).
 * Stores runtime settings (Telegram, notifications, risk config) in the
 * AppConfig table as key-value JSON pairs.
 *
 * Falls back to in-memory cache so the app works even if DB is temporarily unavailable.
 * On startup, loads all config from DB. On save, writes to DB immediately.
 */

import { PrismaClient } from '@prisma/client';
import { logService } from './log.service.js';

export interface PersistedData {
  telegram: {
    botToken: string;
    chatId: string;
  };
  notifications: {
    appUrl: string;
    notifications: {
      rangeExit: boolean;
      nearRangeExit: boolean;
      dailyReport: boolean;
      newRecommendation: boolean;
      priceAlerts: boolean;
      systemAlerts: boolean;
    };
    dailyReportHour: number;
    dailyReportMinute: number;
    tokenFilters: string[];
  };
  riskConfig: {
    totalBanca: number;
    profile: string;
    maxPerPool: number;
    maxPerNetwork: number;
    maxVolatile: number;
    allowedNetworks: string[];
    allowedDexs: string[];
    allowedTokens: string[];
    excludeMemecoins: boolean;
  } | null;
}

class PersistService {
  private prisma: PrismaClient | null = null;
  private cache: Record<string, any> = {};
  private ready = false;

  constructor() {
    this.initDb();
  }

  private async initDb(): Promise<void> {
    try {
      this.prisma = new PrismaClient();
      await this.prisma.$connect();

      // Try to load config from AppConfig table
      try {
        const rows = await this.prisma.appConfig.findMany();
        for (const row of rows) {
          this.cache[row.key] = row.value;
        }
        logService.info('SYSTEM', `Loaded ${rows.length} config entries from database`);
      } catch (error: any) {
        // Table doesn't exist yet - create it via raw SQL
        if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
          logService.warn('SYSTEM', 'AppConfig table not found, creating it now...');
          try {
            await this.prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS "AppConfig" (
                "key" TEXT PRIMARY KEY,
                "value" JSONB NOT NULL,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
              )
            `);
            logService.info('SYSTEM', 'AppConfig table created successfully');
          } catch (createError) {
            logService.error('SYSTEM', 'Failed to create AppConfig table', { error: createError });
          }
        } else {
          throw error;
        }
      }

      this.ready = true;
    } catch (error) {
      logService.warn('SYSTEM', 'Database not available for config persistence, using in-memory fallback', { error });
      this.prisma = null;
    }
  }

  private async saveToDb(key: string, value: any): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.appConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    } catch (error: any) {
      // If table doesn't exist yet, just log and continue with in-memory
      if (error?.code === 'P2021' || error?.message?.includes('does not exist')) {
        logService.warn('SYSTEM', `AppConfig table not ready, saving ${key} in memory only`);
      } else {
        logService.error('SYSTEM', `Failed to persist ${key} to database`, { error });
      }
    }
  }

  getTelegram(): PersistedData['telegram'] | undefined {
    return this.cache.telegram as PersistedData['telegram'] | undefined;
  }

  setTelegram(telegram: PersistedData['telegram']): void {
    this.cache.telegram = telegram;
    this.saveToDb('telegram', telegram);
  }

  getNotifications(): PersistedData['notifications'] | undefined {
    return this.cache.notifications as PersistedData['notifications'] | undefined;
  }

  setNotifications(notifications: PersistedData['notifications']): void {
    this.cache.notifications = notifications;
    this.saveToDb('notifications', notifications);
  }

  getRiskConfig(): PersistedData['riskConfig'] | undefined {
    return this.cache.riskConfig as PersistedData['riskConfig'] | undefined;
  }

  setRiskConfig(riskConfig: PersistedData['riskConfig']): void {
    this.cache.riskConfig = riskConfig;
    this.saveToDb('riskConfig', riskConfig);
  }
}

export const persistService = new PersistService();
