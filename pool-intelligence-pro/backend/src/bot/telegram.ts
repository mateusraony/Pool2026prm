import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';
import { logService } from '../services/log.service.js';
import { AlertEvent, Recommendation } from '../types/index.js';

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private chatId: string;
  private botToken: string;

  constructor() {
    this.chatId = config.telegram.chatId;
    this.botToken = config.telegram.botToken;

    if (this.botToken) {
      this.initBotSync(this.botToken);
    }
  }

  private initBotSync(token: string): void {
    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.botToken = token;
      logService.info('SYSTEM', 'Telegram bot initialized (sync, no validation)');
    } catch (error) {
      logService.error('SYSTEM', 'Failed to initialize Telegram bot', { error });
      this.bot = null;
    }
  }

  isEnabled(): boolean {
    return this.bot !== null && !!this.chatId;
  }

  hasBot(): boolean {
    return this.bot !== null;
  }

  getChatId(): string {
    return this.chatId;
  }

  setChatId(newChatId: string): void {
    this.chatId = newChatId;
    logService.info('SYSTEM', 'Telegram Chat ID updated at runtime', { chatId: newChatId ? '***' + newChatId.slice(-4) : '(empty)' });
  }

  async setBotToken(token: string): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!token) {
      this.bot = null;
      this.botToken = '';
      logService.info('SYSTEM', 'Telegram bot token removed');
      return { ok: true };
    }
    try {
      const testBot = new TelegramBot(token, { polling: false });
      const me = await testBot.getMe();
      this.bot = testBot;
      this.botToken = token;
      logService.info('SYSTEM', `Telegram bot validated: @${me.username}`);
      return { ok: true, botName: me.username };
    } catch (error: any) {
      this.bot = null;
      this.botToken = '';
      const msg = error?.response?.body?.description || error?.message || 'Token invalido';
      logService.error('SYSTEM', 'Telegram bot token validation failed', { error: msg });
      return { ok: false, error: msg };
    }
  }

  async sendMessage(message: string): Promise<{ sent: boolean; error?: string }> {
    if (!this.isEnabled()) {
      const reason = !this.bot ? 'Bot Token nao configurado' : 'Chat ID nao configurado';
      logService.warn('SYSTEM', 'Telegram bot not enabled, skipping message');
      return { sent: false, error: reason };
    }

    try {
      await this.bot!.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      return { sent: true };
    } catch (error: any) {
      const msg = error?.response?.body?.description || error?.message || 'Erro desconhecido';
      logService.error('SYSTEM', 'Failed to send Telegram message', { error: msg });
      return { sent: false, error: msg };
    }
  }

  // Send alert notification
  async sendAlert(event: AlertEvent): Promise<{ sent: boolean; error?: string }> {
    const poolName = event.pool
      ? event.pool.token0.symbol + '/' + event.pool.token1.symbol
      : 'N/A';

    const emoji = this.getAlertEmoji(event.type);

    const message =
      emoji + ' <b>ALERTA: ' + event.type.replace(/_/g, ' ') + '</b>\n\n' +
      '<b>Pool:</b> ' + poolName + '\n' +
      '<b>Mensagem:</b> ' + event.message + '\n' +
      '<b>Horario:</b> ' + event.timestamp.toISOString() + '\n\n' +
      '<i>Pool Intelligence Pro</i>';

    return this.sendMessage(message);
  }

  // Send recommendation notification
  async sendRecommendation(rec: Recommendation): Promise<{ sent: boolean; error?: string }> {
    const poolName = rec.pool.token0.symbol + '/' + rec.pool.token1.symbol;
    const modeEmoji = rec.mode === 'DEFENSIVE' ? '🛡' : rec.mode === 'NORMAL' ? '⚖' : '🎯';

    const message =
      '🏆 <b>TOP ' + rec.rank + ' RECOMENDACAO</b> ' + modeEmoji + '\n\n' +
      '<b>Pool:</b> ' + poolName + ' (' + rec.pool.protocol + ')\n' +
      '<b>Chain:</b> ' + rec.pool.chain + '\n' +
      '<b>Score:</b> ' + rec.score.total.toFixed(1) + '/100\n\n' +
      '<b>📊 Metricas:</b>\n' +
      '• TVL: $' + this.formatNumber(rec.pool.tvl) + '\n' +
      '• Volume 24h: $' + this.formatNumber(rec.pool.volume24h) + '\n\n' +
      '<b>📈 Projecao:</b>\n' +
      '• Probabilidade: ' + rec.probability + '%\n' +
      '• Retorno estimado: ' + rec.estimatedGainPercent.toFixed(2) + '% (~$' + rec.estimatedGainUsd.toFixed(2) + ')\n\n' +
      '<b>⚠ Riscos:</b>\n' +
      rec.mainRisks.map(r => '• ' + r).join('\n') + '\n\n' +
      '<b>📝 Analise:</b>\n' +
      rec.commentary.substring(0, 300) + '...\n\n' +
      '<i>Valido ate: ' + rec.validUntil.toISOString() + '</i>';

    return this.sendMessage(message);
  }

  // Send daily summary
  async sendDailySummary(data: {
    totalPools: number;
    watchlistCount: number;
    alertsToday: number;
    topRecommendation?: Recommendation;
  }): Promise<{ sent: boolean; error?: string }> {
    let message =
      '📊 <b>RESUMO DIARIO</b>\n\n' +
      '<b>Pools analisadas:</b> ' + data.totalPools + '\n' +
      '<b>Na watchlist:</b> ' + data.watchlistCount + '\n' +
      '<b>Alertas hoje:</b> ' + data.alertsToday + '\n\n';

    if (data.topRecommendation) {
      const poolName = data.topRecommendation.pool.token0.symbol + '/' +
                       data.topRecommendation.pool.token1.symbol;
      message +=
        '<b>🏆 Melhor oportunidade:</b>\n' +
        poolName + ' (Score: ' + data.topRecommendation.score.total.toFixed(1) + ')\n\n';
    }

    message += '<i>Pool Intelligence Pro</i>';

    return this.sendMessage(message);
  }

  // Send system health notification
  async sendHealthAlert(status: string, details: string): Promise<{ sent: boolean; error?: string }> {
    const emoji = status === 'HEALTHY' ? '✅' : status === 'DEGRADED' ? '⚠' : '🔴';

    const message =
      emoji + ' <b>STATUS DO SISTEMA: ' + status + '</b>\n\n' +
      details + '\n\n' +
      '<i>' + new Date().toISOString() + '</i>';

    return this.sendMessage(message);
  }

  private getAlertEmoji(type: string): string {
    const emojis: Record<string, string> = {
      PRICE_ABOVE: '📈',
      PRICE_BELOW: '📉',
      RSI_ABOVE: '🔥',
      RSI_BELOW: '❄',
      MACD_CROSS_UP: '🚀',
      MACD_CROSS_DOWN: '🔻',
      VOLUME_DROP: '📊',
      LIQUIDITY_FLIGHT: '🚨',
      VOLATILITY_SPIKE: '⚡',
      OUT_OF_RANGE: '🎯',
      NEW_RECOMMENDATION: '🏆',
    };
    return emojis[type] || '🔔';
  }

  private formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toFixed(2);
  }
}

export const telegramBot = new TelegramBotService();
