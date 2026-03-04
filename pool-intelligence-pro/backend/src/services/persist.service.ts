/**
 * Simple JSON file persistence for runtime settings.
 * Stores Telegram config and notification preferences in a JSON file
 * so they survive server restarts (Render redeploys, etc.)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
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

const DATA_DIR = process.env.PERSIST_DIR || join(process.cwd(), 'data');
const DATA_FILE = join(DATA_DIR, 'settings.json');

class PersistService {
  private data: Partial<PersistedData> = {};
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(DATA_FILE)) {
        const raw = readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        logService.info('SYSTEM', 'Settings loaded from disk', { file: DATA_FILE });
      } else {
        logService.info('SYSTEM', 'No persisted settings file found, starting fresh');
      }
    } catch (error) {
      logService.error('SYSTEM', 'Failed to load persisted settings', { error });
      this.data = {};
    }
  }

  private scheduleSave(): void {
    // Debounce: save at most once per second
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => this.flush(), 1000);
  }

  private flush(): void {
    try {
      const dir = dirname(DATA_FILE);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      logService.info('SYSTEM', 'Settings persisted to disk');
    } catch (error) {
      logService.error('SYSTEM', 'Failed to persist settings', { error });
    }
  }

  getTelegram(): PersistedData['telegram'] | undefined {
    return this.data.telegram;
  }

  setTelegram(telegram: PersistedData['telegram']): void {
    this.data.telegram = telegram;
    this.scheduleSave();
  }

  getNotifications(): PersistedData['notifications'] | undefined {
    return this.data.notifications;
  }

  setNotifications(notifications: PersistedData['notifications']): void {
    this.data.notifications = notifications;
    this.scheduleSave();
  }

  getRiskConfig(): PersistedData['riskConfig'] | undefined {
    return this.data.riskConfig;
  }

  setRiskConfig(riskConfig: PersistedData['riskConfig']): void {
    this.data.riskConfig = riskConfig;
    this.scheduleSave();
  }
}

export const persistService = new PersistService();
