/**
 * Testes ETAPA 14 — webhook.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webhookService, Integration } from '../services/webhook.service.js';

const makeIntegration = (overrides: Partial<Integration> = {}): Integration => ({
  id: 'test-1',
  type: 'webhook',
  name: 'Test Webhook',
  url: 'https://example.com/hook',
  enabled: true,
  events: [],
  createdAt: new Date().toISOString(),
  successCount: 0,
  errorCount: 0,
  ...overrides,
});

describe('WebhookService — upsert / getAll / delete', () => {
  beforeEach(() => {
    webhookService.setIntegrations([]);
  });

  it('inicia com lista vazia após setIntegrations([])', () => {
    expect(webhookService.getAll()).toHaveLength(0);
  });

  it('upsert adiciona integração', () => {
    const i = makeIntegration({ id: 'abc' });
    webhookService.upsert(i);
    expect(webhookService.getAll()).toHaveLength(1);
    expect(webhookService.getAll()[0].id).toBe('abc');
  });

  it('upsert atualiza integração existente', () => {
    const i = makeIntegration({ id: 'abc', name: 'Antes' });
    webhookService.upsert(i);
    webhookService.upsert({ ...i, name: 'Depois' });
    const all = webhookService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Depois');
  });

  it('delete remove integração existente', () => {
    webhookService.upsert(makeIntegration({ id: 'x1' }));
    webhookService.upsert(makeIntegration({ id: 'x2' }));
    const removed = webhookService.delete('x1');
    expect(removed).toBe(true);
    expect(webhookService.getAll()).toHaveLength(1);
    expect(webhookService.getAll()[0].id).toBe('x2');
  });

  it('delete retorna false para id inexistente', () => {
    const removed = webhookService.delete('nao-existe');
    expect(removed).toBe(false);
  });

  it('setIntegrations substitui lista completamente', () => {
    webhookService.upsert(makeIntegration({ id: 'old' }));
    webhookService.setIntegrations([makeIntegration({ id: 'new1' }), makeIntegration({ id: 'new2' })]);
    const all = webhookService.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(i => i.id)).toEqual(['new1', 'new2']);
  });
});

describe('WebhookService — dispatch filtros', () => {
  beforeEach(() => {
    webhookService.setIntegrations([]);
  });

  it('dispatch não envia para integração desabilitada', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    webhookService.upsert(makeIntegration({ id: 'disabled', enabled: false }));
    await webhookService.dispatch({
      type: 'NEW_RECOMMENDATION',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('dispatch envia para integração habilitada sem filtro de eventos', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 204 } as Response);

    webhookService.upsert(makeIntegration({ id: 'enabled', enabled: true, events: [] }));
    await webhookService.dispatch({
      type: 'OUT_OF_RANGE',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('dispatch respeita filtro de eventos (evento incluído)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    webhookService.upsert(makeIntegration({ id: 'filtered', enabled: true, events: ['OUT_OF_RANGE'] }));
    await webhookService.dispatch({
      type: 'OUT_OF_RANGE',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  it('dispatch respeita filtro de eventos (evento excluído)', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    webhookService.upsert(makeIntegration({ id: 'filtered', enabled: true, events: ['OUT_OF_RANGE'] }));
    await webhookService.dispatch({
      type: 'NEW_RECOMMENDATION',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('WebhookService — test()', () => {
  it('retorna ok=true quando fetch retorna ok', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    const integration = makeIntegration({ type: 'discord' });
    const result = await webhookService.test(integration);

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    fetchSpy.mockRestore();
  });

  it('retorna ok=false quando fetch retorna status 400', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);

    const integration = makeIntegration({ type: 'slack' });
    const result = await webhookService.test(integration);

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(400);
    fetchSpy.mockRestore();
  });

  it('retorna ok=false com error quando fetch lança exceção', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const integration = makeIntegration({ type: 'webhook' });
    const result = await webhookService.test(integration);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Network error');
    fetchSpy.mockRestore();
  });
});

describe('WebhookService — contadores', () => {
  beforeEach(() => {
    webhookService.setIntegrations([]);
  });

  it('incrementa successCount após dispatch com sucesso', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);

    const integration = makeIntegration({ id: 'cnt', enabled: true, events: [] });
    webhookService.upsert(integration);

    await webhookService.dispatch({
      type: 'NEW_RECOMMENDATION',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    const updated = webhookService.getAll().find(i => i.id === 'cnt');
    expect(updated?.successCount).toBe(1);
    vi.restoreAllMocks();
  });

  it('incrementa errorCount após dispatch com falha HTTP', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 502 } as Response);

    const integration = makeIntegration({ id: 'cnt-err', enabled: true, events: [] });
    webhookService.upsert(integration);

    await webhookService.dispatch({
      type: 'OUT_OF_RANGE',
      message: 'test',
      data: {},
      timestamp: new Date(),
    });

    const updated = webhookService.getAll().find(i => i.id === 'cnt-err');
    expect(updated?.errorCount).toBe(1);
    expect(updated?.lastError).toBe('HTTP 502');
    vi.restoreAllMocks();
  });
});
