/**
 * Persistence service using PostgreSQL (via Prisma).
 * Stores runtime settings in the AppConfig table as key-value JSON pairs.
 *
 * IMPORTANT: Call `await persistService.init()` before reading any config.
 * The init() loads all data from DB into an in-memory cache.
 * All getters read from cache (sync). All setters write to cache + DB (async).
 */

import { getPrisma } from '../routes/prisma.js';
import type { PrismaClient } from '@prisma/client';
import { logService } from './log.service.js';

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

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
  private prisma: ReturnType<typeof getPrisma> | null = null;
  private cache: Partial<PersistedData> & Record<string, unknown> = {};
  private _ready = false;

  /**
   * Initialize: connect to DB, create table if needed, load all config.
   * Must be awaited before any service reads from persistService.
   */
  async init(): Promise<void> {
    if (this._ready) return;

    try {
      this.prisma = getPrisma();
      await this.prisma.$connect();
      logService.info('SYSTEM', 'Database connected for config persistence');

      // Ensure AppConfig table exists
      await this.ensureTable();

      // Load all config rows into cache
      try {
        const rows = await this.prisma.appConfig.findMany();
        for (const row of rows) {
          this.cache[row.key] = row.value;
        }
        logService.info('SYSTEM', `Loaded ${rows.length} config entries from database`);
      } catch (error: unknown) {
        logService.warn('SYSTEM', 'Failed to load config from AppConfig table', { error: getErrorMessage(error) });
      }

      this._ready = true;
    } catch (error: unknown) {
      logService.warn('SYSTEM', 'Database not available for persistence: ' + getErrorMessage(error), {});
      this.prisma = null;
    }
  }

  get ready(): boolean {
    return this._ready;
  }

  private async ensureTable(): Promise<void> {
    if (!this.prisma) return;
    try {
      // Quick check: try a simple query
      await this.prisma.$queryRaw`SELECT 1 FROM "AppConfig" LIMIT 1`;
    } catch (_error: unknown) {
      // Table doesn't exist - create it
      logService.info('SYSTEM', 'Creating AppConfig table...');
      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS "AppConfig" (
            "key" TEXT PRIMARY KEY,
            "value" JSONB NOT NULL,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        logService.info('SYSTEM', 'AppConfig table created');
      } catch (createErr: unknown) {
        logService.error('SYSTEM', 'Failed to create AppConfig table: ' + getErrorMessage(createErr));
      }
    }
  }

  private async saveToDb(key: string, value: any): Promise<void> {
    if (!this.prisma) return;

    try {
      // Use raw SQL for PgBouncer compatibility (no prepared statements)
      const jsonStr = JSON.stringify(value);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "AppConfig" ("key", "value", "updatedAt") VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT ("key") DO UPDATE SET "value" = $2::jsonb, "updatedAt" = NOW()`,
        key,
        jsonStr,
      );
      logService.info('SYSTEM', `Config "${key}" saved to database`);
    } catch (error: unknown) {
      logService.error('SYSTEM', `Failed to persist config key "${key}" to DB`, {
        error: getErrorMessage(error),
        key,
      });
    }
  }

  getTelegram(): PersistedData['telegram'] | undefined {
    return this.cache.telegram as PersistedData['telegram'] | undefined;
  }

  setTelegram(telegram: PersistedData['telegram']): void {
    this.cache.telegram = telegram;
    logService.info('SYSTEM', 'Persisting Telegram config to DB...');
    this.saveToDb('telegram', telegram);
  }

  getNotifications(): PersistedData['notifications'] | undefined {
    return this.cache.notifications as PersistedData['notifications'] | undefined;
  }

  setNotifications(notifications: PersistedData['notifications']): void {
    this.cache.notifications = notifications;
    logService.info('SYSTEM', 'Persisting notifications config to DB...');
    this.saveToDb('notifications', notifications);
  }

  getRiskConfig(): PersistedData['riskConfig'] | undefined {
    return this.cache.riskConfig as PersistedData['riskConfig'] | undefined;
  }

  setRiskConfig(riskConfig: PersistedData['riskConfig']): void {
    this.cache.riskConfig = riskConfig;
    logService.info('SYSTEM', 'Persisting risk config to DB...');
    this.saveToDb('riskConfig', riskConfig);
  }

  /** Generic getter — reads any persisted key from cache */
  get(key: string): unknown {
    return this.cache[key];
  }

  /** Generic setter — persists any key to cache + DB */
  async set(key: string, value: unknown): Promise<void> {
    this.cache[key] = value;
    await this.saveToDb(key, value);
  }
}

export const persistService = new PersistService();
