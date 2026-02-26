import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';
import { logService } from '../services/log.service.js';
import { AlertEvent, Recommendation } from '../types/index.js';

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private chatId: string;

  constructor() {
    this.chatId = config.telegram.chatId;
    
    if (config.telegram.enabled && config.telegram.botToken) {
      try {
        this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
        logService.info('SYSTEM', 'Telegram bot initialized');
      } catch (error) {
        logService.error('SYSTEM', 'Failed to initialize Telegram bot', { error });
      }
    }
  }

  isEnabled(): boolean {
    return this.bot !== null && !!this.chatId;
  }

  async sendMessage(message: string): Promise<boolean> {
    if (!this.isEnabled()) {
      logService.warn('SYSTEM', 'Telegram bot not enabled, skipping message');
      return false;
    }

    try {
      await this.bot!.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      return true;
    } catch (error) {
      logService.error('SYSTEM', 'Failed to send Telegram message', { error });
      return false;
    }
  }

  // Send alert notification
  async sendAlert(event: AlertEvent): Promise<boolean> {
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
  async sendRecommendation(rec: Recommendation): Promise<boolean> {
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
  }): Promise<boolean> {
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
  async sendHealthAlert(status: string, details: string): Promise<boolean> {
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
