import TelegramBot from 'node-telegram-bot-api';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/formatting.js';

// ========================================
// BOT DO TELEGRAM
// ========================================

let bot: TelegramBot | null = null;

// Inicializa o bot
export function initTelegramBot(): TelegramBot | null {
  if (!config.telegram.enabled) {
    log.info('Telegram bot disabled (no token configured)');
    return null;
  }

  if (bot) {
    return bot;
  }

  try {
    bot = new TelegramBot(config.telegram.botToken!, {
      polling: false, // Não usamos polling, apenas enviamos mensagens
    });

    log.info('Telegram bot initialized');
    return bot;
  } catch (error) {
    log.error('Failed to initialize Telegram bot', { error });
    return null;
  }
}

// Envia alerta via Telegram
export async function sendTelegramAlert(params: {
  title: string;
  severity: string;
  message: string;
  poolId?: string;
  network?: string;
}): Promise<boolean> {
  const { title, severity, message, poolId } = params;

  if (!config.telegram.enabled || !config.telegram.chatId) {
    log.warn('Telegram not configured, skipping alert');
    return false;
  }

  const telegramBot = initTelegramBot();
  if (!telegramBot) {
    return false;
  }

  const severityEmoji: Record<string, string> = {
    INFO: 'ℹ️',
    WARNING: '⚠️',
    CRITICAL: '🚨',
  };

  // Formata mensagem HTML
  const htmlMessage = `
${severityEmoji[severity] || 'ℹ️'} <b>${escapeHtml(title)}</b>

${escapeHtml(message)}

<i>Enviado em ${new Date().toLocaleString('pt-BR')}</i>
`.trim();

  try {
    // Keyboard inline com link para o painel (se configurado)
    const inlineKeyboard = [];

    if (poolId && config.frontendUrl) {
      inlineKeyboard.push([
        {
          text: '📊 Ver no Painel',
          url: `${config.frontendUrl}/pools/${encodeURIComponent(poolId)}`,
        },
      ]);
    }

    await telegramBot.sendMessage(config.telegram.chatId, htmlMessage, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: inlineKeyboard.length > 0
        ? { inline_keyboard: inlineKeyboard }
        : undefined,
    });

    log.info('Telegram alert sent', { severity, title });
    return true;
  } catch (error) {
    log.error('Failed to send Telegram message', { error });
    return false;
  }
}

// Envia mensagem simples
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!config.telegram.enabled || !config.telegram.chatId) {
    return false;
  }

  const telegramBot = initTelegramBot();
  if (!telegramBot) {
    return false;
  }

  try {
    await telegramBot.sendMessage(config.telegram.chatId, text, {
      parse_mode: 'HTML',
    });
    return true;
  } catch (error) {
    log.error('Failed to send Telegram message', { error });
    return false;
  }
}

// Envia relatório diário
export async function sendDailyReport(report: {
  totalPositions: number;
  totalCapital: string;
  totalPnL: string;
  topPerformer?: { name: string; pnl: string };
  worstPerformer?: { name: string; pnl: string };
  alerts24h: number;
}): Promise<boolean> {
  const message = `
📊 <b>Relatório Diário - Liquidity Pool Intelligence</b>

📈 <b>Resumo das Posições:</b>
• Total de posições: ${report.totalPositions}
• Capital total: ${report.totalCapital}
• PnL total: ${report.totalPnL}

${report.topPerformer ? `🏆 <b>Melhor desempenho:</b> ${escapeHtml(report.topPerformer.name)} (${report.topPerformer.pnl})` : ''}
${report.worstPerformer ? `📉 <b>Pior desempenho:</b> ${escapeHtml(report.worstPerformer.name)} (${report.worstPerformer.pnl})` : ''}

🔔 Alertas nas últimas 24h: ${report.alerts24h}

<i>Gerado em ${new Date().toLocaleString('pt-BR')}</i>
`.trim();

  return sendTelegramMessage(message);
}

// Testa conexão com o Telegram
export async function testTelegramConnection(): Promise<boolean> {
  if (!config.telegram.enabled) {
    return false;
  }

  const telegramBot = initTelegramBot();
  if (!telegramBot) {
    return false;
  }

  try {
    const me = await telegramBot.getMe();
    log.info('Telegram connection test successful', { botName: me.username });
    return true;
  } catch (error) {
    log.error('Telegram connection test failed', { error });
    return false;
  }
}

// Envia notificação de startup
export async function sendStartupNotification(): Promise<void> {
  if (!config.telegram.enabled) {
    return;
  }

  await sendTelegramMessage(`
🚀 <b>Sistema Iniciado</b>

O Liquidity Pool Intelligence está online e monitorando suas posições.

• Redes: ${config.enabledNetworks.join(', ')}
• Alertas: Ativos
• Ambiente: ${config.env}

<i>${new Date().toLocaleString('pt-BR')}</i>
`.trim());
}
