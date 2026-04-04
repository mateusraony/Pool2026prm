/**
 * Push Notification Routes — ETAPA 17
 */

import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { pushService } from '../services/push.service.js';
import { z } from 'zod';

const router = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    auth: z.string().min(1),
    p256dh: z.string().min(1),
  }),
});

// GET /api/push/vapid-public-key — Retorna a chave pública VAPID
router.get('/push/vapid-public-key', (_req, res) => {
  const publicKey = pushService.getPublicKey();
  if (!publicKey) {
    return res.status(503).json({ success: false, error: 'Push service not initialized', timestamp: new Date() });
  }
  res.json({ success: true, data: { publicKey }, timestamp: new Date() });
});

// POST /api/push/subscribe — Registra uma subscription
router.post('/push/subscribe', async (req, res) => {
  try {
    const parsed = subscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid subscription', details: parsed.error.flatten(), timestamp: new Date() });
    }
    const userAgent = req.headers['user-agent'];
    const record = pushService.subscribe(parsed.data, userAgent);
    res.json({ success: true, data: { id: record.id }, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /push/subscribe failed', { error });
    res.status(500).json({ success: false, error: 'Failed to subscribe', timestamp: new Date() });
  }
});

// DELETE /api/push/unsubscribe — Remove uma subscription
router.delete('/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint || typeof endpoint !== 'string') {
      return res.status(400).json({ success: false, error: 'endpoint is required', timestamp: new Date() });
    }
    pushService.unsubscribe(endpoint);
    res.json({ success: true, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /push/unsubscribe failed', { error });
    res.status(500).json({ success: false, error: 'Failed to unsubscribe', timestamp: new Date() });
  }
});

// GET /api/push/stats — Estatísticas de subscriptions
router.get('/push/stats', (_req, res) => {
  res.json({ success: true, data: pushService.getStats(), timestamp: new Date() });
});

export default router;
