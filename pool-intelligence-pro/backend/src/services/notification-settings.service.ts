/**
 * Notification settings service
 * Stores user preferences for notification types and schedule in memory
 * (persisted via JSON file if available)
 */

import { logService } from './log.service.js';

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
};

class NotificationSettingsService {
  private settings: NotificationSettings = { ...DEFAULT_SETTINGS };

  constructor() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      notifications: { ...DEFAULT_SETTINGS.notifications },
    };
  }

  getSettings(): NotificationSettings {
    return { ...this.settings, notifications: { ...this.settings.notifications } };
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

    logService.info('SYSTEM', 'Notification settings updated', { settings: this.settings });
    return this.getSettings();
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
