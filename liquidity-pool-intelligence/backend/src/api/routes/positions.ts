import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { assessPositionRisk } from '../../services/analysis/riskEngine.js';
import { log } from '../../utils/logger.js';

const router = Router();

// Schema de validação para criar posição
const createPositionSchema = z.object({
  poolId: z.string().min(1),
  isSimulation: z.boolean().default(true),
  priceLower: z.number().positive(),
  priceUpper: z.number().positive(),
  capitalUsd: z.number().positive(),
  notes: z.string().optional(),
  tokenId: z.string().optional(),
  walletAddress: z.string().optional(),
});

// Schema para atualizar posição
const updatePositionSchema = z.object({
  priceLower: z.number().positive().optional(),
  priceUpper: z.number().positive().optional(),
  capitalUsd: z.number().positive().optional(),
  status: z.enum(['ACTIVE', 'ATTENTION', 'CRITICAL', 'CLOSED']).optional(),
  notes: z.string().optional(),
});

// GET /api/positions - Lista todas as posições
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, isSimulation, poolId } = req.query;

    const where: Record<string, unknown> = {};

    if (status) {
      where.status = status;
    }

    if (isSimulation !== undefined) {
      where.isSimulation = isSimulation === 'true';
    }

    if (poolId) {
      where.poolId = poolId;
    }

    const positions = await prisma.position.findMany({
      where,
      include: {
        pool: {
          select: {
            network: true,
            dex: true,
            token0Symbol: true,
            token1Symbol: true,
            feeTier: true,
            currentPrice: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Calcula resumo
    let totalCapital = new Decimal(0);
    let totalFees = new Decimal(0);
    let totalIL = new Decimal(0);
    let totalPnL = new Decimal(0);
    const byStatus = { active: 0, attention: 0, critical: 0, closed: 0 };
    const byNetwork: Record<string, number> = {};

    for (const pos of positions) {
      const capital = new Decimal(pos.capitalUsd.toString());
      totalCapital = totalCapital.add(capital);
      totalFees = totalFees.add(new Decimal(pos.feesAccrued.toString()));
      totalIL = totalIL.add(new Decimal(pos.ilAccrued.toString()));
      totalPnL = totalPnL.add(new Decimal(pos.pnlUsd.toString()));

      byStatus[pos.status.toLowerCase() as keyof typeof byStatus]++;

      const network = pos.pool.network;
      byNetwork[network] = (byNetwork[network] || 0) + 1;
    }

    res.json({
      positions: positions.map(pos => ({
        id: pos.id,
        poolId: pos.poolId,
        tokenId: pos.tokenId,
        walletAddress: pos.walletAddress,
        isSimulation: pos.isSimulation,
        priceLower: pos.priceLower.toString(),
        priceUpper: pos.priceUpper.toString(),
        capitalUsd: Number(pos.capitalUsd),
        status: pos.status,
        feesAccrued: Number(pos.feesAccrued),
        ilAccrued: Number(pos.ilAccrued),
        pnlUsd: Number(pos.pnlUsd),
        entryDate: pos.entryDate,
        exitDate: pos.exitDate,
        lastSyncAt: pos.lastSyncAt,
        notes: pos.notes,
        pool: {
          network: pos.pool.network,
          dex: pos.pool.dex,
          token0Symbol: pos.pool.token0Symbol,
          token1Symbol: pos.pool.token1Symbol,
          feeTier: pos.pool.feeTier,
          currentPrice: pos.pool.currentPrice.toString(),
        },
      })),
      summary: {
        totalPositions: positions.length,
        activePositions: byStatus.active + byStatus.attention + byStatus.critical,
        simulatedPositions: positions.filter(p => p.isSimulation).length,
        realPositions: positions.filter(p => !p.isSimulation).length,
        totalCapitalUsd: Number(totalCapital),
        totalFeesAccrued: Number(totalFees),
        totalILAccrued: Number(totalIL),
        totalPnLUsd: Number(totalPnL),
        positionsByStatus: byStatus,
        positionsByNetwork: byNetwork,
      },
    });
  } catch (error) {
    log.error('Failed to get positions', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/positions/:id - Detalhes de uma posição
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        pool: true,
        history: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Calcula métricas de performance
    const daysActive = Math.max(
      1,
      Math.floor(
        (Date.now() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    const capital = new Decimal(position.capitalUsd.toString());
    const fees = new Decimal(position.feesAccrued.toString());
    const il = new Decimal(position.ilAccrued.toString());
    const pnl = new Decimal(position.pnlUsd.toString());

    const feesPerDay = fees.div(daysActive);
    const ilPerDay = il.div(daysActive);
    const netPnLPerDay = pnl.div(daysActive);
    const projectedMonthlyReturn = netPnLPerDay.mul(30).div(capital).mul(100);

    // Calcula tempo no range (simplificado)
    const currentPrice = new Decimal(position.pool.currentPrice.toString());
    const priceLower = new Decimal(position.priceLower.toString());
    const priceUpper = new Decimal(position.priceUpper.toString());
    const inRange = currentPrice.gte(priceLower) && currentPrice.lte(priceUpper);

    res.json({
      position: {
        id: position.id,
        poolId: position.poolId,
        tokenId: position.tokenId,
        walletAddress: position.walletAddress,
        isSimulation: position.isSimulation,
        priceLower: position.priceLower.toString(),
        priceUpper: position.priceUpper.toString(),
        capitalUsd: Number(position.capitalUsd),
        status: position.status,
        feesAccrued: Number(position.feesAccrued),
        ilAccrued: Number(position.ilAccrued),
        pnlUsd: Number(position.pnlUsd),
        entryDate: position.entryDate,
        exitDate: position.exitDate,
        lastSyncAt: position.lastSyncAt,
        notes: position.notes,
      },
      pool: {
        id: position.pool.id,
        network: position.pool.network,
        dex: position.pool.dex,
        token0Symbol: position.pool.token0Symbol,
        token1Symbol: position.pool.token1Symbol,
        feeTier: position.pool.feeTier,
        currentPrice: position.pool.currentPrice.toString(),
        tvlUsd: Number(position.pool.tvlUsd),
      },
      performance: {
        daysActive,
        inRange,
        feesPerDay: Number(feesPerDay),
        ilPerDay: Number(ilPerDay),
        netPnLPerDay: Number(netPnLPerDay),
        projectedMonthlyReturn: Number(projectedMonthlyReturn),
      },
      history: position.history.map(h => ({
        action: h.action,
        details: h.details,
        createdAt: h.createdAt,
      })),
    });
  } catch (error) {
    log.error('Failed to get position details', { error, positionId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/positions - Cria nova posição
router.post('/', async (req: Request, res: Response) => {
  try {
    const validation = createPositionSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const data = validation.data;

    // Verifica se a pool existe
    const pool = await prisma.pool.findUnique({
      where: { id: data.poolId },
    });

    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }

    // Avalia risco
    const riskAssessment = await assessPositionRisk(
      {
        id: pool.id,
        network: pool.network,
        dex: pool.dex,
        address: pool.address,
        token0: {
          address: pool.token0Address,
          symbol: pool.token0Symbol,
          decimals: pool.token0Decimals,
        },
        token1: {
          address: pool.token1Address,
          symbol: pool.token1Symbol,
          decimals: pool.token1Decimals,
        },
        feeTier: pool.feeTier,
        tvlUsd: new Decimal(pool.tvlUsd.toString()),
        volume24hUsd: new Decimal(pool.volume24hUsd.toString()),
        volume7dUsd: new Decimal(pool.volume7dUsd.toString()),
        currentPrice: new Decimal(pool.currentPrice.toString()),
        pairType: pool.pairType as 'stable_stable' | 'bluechip_stable' | 'altcoin_stable' | 'other',
      },
      new Decimal(data.capitalUsd)
    );

    // Se não permitido e não é simulação, bloqueia
    if (!riskAssessment.allowed && !data.isSimulation) {
      res.status(400).json({
        error: 'Position not allowed',
        warnings: riskAssessment.warnings,
        errors: riskAssessment.errors,
        reason: riskAssessment.reason,
      });
      return;
    }

    // Cria posição
    const position = await prisma.position.create({
      data: {
        poolId: data.poolId,
        isSimulation: data.isSimulation,
        priceLower: data.priceLower,
        priceUpper: data.priceUpper,
        capitalUsd: riskAssessment.adjustedCapital
          ? Number(riskAssessment.adjustedCapital)
          : data.capitalUsd,
        entryPrice: pool.currentPrice,
        notes: data.notes,
        tokenId: data.tokenId,
        walletAddress: data.walletAddress,
        status: 'ACTIVE',
      },
      include: {
        pool: {
          select: {
            network: true,
            token0Symbol: true,
            token1Symbol: true,
          },
        },
      },
    });

    // Registra no histórico
    await prisma.historyEntry.create({
      data: {
        poolId: data.poolId,
        positionId: position.id,
        action: 'ENTRY',
        details: {
          isSimulation: data.isSimulation,
          capitalUsd: Number(position.capitalUsd),
          priceLower: data.priceLower,
          priceUpper: data.priceUpper,
          entryPrice: pool.currentPrice.toString(),
          riskWarnings: riskAssessment.warnings,
        },
      },
    });

    log.info('Position created', {
      positionId: position.id,
      poolId: data.poolId,
      isSimulation: data.isSimulation,
    });

    res.status(201).json({
      position: {
        id: position.id,
        poolId: position.poolId,
        isSimulation: position.isSimulation,
        priceLower: position.priceLower.toString(),
        priceUpper: position.priceUpper.toString(),
        capitalUsd: Number(position.capitalUsd),
        status: position.status,
        entryDate: position.entryDate,
      },
      riskWarnings: riskAssessment.warnings,
    });
  } catch (error) {
    log.error('Failed to create position', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/positions/:id - Atualiza posição
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validation = updatePositionSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const data = validation.data;

    const existing = await prisma.position.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Atualiza posição
    const updated = await prisma.position.update({
      where: { id },
      data: {
        ...(data.priceLower !== undefined && { priceLower: data.priceLower }),
        ...(data.priceUpper !== undefined && { priceUpper: data.priceUpper }),
        ...(data.capitalUsd !== undefined && { capitalUsd: data.capitalUsd }),
        ...(data.status && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.status === 'CLOSED' && { exitDate: new Date() }),
      },
    });

    // Registra mudança no histórico
    const changes = Object.entries(data).filter(([_, v]) => v !== undefined);
    if (changes.length > 0) {
      await prisma.historyEntry.create({
        data: {
          poolId: existing.poolId,
          positionId: id,
          action: data.status === 'CLOSED' ? 'EXIT' : 'REBALANCE',
          details: {
            changes: Object.fromEntries(changes),
            previousValues: {
              priceLower: existing.priceLower.toString(),
              priceUpper: existing.priceUpper.toString(),
              capitalUsd: Number(existing.capitalUsd),
              status: existing.status,
            },
          },
        },
      });
    }

    res.json({
      position: {
        id: updated.id,
        poolId: updated.poolId,
        isSimulation: updated.isSimulation,
        priceLower: updated.priceLower.toString(),
        priceUpper: updated.priceUpper.toString(),
        capitalUsd: Number(updated.capitalUsd),
        status: updated.status,
        exitDate: updated.exitDate,
      },
    });
  } catch (error) {
    log.error('Failed to update position', { error, positionId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/positions/:id - Remove posição (apenas simuladas)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.position.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    if (!existing.isSimulation) {
      res.status(400).json({
        error: 'Cannot delete real positions',
        message: 'Use PUT to mark as CLOSED instead',
      });
      return;
    }

    await prisma.position.delete({
      where: { id },
    });

    log.info('Position deleted', { positionId: id });

    res.json({ message: 'Position deleted successfully' });
  } catch (error) {
    log.error('Failed to delete position', { error, positionId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
