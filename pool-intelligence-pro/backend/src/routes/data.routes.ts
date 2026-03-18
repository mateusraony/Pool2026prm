import { Router } from 'express';
import { logService } from '../services/log.service.js';
import {
  getWatchlist, addToWatchlist, removeFromWatchlist,
} from '../jobs/index.js';
import {
  validate, validatePoolIdParam, validateIdParam,
  watchlistSchema, favoriteSchema, noteSchema,
} from './validation.js';
import { getPrisma } from './prisma.js';

const router = Router();

// ============================================
// WATCHLIST
// ============================================

router.get('/watchlist', async (req, res) => {
  try {
    const watchlist = getWatchlist();
    res.json({ success: true, data: watchlist, count: watchlist.length, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /watchlist failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.post('/watchlist', validate(watchlistSchema), async (req, res) => {
  try {
    const { poolId, chain, address } = req.body;
    addToWatchlist({ poolId, chain, address });
    res.json({ success: true, message: 'Added to watchlist', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /watchlist failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/watchlist/:poolId', validatePoolIdParam, async (req, res) => {
  try {
    const { poolId } = req.params;
    removeFromWatchlist(poolId);
    res.json({ success: true, message: 'Removed from watchlist', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /watchlist/:poolId failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// FAVORITES
// ============================================

router.get('/favorites', async (req, res) => {
  try {
    const favorites = await getPrisma().favorite.findMany({ orderBy: { addedAt: 'desc' } });
    res.json({ success: true, data: favorites });
  } catch (error) {
    logService.warn('SYSTEM', 'GET /favorites - DB unavailable, returning empty', { error });
    res.json({ success: true, data: [], note: 'Database não configurada ou tabela não existe' });
  }
});

router.post('/favorites', validate(favoriteSchema), async (req, res) => {
  try {
    const { poolId, chain, poolAddress, token0Symbol, token1Symbol, protocol } = req.body;
    const fav = await getPrisma().favorite.upsert({
      where: { poolId },
      create: { poolId, chain, poolAddress, token0Symbol, token1Symbol, protocol },
      update: { addedAt: new Date() },
    });
    res.json({ success: true, data: fav });
  } catch (error) {
    logService.error('SYSTEM', 'POST /favorites failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/favorites/:poolId', validatePoolIdParam, async (req, res) => {
  try {
    const { poolId } = req.params;
    await getPrisma().favorite.deleteMany({ where: { poolId } });
    res.json({ success: true });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /favorites failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// NOTES
// ============================================

router.get('/notes', async (req, res) => {
  try {
    const { poolId } = req.query;
    const where = poolId ? { poolId: poolId as string } : {};
    const notes = await getPrisma().note.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: notes });
  } catch (error) {
    logService.error('SYSTEM', 'GET /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.post('/notes', validate(noteSchema), async (req, res) => {
  try {
    const { poolId, text, tags } = req.body;
    const note = await getPrisma().note.create({ data: { poolId, text, tags } });
    res.json({ success: true, data: note });
  } catch (error) {
    logService.error('SYSTEM', 'POST /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/notes/:id', validateIdParam, async (req, res) => {
  try {
    await getPrisma().note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /notes/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// LOGS
// ============================================

router.get('/logs', async (req, res) => {
  const { level, component, limit } = req.query;
  const logs = logService.getRecentLogs(
    (() => { const p = parseInt(limit as string, 10); return (!Number.isNaN(p) && p > 0) ? Math.min(p, 1000) : 100; })(),
    level as any,
    component as any
  );
  res.json({ success: true, data: logs, count: logs.length, timestamp: new Date() });
});

export default router;
