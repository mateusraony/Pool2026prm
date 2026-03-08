/**
 * Notification settings service
 * Stores user preferences for notification types and schedule.
 * Persisted to disk via persistService so settings survive server restarts.
 */

import { logService } from './log.service.js';
import { persistService } from './persist.service.js';

export interface NotificationSettings {
  appUrl: string; // Base URL for deep-links in Telegram messages
  notifications: {
    rangeExit: boolean;         // Price left the range
    nearRangeExit: boolean;     // Price approaching range edge
    dailyReport: boolean;       // Daily portfolio summary
    newRecommendation: boolean; // New top recommendation found
    priceAlerts: boolean;       // Price above/below thresholds
    systemAlerts: boolean;      // System health issues
  };
  dailyReportHour: number;   // 0-23 (local server time)
  dailyReportMinute: number; // 0-59
  tokenFilters: string[];    // Tokens to filter recommendations (e.g., ['ETH', 'USDC', 'WBTC'])
}

const DEFAULT_SETTINGS: NotificationSettings = {
  appUrl: 'http://localhost:5173',
  notifications: {
    rangeExit: true,
    nearRangeExit: true,
    dailyReport: true,
    newRecommendation: false,
    priceAlerts: true,
    systemAlerts: false,
  },
  dailyReportHour: 8,
  dailyReportMinute: 0,
  tokenFilters: [], // Empty = show all pools; with tokens = filter pools containing these tokens
};

class NotificationSettingsService {
  private settings: NotificationSettings;

  constructor() {
    // Start with defaults. Real config loaded later via loadFromDb().
    this.settings = {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications },
      tokenFilters: [...DEFAULT_SETTINGS.tokenFilters],
    };
  }

  /**
   * Load persisted config from database (called AFTER persistService.init()).
   */
  loadFromDb(): void {
    const persisted = persistService.getNotifications();
    if (persisted) {
      this.settings = {
        appUrl: persisted.appUrl || DEFAULT_SETTINGS.appUrl,
        notifications: { ...DEFAULT_SETTINGS.notifications, ...persisted.notifications },
        dailyReportHour: persisted.dailyReportHour ?? DEFAULT_SETTINGS.dailyReportHour,
        dailyReportMinute: persisted.dailyReportMinute ?? DEFAULT_SETTINGS.dailyReportMinute,
        tokenFilters: persisted.tokenFilters || [],
      };
      logService.info('SYSTEM', 'Notification settings loaded from database');
    }
  }

  private persist(): void {
    persistService.setNotifications({
      appUrl: this.settings.appUrl,
      notifications: { ...this.settings.notifications },
      dailyReportHour: this.settings.dailyReportHour,
      dailyReportMinute: this.settings.dailyReportMinute,
      tokenFilters: [...this.settings.tokenFilters],
    });
  }

  getSettings(): NotificationSettings {
    return {
      ...this.settings,
      notifications: { ...this.settings.notifications },
      tokenFilters: [...this.settings.tokenFilters],
    };
  }

  updateSettings(partial: Partial<NotificationSettings>): NotificationSettings {
    if (partial.notifications) {
      this.settings.notifications = {
        ...this.settings.notifications,
        ...partial.notifications,
      };
    }
    if (partial.appUrl !== undefined) this.settings.appUrl = partial.appUrl;
    if (partial.dailyReportHour !== undefined) {
      this.settings.dailyReportHour = Math.max(0, Math.min(23, partial.dailyReportHour));
    }
    if (partial.dailyReportMinute !== undefined) {
      this.settings.dailyReportMinute = Math.max(0, Math.min(59, partial.dailyReportMinute));
    }
    if (partial.tokenFilters !== undefined) {
      // Normalize: uppercase, trim, remove empty
      this.settings.tokenFilters = partial.tokenFilters
        .map(t => t.trim().toUpperCase())
        .filter(t => t.length > 0);
    }

    this.persist();
    logService.info('SYSTEM', 'Notification settings updated', { settings: this.settings });
    return this.getSettings();
  }

  getTokenFilters(): string[] {
    return [...this.settings.tokenFilters];
  }

  hasTokenFilter(): boolean {
    return this.settings.tokenFilters.length > 0;
  }

  matchesTokenFilter(token0Symbol: string, token1Symbol: string): boolean {
    if (!this.hasTokenFilter()) return true;
    const t0 = token0Symbol.toUpperCase();
    const t1 = token1Symbol.toUpperCase();
    return this.settings.tokenFilters.some(f => f === t0 || f === t1);
  }

  isEnabled(type: keyof NotificationSettings['notifications']): boolean {
    return this.settings.notifications[type];
  }

  getAppUrl(): string {
    return this.settings.appUrl.replace(/\/$/, '');
  }

  getSimulationLink(chain: string, poolAddress: string): string {
    return `${this.getAppUrl()}/simulation/${chain}/${poolAddress}`;
  }

  getPositionsLink(): string {
    return `${this.getAppUrl()}/positions`;
  }

  getDailyReportCron(): string {
    const h = this.settings.dailyReportHour;
    const m = this.settings.dailyReportMinute;
    return `${m} ${h} * * *`; // cron expression: "min hour * * *"
  }
}

export const notificationSettingsService = new NotificationSettingsService();
