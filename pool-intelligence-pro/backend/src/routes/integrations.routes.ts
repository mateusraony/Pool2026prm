/**
 * Integrations Routes — ETAPA 14
 * CRUD para configurar Discord, Slack e webhooks genéricos.
 */

import { Router } from 'express';
import { z } from 'zod';
import { webhookService, Integration, IntegrationType } from '../services/webhook.service.js';
import { persistService } from '../services/persist.service.js';
import { logService } from '../services/log.service.js';

const router = Router();

/**
 * Middleware de autenticação simples para endpoints de admin.
 * Verifica o header X-Admin-Key contra ADMIN_SECRET env var.
 * Se ADMIN_SECRET não estiver definido, permite acesso (desenvolvimento).
 */
function requireAdminKey(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    // Em desenvolvimento sem ADMIN_SECRET configurado, permite acesso
    next();
    return;
  }
  const provided = req.headers['x-admin-key'];
  if (provided !== secret) {
    res.status(401).json({ success: false, error: 'Unauthorized: invalid admin key', timestamp: new Date() });
    return;
  }
  next();
}

const PERSIST_KEY = 'integrations';

// Helper: persist current state
async function saveIntegrations(): Promise<void> {
  await persistService.set(PERSIST_KEY, webhookService.getAll());
}

// Helper: load from persist into service (called at startup)
export async function loadIntegrations(): Promise<void> {
  const saved = persistService.get(PERSIST_KEY) as Integration[] | undefined;
  if (Array.isArray(saved)) {
    webhookService.setIntegrations(saved);
    logService.info('SYSTEM', `Loaded ${saved.length} integrations from persistence`);
  }
}

// Validation schema
const IntegrationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['discord', 'slack', 'webhook']),
  url: z.string().url(),
  enabled: z.boolean().default(true),
  events: z.array(z.string()).default([]),
});

// ============================================================
// GET /api/integrations — listar todas
// ============================================================
router.get('/integrations', (_req, res) => {
  try {
    const list = webhookService.getAll();
    res.json({ success: true, data: list, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /integrations failed', { error });
    res.status(500).json({ success: false, error: 'Failed to list integrations', timestamp: new Date() });
  }
});

// ============================================================
// POST /api/integrations — criar nova integração
// ============================================================
router.post('/integrations', requireAdminKey, async (req, res) => {
  try {
    const parsed = IntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten(), timestamp: new Date() });
    }

    const { name, type, url, enabled, events } = parsed.data;
    const integration: Integration = {
      id: `${type}_${Date.now()}`,
      name,
      type: type as IntegrationType,
      url,
      enabled,
      events,
      createdAt: new Date().toISOString(),
      successCount: 0,
      errorCount: 0,
    };

    webhookService.upsert(integration);
    await saveIntegrations();
    logService.info('SYSTEM', 'Integration created', { id: integration.id, type, name });

    res.status(201).json({ success: true, data: integration, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /integrations failed', { error });
    res.status(500).json({ success: false, error: 'Failed to create integration', timestamp: new Date() });
  }
});

// ============================================================
// PUT /api/integrations/:id — atualizar integração existente
// ============================================================
router.put('/integrations/:id', requireAdminKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required', timestamp: new Date() });
    }

    const current = webhookService.getAll().find(i => i.id === id);
    if (!current) {
      return res.status(404).json({ success: false, error: 'Integration not found', timestamp: new Date() });
    }

    const UpdateSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      url: z.string().url().optional(),
      enabled: z.boolean().optional(),
      events: z.array(z.string()).optional(),
    });

    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten(), timestamp: new Date() });
    }

    const updated: Integration = { ...current, ...parsed.data };
    webhookService.upsert(updated);
    await saveIntegrations();
    logService.info('SYSTEM', 'Integration updated', { id });

    res.json({ success: true, data: updated, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'PUT /integrations failed', { error });
    res.status(500).json({ success: false, error: 'Failed to update integration', timestamp: new Date() });
  }
});

// ============================================================
// DELETE /api/integrations/:id — remover integração
// ============================================================
router.delete('/integrations/:id', requireAdminKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required', timestamp: new Date() });
    }

    const deleted = webhookService.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Integration not found', timestamp: new Date() });
    }

    await saveIntegrations();
    logService.info('SYSTEM', 'Integration deleted', { id });

    res.json({ success: true, data: { id }, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /integrations failed', { error });
    res.status(500).json({ success: false, error: 'Failed to delete integration', timestamp: new Date() });
  }
});

// ============================================================
// POST /api/integrations/:id/test — testar conectividade
// ============================================================
router.post('/integrations/:id/test', requireAdminKey, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id is required', timestamp: new Date() });
    }

    const integration = webhookService.getAll().find(i => i.id === id);
    if (!integration) {
      return res.status(404).json({ success: false, error: 'Integration not found', timestamp: new Date() });
    }

    const result = await webhookService.test(integration);
    logService.info('SYSTEM', 'Integration test', { id, result });

    const status = result.ok ? 200 : 502;
    res.status(status).json({ success: result.ok, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /integrations/test failed', { error });
    res.status(500).json({ success: false, error: 'Test failed', timestamp: new Date() });
  }
});

// ============================================================
// POST /api/integrations/test-url — testar URL avulsa (antes de salvar)
// ============================================================
router.post('/integrations/test-url', requireAdminKey, async (req, res) => {
  try {
    const { url, type } = req.body as { url?: string; type?: string };
    if (!url || !type) {
      return res.status(400).json({ success: false, error: 'url and type are required', timestamp: new Date() });
    }

    const schema = z.string().url();
    const parsed = schema.safeParse(url);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid URL format', timestamp: new Date() });
    }

    const temp: import('../services/webhook.service.js').Integration = {
      id: 'test',
      name: 'Test',
      type: (type as import('../services/webhook.service.js').IntegrationType) || 'webhook',
      url,
      enabled: true,
      events: [],
      createdAt: new Date().toISOString(),
      successCount: 0,
      errorCount: 0,
    };

    const result = await webhookService.test(temp);
    res.status(result.ok ? 200 : 502).json({ success: result.ok, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /integrations/test-url failed', { error });
    res.status(500).json({ success: false, error: 'Test failed', timestamp: new Date() });
  }
});

export default router;
