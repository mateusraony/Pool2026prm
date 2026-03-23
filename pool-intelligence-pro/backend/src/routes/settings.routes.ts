import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { notificationSettingsService } from '../services/notification-settings.service.js';
import { persistService } from '../services/persist.service.js';
import { telegramBot } from '../bot/telegram.js';
import { alertService } from '../services/alert.service.js';
import { getLatestRecommendations } from '../jobs/index.js';
import { config } from '../config/index.js';
import {
  validate, telegramConfigSchema, riskConfigSchema,
  notificationSettingsSchema, telegramTestRecsSchema,
} from './validation.js';
import { requireAdminKey } from './middleware/admin-auth.js';

const router = Router();

// Get settings (system + notification + risk config)
router.get('/settings', async (req, res) => {
  const chatId = telegramBot.getChatId();
  res.json({
    success: true,
    data: {
      system: {
        mode: config.defaults.mode,
        capital: config.defaults.capital,
        chains: config.defaults.chains,
        thresholds: config.thresholds,
        scoreWeights: config.scoreWeights,
      },
      notifications: notificationSettingsService.getSettings(),
      telegram: {
        enabled: telegramBot.isEnabled(),
        chatId: chatId ? '***' + chatId.slice(-4) : null,
        hasChatId: !!chatId,
        hasBot: telegramBot.hasBot(),
      },
      riskConfig: persistService.getRiskConfig() || null,
      alertConfig: {
        cooldownMinutes: alertService.getAlertConfig().cooldownMinutes,
        maxAlertsPerHour: alertService.getAlertConfig().maxAlertsPerHour,
        dedupeWindowMinutes: alertService.getAlertConfig().dedupeWindowMinutes,
      },
      persistence: {
        ready: persistService.ready,
        hasTelegramInDb: !!persistService.getTelegram(),
        hasNotificationsInDb: !!persistService.getNotifications(),
      },
    },
    timestamp: new Date(),
  });
});

// Update Telegram Bot Token and/or Chat ID at runtime
router.put('/settings/telegram', requireAdminKey, validate(telegramConfigSchema), async (req, res) => {
  try {
    const { chatId, botToken } = req.body;
    let botName: string | undefined;

    if (botToken !== undefined) {
      const result = await telegramBot.setBotToken(botToken);
      if (!result.ok && botToken) {
        return res.status(400).json({
          success: false,
          error: `Token invalido: ${result.error}`,
        });
      }
      botName = result.botName;
    }

    if (chatId !== undefined) {
      telegramBot.setChatId(chatId);
    }

    const currentChatId = telegramBot.getChatId();
    res.json({
      success: true,
      data: {
        enabled: telegramBot.isEnabled(),
        chatId: currentChatId ? '***' + currentChatId.slice(-4) : null,
        hasChatId: !!currentChatId,
        hasBot: telegramBot.hasBot(),
        botName,
      },
      message: botName ? `Bot @${botName} conectado!` : 'Telegram configurado',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'PUT /settings/telegram failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Save risk config (persisted to DB, validated with Zod)
router.put('/settings/risk-config', requireAdminKey, validate(riskConfigSchema), async (req, res) => {
  try {
    persistService.setRiskConfig(req.body);
    res.json({
      success: true,
      data: persistService.getRiskConfig(),
      message: 'Risk config salvo',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'PUT /settings/risk-config failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Update notification settings
router.put('/settings/notifications', validate(notificationSettingsSchema), async (req, res) => {
  try {
    const updated = notificationSettingsService.updateSettings(req.body);
    res.json({
      success: true,
      data: updated,
      message: 'Notification settings updated',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'PUT /settings/notifications failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Send test Telegram message (simple connection test)
router.post('/settings/telegram/test', async (req, res) => {
  try {
    if (!telegramBot.hasBot()) {
      return res.json({ success: false, error: 'Bot Token nao configurado. Configure o token na secao acima.' });
    }
    if (!telegramBot.getChatId()) {
      return res.json({ success: false, error: 'Chat ID nao configurado. Adicione seu Chat ID na secao acima.' });
    }

    const appUrl = notificationSettingsService.getAppUrl();
    const posLink = notificationSettingsService.getPositionsLink();
    const msg =
      `✅ <b>Teste de Notificação</b>\n\n` +
      `Pool Intelligence Pro está funcionando!\n` +
      `URL do App: ${appUrl}\n\n` +
      `🔗 <a href="${posLink}">Abrir Posições</a>`;
    const result = await telegramBot.sendMessage(msg);
    if (result.sent) {
      res.json({ success: true, message: 'Mensagem de teste enviada! Verifique seu Telegram.' });
    } else {
      let errorMsg = result.error || 'Falha ao enviar';
      if (errorMsg.includes('Forbidden') || errorMsg.includes('bot was blocked') || errorMsg.includes("can't initiate")) {
        errorMsg += ' — Voce precisa abrir o seu bot no Telegram e enviar /start antes que ele possa enviar mensagens.';
      } else if (errorMsg.includes('chat not found')) {
        errorMsg += ' — Chat ID invalido ou voce nao enviou /start para o bot ainda.';
      }
      res.json({ success: false, error: errorMsg });
    }
  } catch (error: any) {
    const msg = error?.message || 'Erro interno';
    logService.error('SYSTEM', 'POST /settings/telegram/test failed', { error: msg });
    res.json({ success: false, error: 'Erro ao enviar teste: ' + msg });
  }
});

// Send top recommendations via Telegram (real data test)
router.post('/settings/telegram/test-recommendations', validate(telegramTestRecsSchema), async (req, res) => {
  try {
    if (!telegramBot.hasBot()) {
      return res.json({ success: false, error: 'Bot Token nao configurado.' });
    }
    if (!telegramBot.getChatId()) {
      return res.json({ success: false, error: 'Chat ID nao configurado.' });
    }

    const { limit, useTokenFilter } = req.body;
    let recommendations = getLatestRecommendations();

    if (recommendations.length === 0) {
      return res.json({ success: false, error: 'Nenhuma recomendação disponível. Aguarde o sistema coletar dados das pools.' });
    }

    if (useTokenFilter && notificationSettingsService.hasTokenFilter()) {
      recommendations = recommendations.filter(r =>
        notificationSettingsService.matchesTokenFilter(r.pool.token0.symbol, r.pool.token1.symbol)
      );
    }

    if (recommendations.length === 0) {
      const tokens = notificationSettingsService.getTokenFilters();
      return res.json({
        success: false,
        error: `Nenhuma pool encontrada com os tokens filtrados: ${tokens.join(', ')}. Adicione mais tokens ou remova o filtro.`,
        tokenFilters: tokens,
      });
    }

    const top = recommendations.slice(0, Math.min(limit, 10));
    const tokenFilters = notificationSettingsService.getTokenFilters();
    const filterText = tokenFilters.length > 0 ? `Filtros: ${tokenFilters.join(', ')}` : 'Sem filtros de token';

    let msg = `🏆 <b>TOP ${top.length} RECOMENDAÇÕES DE POOLS</b>\n`;
    msg += `📅 ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    msg += `🔍 ${filterText}\n\n`;

    for (const rec of top) {
      const pool = rec.pool;
      const score = rec.score;
      const poolName = `${pool.token0.symbol}/${pool.token1.symbol}`;
      const modeEmoji = rec.mode === 'DEFENSIVE' ? '🛡️' : rec.mode === 'AGGRESSIVE' ? '🔥' : '⚖️';
      const scoreEmoji = score.total >= 70 ? '🟢' : score.total >= 50 ? '🟡' : '🔴';
      const simLink = notificationSettingsService.getSimulationLink(pool.chain, pool.poolAddress);

      msg += `${scoreEmoji} <b>#${rec.rank} ${poolName}</b> ${modeEmoji}\n`;
      msg += `   📊 Score: <code>${score.total.toFixed(0)}/100</code> | ${pool.protocol} (${pool.chain})\n`;
      msg += `   💰 TVL: $${(pool.tvl / 1e6).toFixed(2)}M | Vol: $${(pool.volume24h / 1e3).toFixed(0)}K\n`;
      msg += `   📈 APR Est: <code>${rec.estimatedGainPercent.toFixed(2)}%/semana</code> (${rec.probability}% prob)\n`;
      msg += `   🔗 <a href="${simLink}">Simular</a>\n\n`;
    }

    msg += `──────────────────\n`;
    msg += `💡 <i>Clique em "Simular" para ver detalhes e adicionar ao monitoramento</i>\n`;
    msg += `<a href="${notificationSettingsService.getAppUrl()}">Abrir Pool Intelligence Pro →</a>`;

    const result = await telegramBot.sendMessage(msg);
    if (result.sent) {
      res.json({ success: true, message: `Enviado TOP ${top.length} recomendações para o Telegram`, count: top.length, tokenFilters });
    } else {
      let errorMsg = result.error || 'Falha ao enviar';
      if (errorMsg.includes('Forbidden') || errorMsg.includes("can't initiate")) {
        errorMsg += ' — Envie /start para o seu bot no Telegram.';
      } else if (errorMsg.includes('chat not found')) {
        errorMsg += ' — Chat ID invalido ou falta /start.';
      }
      res.json({ success: false, error: errorMsg });
    }
  } catch (error: any) {
    const msg = error?.message || 'Erro interno';
    logService.error('SYSTEM', 'POST /settings/telegram/test-recommendations failed', { error: msg });
    res.json({ success: false, error: 'Erro ao enviar recomendacoes: ' + msg });
  }
});

export default router;
