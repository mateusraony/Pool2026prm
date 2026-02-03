import { Router, Request, Response } from 'express';
import poolsRouter from './pools.js';
import positionsRouter from './positions.js';
import settingsRouter from './settings.js';
import historyRouter from './history.js';
import webhookRouter from './webhook.js';
import { prisma, checkDatabaseHealth } from '../../database/client.js';
import { testGraphConnection } from '../../services/graph/client.js';
import { testTelegramConnection } from '../../services/telegram/bot.js';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

const router = Router();

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();

  res.json({
    status: dbHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      database: dbHealthy ? 'ok' : 'error',
      telegram: config.telegram.enabled ? 'configured' : 'disabled',
    },
    version: '1.0.0',
  });
});

// Status detalhado (para debug)
router.get('/status', async (req: Request, res: Response) => {
  try {
    const [
      dbHealth,
      poolCount,
      positionCount,
      alertCount,
    ] = await Promise.all([
      checkDatabaseHealth(),
      prisma.pool.count(),
      prisma.position.count({ where: { status: 'ACTIVE' } }),
      prisma.alert.count({ where: { acknowledged: false } }),
    ]);

    // Testa conexões externas
    const graphTests: Record<string, boolean> = {};
    for (const network of config.enabledNetworks) {
      graphTests[network] = await testGraphConnection(network);
    }

    const telegramOk = await testTelegramConnection();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.env,
      database: {
        connected: dbHealth,
        pools: poolCount,
        activePositions: positionCount,
        pendingAlerts: alertCount,
      },
      externalServices: {
        theGraph: graphTests,
        telegram: {
          enabled: config.telegram.enabled,
          connected: telegramOk,
        },
      },
      config: {
        enabledNetworks: config.enabledNetworks,
        monitoredWallets: config.monitoredWallets.length,
        schedulerIntervals: {
          scan: `${config.scheduler.scanIntervalMinutes}min`,
          prices: `${config.scheduler.priceUpdateMinutes}min`,
          sync: `${config.scheduler.positionSyncMinutes}min`,
          alerts: `${config.scheduler.alertCheckMinutes}min`,
        },
      },
    });
  } catch (error) {
    log.error('Status check failed', { error });
    res.status(500).json({ error: 'Status check failed' });
  }
});

// Monta rotas
router.use('/pools', poolsRouter);
router.use('/positions', positionsRouter);
router.use('/settings', settingsRouter);
router.use('/history', historyRouter);
router.use('/webhook', webhookRouter);

// Rota de alerts
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { type, severity, acknowledged, limit = '20' } = req.query;

    const where: Record<string, unknown> = {};

    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (acknowledged !== undefined) where.acknowledged = acknowledged === 'true';

    const alerts = await prisma.alert.findMany({
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
      },
      orderBy: { sentAt: 'desc' },
      take: parseInt(limit as string),
    });

    const unacknowledgedCount = await prisma.alert.count({
      where: { acknowledged: false },
    });

    res.json({
      alerts: alerts.map(a => ({
        id: a.id,
        poolId: a.poolId,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        data: a.data,
        sentAt: a.sentAt,
        acknowledged: a.acknowledged,
        pool: a.pool ? {
          network: a.pool.network,
          pair: `${a.pool.token0Symbol}/${a.pool.token1Symbol}`,
          feeTier: a.pool.feeTier,
        } : null,
      })),
      unacknowledgedCount,
    });
  } catch (error) {
    log.error('Failed to get alerts', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Marca alerta como lido
router.put('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.alert.update({
      where: { id },
      data: { acknowledged: true },
    });

    res.json({ message: 'Alert acknowledged' });
  } catch (error) {
    log.error('Failed to acknowledge alert', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard summary
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });

    const [
      activePositions,
      recentAlerts,
      topPools,
    ] = await Promise.all([
      prisma.position.findMany({
        where: { status: { in: ['ACTIVE', 'ATTENTION', 'CRITICAL'] } },
        include: {
          pool: {
            select: {
              network: true,
              token0Symbol: true,
              token1Symbol: true,
              currentPrice: true,
            },
          },
        },
      }),
      prisma.alert.findMany({
        where: { acknowledged: false },
        orderBy: { sentAt: 'desc' },
        take: 5,
      }),
      prisma.poolRange.findMany({
        where: { score: { gte: 60 } },
        include: {
          pool: {
            select: {
              id: true,
              network: true,
              token0Symbol: true,
              token1Symbol: true,
              tvlUsd: true,
              aprEstimate: true,
            },
          },
        },
        orderBy: { score: 'desc' },
        take: 5,
      }),
    ]);

    // Calcula totais
    let totalCapital = 0;
    let totalPnL = 0;
    let totalFees = 0;

    for (const pos of activePositions) {
      totalCapital += Number(pos.capitalUsd);
      totalPnL += Number(pos.pnlUsd);
      totalFees += Number(pos.feesAccrued);
    }

    res.json({
      settings: settings ? {
        totalBankroll: Number(settings.totalBankroll),
        riskProfile: settings.riskProfile,
        enabledNetworks: settings.enabledNetworks,
      } : null,
      portfolio: {
        totalCapitalDeployed: totalCapital,
        totalPnL,
        totalFeesAccrued: totalFees,
        activePositions: activePositions.length,
        positionsNeedingAttention: activePositions.filter(
          p => p.status === 'ATTENTION' || p.status === 'CRITICAL'
        ).length,
      },
      positions: activePositions.map(p => ({
        id: p.id,
        poolId: p.poolId,
        network: p.pool.network,
        pair: `${p.pool.token0Symbol}/${p.pool.token1Symbol}`,
        capitalUsd: Number(p.capitalUsd),
        pnlUsd: Number(p.pnlUsd),
        status: p.status,
        isSimulation: p.isSimulation,
      })),
      alerts: recentAlerts.map(a => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        title: a.title,
        sentAt: a.sentAt,
      })),
      opportunities: topPools.map(r => ({
        poolId: r.pool.id,
        network: r.pool.network,
        pair: `${r.pool.token0Symbol}/${r.pool.token1Symbol}`,
        score: r.score,
        netReturn7d: Number(r.netReturn7d),
        tvlUsd: Number(r.pool.tvlUsd),
      })),
    });
  } catch (error) {
    log.error('Failed to get dashboard', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
