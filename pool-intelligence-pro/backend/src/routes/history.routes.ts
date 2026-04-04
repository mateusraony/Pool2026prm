import { Router } from 'express';
import { getPrisma } from './prisma.js';
import { logService } from '../services/log.service.js';
import { z } from 'zod';
import { validate } from './validation.js';

const prisma = getPrisma();
const router = Router();

// Schema for creating history entries
const historyCreateSchema = z.object({
  poolId: z.string().min(1),
  chain: z.string().min(1),
  poolAddress: z.string().min(1),
  token0: z.string().min(1),
  token1: z.string().min(1),
  type: z.enum(['ENTRY', 'EXIT', 'REBALANCE', 'FEE_COLLECT']),
  mode: z.enum(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).optional(),
  capital: z.number().optional(),
  pnl: z.number().optional(),
  rangeLower: z.number().optional(),
  rangeUpper: z.number().optional(),
  price: z.number().optional(),
  note: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// GET /api/history — list position history with optional filters
router.get('/history', async (req, res) => {
  try {
    const { poolId, chain, type, limit: limitStr = '100', offset: offsetStr = '0' } = req.query;
    const limParsedH = parseInt(limitStr as string, 10);
    const limit = Math.min((!Number.isNaN(limParsedH) && limParsedH > 0) ? limParsedH : 100, 500);
    const offParsedH = parseInt(offsetStr as string, 10);
    const offset = (!Number.isNaN(offParsedH) && offParsedH >= 0) ? offParsedH : 0;

    const where: Record<string, unknown> = {};
    if (poolId) where.poolId = poolId;
    if (chain) where.chain = chain;
    if (type) where.type = type;

    const [entries, total] = await Promise.all([
      prisma.positionHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.positionHistory.count({ where }),
    ]);

    res.json({
      success: true,
      data: entries,
      total,
      limit,
      offset,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /history failed', { error });
    // Graceful: return empty if DB not available
    res.json({ success: true, data: [], total: 0, timestamp: new Date(), note: 'History not available (DB)' });
  }
});

// POST /api/history — create history entry
router.post('/history', validate(historyCreateSchema), async (req, res) => {
  try {
    const entry = await prisma.positionHistory.create({
      data: req.body,
    });

    logService.info('HISTORY', `Created ${req.body.type} entry for ${req.body.poolId}`);
    res.status(201).json({ success: true, data: entry, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /history failed', { error });
    res.status(500).json({ success: false, error: 'Failed to create history entry' });
  }
});

// DELETE /api/history/:id — delete single entry
router.delete('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
      return res.status(400).json({ success: false, error: 'Invalid id format' });
    }

    await prisma.positionHistory.delete({ where: { id } });
    res.json({ success: true, message: 'Deleted', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /history failed', { error });
    res.status(404).json({ success: false, error: 'Entry not found' });
  }
});

// GET /api/history/stats — aggregated stats
router.get('/history/stats', async (req, res) => {
  try {
    const [totalEntries, totalPnl, byType] = await Promise.all([
      prisma.positionHistory.count(),
      prisma.positionHistory.aggregate({ _sum: { pnl: true } }),
      prisma.positionHistory.groupBy({
        by: ['type'],
        _count: true,
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalEntries,
        totalPnl: totalPnl._sum.pnl || 0,
        byType: byType.reduce((acc, g) => ({ ...acc, [g.type]: g._count }), {}),
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /history/stats failed', { error });
    res.json({ success: true, data: { totalEntries: 0, totalPnl: 0, byType: {} }, timestamp: new Date() });
  }
});

export default router;
