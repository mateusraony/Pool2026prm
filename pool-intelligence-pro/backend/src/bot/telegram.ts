import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/index.js';
import { logService } from '../services/log.service.js';
import { persistService } from '../services/persist.service.js';
import { AlertEvent, Recommendation } from '../types/index.js';

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private chatId: string = '';
  private botToken: string = '';

  constructor() {
    // Just set env var defaults. Real config loaded later via loadFromDb().
    this.botToken = config.telegram.botToken;
    this.chatId = config.telegram.chatId;

    if (this.botToken) {
      this.initBotSync(this.botToken);
    }
  }

  /**
   * Load persisted config from database (called AFTER persistService.init()).
   * Overrides env var defaults if DB has saved values.
   */
  loadFromDb(): void {
    const persisted = persistService.getTelegram();
    if (persisted?.botToken) {
      this.botToken = persisted.botToken;
      this.initBotSync(persisted.botToken);
      logService.info('SYSTEM', 'Telegram bot token loaded from database');
    }
    if (persisted?.chatId) {
      this.chatId = persisted.chatId;
      logService.info('SYSTEM', 'Telegram chat ID loaded from database');
    }
  }

  private initBotSync(token: string): void {
    try {
      this.bot = new TelegramBot(token, { polling: false });
      this.botToken = token;
      logService.info('SYSTEM', 'Telegram bot initialized');
    } catch (error) {
      logService.error('SYSTEM', 'Failed to initialize Telegram bot', { error });
      this.bot = null;
    }
  }

  private persist(): void {
    persistService.setTelegram({
      botToken: this.botToken,
      chatId: this.chatId,
    });
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
    this.persist();
    logService.info('SYSTEM', 'Telegram Chat ID updated', { chatId: newChatId ? '***' + newChatId.slice(-4) : '(empty)' });
  }

  async setBotToken(token: string): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (!token) {
      this.bot = null;
      this.botToken = '';
      this.persist();
      logService.info('SYSTEM', 'Telegram bot token removed');
      return { ok: true };
    }
    try {
      const testBot = new TelegramBot(token, { polling: false });
      const me = await testBot.getMe();
      // Only replace after successful validation
      this.bot = testBot;
      this.botToken = token;
      this.persist();
      logService.info('SYSTEM', `Telegram bot validated: @${me.username}`);
      return { ok: true, botName: me.username };
    } catch (error: any) {
      // Do NOT clear the existing working bot — keep previous state intact
      const msg = error?.response?.body?.description || error?.message || 'Token invalido';
      logService.error('SYSTEM', 'Telegram bot token validation failed', { error: msg });
      return { ok: false, error: msg };
    }
  }

  async sendMessage(message: string): Promise<{ sent: boolean; error?: string }> {
    if (!this.bot) {
      logService.warn('SYSTEM', 'Telegram bot not configured, skipping message');
      return { sent: false, error: 'Bot Token nao configurado' };
    }
    if (!this.chatId) {
      logService.warn('SYSTEM', 'Telegram chatId not configured, skipping message');
      return { sent: false, error: 'Chat ID nao configurado' };
    }

    try {
      logService.info('SYSTEM', `Sending Telegram message to chatId ${this.chatId.slice(0, 3)}***`);
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
      logService.info('SYSTEM', 'Telegram message sent successfully');
      return { sent: true };
    } catch (error: any) {
      // Extract error from different formats (node-telegram-bot-api uses response.body)
      const telegramError = error?.response?.body?.description
        || error?.response?.description
        || error?.message
        || 'Erro desconhecido';
      const statusCode = error?.response?.statusCode || error?.response?.body?.error_code || '';
      logService.error('SYSTEM', `Failed to send Telegram message: [${statusCode}] ${telegramError}`, {
        chatId: this.chatId,
        statusCode,
        error: telegramError,
      });
      return { sent: false, error: telegramError };
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
      '<b>Pool:</b> ' + this.escapeHtml(poolName) + '\n' +
      '<b>Mensagem:</b> ' + this.escapeHtml(event.message) + '\n' +
      '<b>Horario:</b> ' + event.timestamp.toISOString() + '\n\n' +
      '<i>Pool Intelligence Pro</i>';

    return this.sendMessage(message);
  }

  // Send recommendation notification
  async sendRecommendation(rec: Recommendation): Promise<{ sent: boolean; error?: string }> {
    if (!rec.pool) {
      logService.error('SYSTEM', 'sendRecommendation: recommendation missing pool data');
      return { sent: false, error: 'Invalid recommendation data' };
    }

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
      this.escapeHtml(rec.commentary.substring(0, 300)) + '...\n\n' +
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

  /** Escape HTML entities for safe Telegram message rendering */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Check Telegram bot connectivity */
  async checkHealth(): Promise<{ healthy: boolean; status: string }> {
    if (!this.bot) {
      return { healthy: false, status: 'Bot not initialized' };
    }
    try {
      const me = await this.bot.getMe();
      return { healthy: true, status: `Connected as @${me.username}` };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logService.error('SYSTEM', 'Telegram health check failed', { error: msg });
      return { healthy: false, status: `Connection error: ${msg}` };
    }
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

  /**
   * Define os comandos do bot no menu do Telegram.
   * Chamado no boot para registrar os comandos disponíveis.
   */
  async setupCommands(): Promise<void> {
    if (!this.bot) return;
    try {
      await this.bot.setMyCommands([
        { command: 'start', description: 'Bem-vindo ao Pool Intelligence Pro' },
        { command: 'status', description: 'Status do sistema e pools monitoradas' },
        { command: 'pools', description: 'Lista as top pools por score' },
        { command: 'alerts', description: 'Resumo dos alertas ativos' },
      ]);
      logService.info('SYSTEM', 'Telegram bot commands registered');
    } catch (error) {
      logService.warn('SYSTEM', 'Failed to register Telegram bot commands', { error });
    }
  }

  /**
   * Processa uma mensagem de comando recebida via webhook ou polling.
   * Retorna true se o comando foi reconhecido e tratado.
   */
  async handleCommand(text: string, chatId: string): Promise<boolean> {
    if (!this.bot) return false;

    const command = text.split(' ')[0].toLowerCase().replace(/^\//, '');

    try {
      if (command === 'start') {
        await this.bot.sendMessage(chatId,
          '👋 <b>Bem-vindo ao Pool Intelligence Pro!</b>\n\n' +
          'Monitoro pools de liquidez DeFi em múltiplas chains.\n\n' +
          '📋 <b>Comandos disponíveis:</b>\n' +
          '/status — Status do sistema\n' +
          '/pools — Top pools por score\n' +
          '/alerts — Resumo de alertas\n\n' +
          '💡 Configure seu chat ID nas Configurações do app para receber alertas automáticos.',
          { parse_mode: 'HTML' }
        );
        return true;
      }

      if (command === 'status') {
        const uptime = process.uptime();
        const uptimeStr = uptime < 3600
          ? `${Math.floor(uptime / 60)}m`
          : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
        const mem = process.memoryUsage();
        const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

        await this.bot.sendMessage(chatId,
          '🟢 <b>Sistema Operacional</b>\n\n' +
          `⏱ Uptime: <code>${uptimeStr}</code>\n` +
          `💾 Memória: <code>${heapMB} MB</code>\n` +
          `🌐 Ambiente: <code>${process.env.NODE_ENV ?? 'development'}</code>`,
          { parse_mode: 'HTML' }
        );
        return true;
      }

      if (command === 'pools') {
        // Import inline para evitar circular deps
        const { getLatestRadarResults } = await import('../jobs/index.js');
        const results = getLatestRadarResults();
        if (results.length === 0) {
          await this.bot.sendMessage(chatId, '⏳ Nenhuma pool disponível ainda. Aguarde o próximo ciclo do radar.');
          return true;
        }

        const top5 = results
          .filter(r => r.score?.total != null)
          .sort((a, b) => (b.score?.total ?? 0) - (a.score?.total ?? 0))
          .slice(0, 5);

        const lines = top5.map((r, i) => {
          const pair = `${r.pool.token0?.symbol ?? '?'}/${r.pool.token1?.symbol ?? '?'}`;
          const score = r.score?.total?.toFixed(1) ?? '?';
          const apr = r.score?.breakdown?.return?.aprEstimate?.toFixed(1) ?? '?';
          return `${i + 1}. <b>${pair}</b> — Score: <code>${score}</code> | APR: <code>${apr}%</code> | ${r.pool.chain}`;
        });

        await this.bot.sendMessage(chatId,
          `🏆 <b>Top 5 Pools</b>\n\n${lines.join('\n')}`,
          { parse_mode: 'HTML' }
        );
        return true;
      }

      if (command === 'alerts') {
        await this.bot.sendMessage(chatId,
          '🔔 <b>Alertas</b>\n\n' +
          'Configure alertas de pool no app e você receberá notificações aqui automaticamente.\n\n' +
          '📱 Acesse o app → Alertas para configurar.',
          { parse_mode: 'HTML' }
        );
        return true;
      }

    } catch (error) {
      logService.error('SYSTEM', 'Telegram command handler error', { command, error });
    }

    return false;
  }

  /**
   * Processa um update recebido via Telegram Webhook.
   * Chamado pelo endpoint POST /api/telegram/webhook
   */
  async processWebhookUpdate(update: Record<string, unknown>): Promise<void> {
    if (!this.bot) return;
    try {
      const message = update.message as Record<string, unknown> | undefined;
      if (!message) return;

      const text = message.text as string | undefined;
      const chat = message.chat as Record<string, unknown> | undefined;
      const chatId = String(chat?.id ?? '');

      if (text && chatId && text.startsWith('/')) {
        await this.handleCommand(text, chatId);
      }
    } catch (error) {
      logService.error('SYSTEM', 'Telegram webhook update error', { error });
    }
  }
}

export const telegramBot = new TelegramBotService();
