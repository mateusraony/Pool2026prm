import { Router, Request, Response } from 'express';
import { prisma } from '../../database/client.js';
import { log } from '../../utils/logger.js';

const router = Router();

// GET /api/history - Lista histórico de ações
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      poolId,
      positionId,
      action,
      startDate,
      endDate,
      limit = '50',
      offset = '0',
    } = req.query;

    const where: Record<string, unknown> = {};

    if (poolId) {
      where.poolId = poolId;
    }

    if (positionId) {
      where.positionId = positionId;
    }

    if (action) {
      where.action = action;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        (where.createdAt as Record<string, unknown>).gte = new Date(startDate as string);
      }
      if (endDate) {
        (where.createdAt as Record<string, unknown>).lte = new Date(endDate as string);
      }
    }

    const [entries, total] = await Promise.all([
      prisma.historyEntry.findMany({
        where,
        include: {
          pool: {
            select: {
              network: true,
              token0Symbol: true,
              token1Symbol: true,
              feeTier: true,
            },
          },
          position: {
            select: {
              isSimulation: true,
              capitalUsd: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.historyEntry.count({ where }),
    ]);

    res.json({
      entries: entries.map(entry => ({
        id: entry.id,
        poolId: entry.poolId,
        positionId: entry.positionId,
        action: entry.action,
        details: entry.details,
        createdAt: entry.createdAt,
        pool: entry.pool ? {
          network: entry.pool.network,
          pair: `${entry.pool.token0Symbol}/${entry.pool.token1Symbol}`,
          feeTier: entry.pool.feeTier,
        } : null,
        position: entry.position ? {
          isSimulation: entry.position.isSimulation,
          capitalUsd: Number(entry.position.capitalUsd),
          status: entry.position.status,
        } : null,
      })),
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + entries.length < total,
      },
    });
  } catch (error) {
    log.error('Failed to get history', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/history/stats - Estatísticas do histórico
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string);
    const startDate = new Date(Date.now() - daysNum * 24 * 60 * 60 * 1000);

    // Agrupa por ação
    const actionCounts = await prisma.historyEntry.groupBy({
      by: ['action'],
      where: {
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    // Agrupa por dia
    const entries = await prisma.historyEntry.findMany({
      where: {
        createdAt: { gte: startDate },
      },
      select: {
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Agrupa por dia
    const byDay: Record<string, { total: number; byAction: Record<string, number> }> = {};
    for (const entry of entries) {
      const day = entry.createdAt.toISOString().split('T')[0];
      if (!byDay[day]) {
        byDay[day] = { total: 0, byAction: {} };
      }
      byDay[day].total++;
      byDay[day].byAction[entry.action] = (byDay[day].byAction[entry.action] || 0) + 1;
    }

    res.json({
      period: {
        start: startDate,
        end: new Date(),
        days: daysNum,
      },
      summary: {
        totalEntries: entries.length,
        byAction: Object.fromEntries(
          actionCounts.map(a => [a.action, a._count])
        ),
      },
      daily: Object.entries(byDay).map(([date, data]) => ({
        date,
        ...data,
      })),
    });
  } catch (error) {
    log.error('Failed to get history stats', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/history/pool/:poolId/timeline - Timeline de uma pool específica
router.get('/pool/:poolId/timeline', async (req: Request, res: Response) => {
  try {
    const { poolId } = req.params;

    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }

    const entries = await prisma.historyEntry.findMany({
      where: { poolId },
      include: {
        position: {
          select: {
            isSimulation: true,
            capitalUsd: true,
            pnlUsd: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Agrupa por posição
    const positions: Record<string, {
      positionId: string;
      isSimulation: boolean;
      timeline: typeof entries;
    }> = {};

    for (const entry of entries) {
      if (entry.positionId) {
        if (!positions[entry.positionId]) {
          positions[entry.positionId] = {
            positionId: entry.positionId,
            isSimulation: entry.position?.isSimulation ?? true,
            timeline: [],
          };
        }
        positions[entry.positionId].timeline.push(entry);
      }
    }

    res.json({
      pool: {
        id: pool.id,
        network: pool.network,
        pair: `${pool.token0Symbol}/${pool.token1Symbol}`,
        feeTier: pool.feeTier,
      },
      positions: Object.values(positions).map(p => ({
        positionId: p.positionId,
        isSimulation: p.isSimulation,
        timeline: p.timeline.map(e => ({
          action: e.action,
          details: e.details,
          createdAt: e.createdAt,
        })),
      })),
      unlinkedEntries: entries
        .filter(e => !e.positionId)
        .map(e => ({
          action: e.action,
          details: e.details,
          createdAt: e.createdAt,
        })),
    });
  } catch (error) {
    log.error('Failed to get pool timeline', { error, poolId: req.params.poolId });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
