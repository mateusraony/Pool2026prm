import { Router, Request, Response } from 'express';
import { requireSecret } from '../middleware/auth.js';
import { runPoolScan } from '../../services/analysis/scanner.js';
import { checkAllAlerts } from '../../services/alerts/monitor.js';
import { log } from '../../utils/logger.js';

const router = Router();

// POST /api/webhook/scan - Dispara scan manual de pools (requer secret)
router.post('/scan', requireSecret, async (req: Request, res: Response) => {
  try {
    log.info('Manual pool scan triggered via webhook');

    // Roda scan em background
    runPoolScan()
      .then(recommendations => {
        log.info('Manual scan completed', { poolCount: recommendations.length });
      })
      .catch(error => {
        log.error('Manual scan failed', { error });
      });

    res.json({
      message: 'Scan started',
      status: 'processing',
    });
  } catch (error) {
    log.error('Failed to start scan', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/webhook/alerts - Dispara verificação de alertas (requer secret)
router.post('/alerts', requireSecret, async (req: Request, res: Response) => {
  try {
    log.info('Manual alert check triggered via webhook');

    await checkAllAlerts();

    res.json({
      message: 'Alert check completed',
      status: 'done',
    });
  } catch (error) {
    log.error('Failed to check alerts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/webhook/telegram - Webhook para callbacks do Telegram
router.post('/telegram', requireSecret, async (req: Request, res: Response) => {
  try {
    const { callback_query } = req.body;

    if (callback_query) {
      const { data, message } = callback_query;

      log.info('Telegram callback received', {
        data,
        chatId: message?.chat?.id,
      });

      // Processa callbacks (ex: marcar alerta como lido)
      if (data?.startsWith('ack_')) {
        const alertId = data.replace('ack_', '');
        // Aqui poderia marcar o alerta como acknowledged
        log.info('Alert acknowledged via Telegram', { alertId });
      }
    }

    // Telegram espera resposta 200
    res.status(200).json({ ok: true });
  } catch (error) {
    log.error('Failed to process Telegram webhook', { error });
    res.status(200).json({ ok: true }); // Sempre retorna 200 pro Telegram
  }
});

// POST /api/webhook/backup - Dispara backup manual (requer secret)
router.post('/backup', requireSecret, async (req: Request, res: Response) => {
  try {
    log.info('Manual backup triggered via webhook');

    // Import dinâmico para evitar dependência circular
    const { runBackup } = await import('../../scheduler/jobs/backup.js');
    const result = await runBackup();

    res.json({
      message: 'Backup completed',
      ...result,
    });
  } catch (error) {
    log.error('Failed to run backup', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
