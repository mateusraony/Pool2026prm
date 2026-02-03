import { Router, Request, Response } from 'express';
import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { fetchPoolComplete, fetchLiquidityDistribution } from '../../services/graph/uniswap.js';
import { calculateRanges } from '../../services/analysis/rangeCalculator.js';
import { runBacktest } from '../../services/analysis/backtest.js';
import { assessPositionRisk } from '../../services/analysis/riskEngine.js';
import { log } from '../../utils/logger.js';

const router = Router();

// GET /api/pools/recommended - Lista pools recomendadas
router.get('/recommended', async (req: Request, res: Response) => {
  try {
    const { network, pairType, limit = '20' } = req.query;

    // Busca pools com ranges calculados
    const where: Record<string, unknown> = {
      isActive: true,
      ranges: { some: {} },
    };

    if (network) {
      where.network = network;
    }

    if (pairType) {
      where.pairType = pairType;
    }

    const pools = await prisma.pool.findMany({
      where,
      include: {
        ranges: {
          orderBy: { score: 'desc' },
        },
      },
      orderBy: [
        { ranges: { _count: 'desc' } },
        { tvlUsd: 'desc' },
      ],
      take: parseInt(limit as string),
    });

    // Formata resposta
    const recommended = pools.map(pool => {
      const bestRange = pool.ranges[0];

      return {
        pool: {
          id: pool.id,
          network: pool.network,
          dex: pool.dex,
          token0Symbol: pool.token0Symbol,
          token1Symbol: pool.token1Symbol,
          feeTier: pool.feeTier,
          tvlUsd: Number(pool.tvlUsd),
          volume24hUsd: Number(pool.volume24hUsd),
          volume7dUsd: Number(pool.volume7dUsd),
          currentPrice: pool.currentPrice.toString(),
          aprEstimate: pool.aprEstimate ? Number(pool.aprEstimate) : null,
          pairType: pool.pairType,
          lastScannedAt: pool.lastScannedAt,
        },
        ranges: pool.ranges.map(r => ({
          rangeType: r.rangeType,
          priceLower: r.priceLower.toString(),
          priceUpper: r.priceUpper.toString(),
          score: r.score,
          feesEstimate7d: Number(r.feesEstimate7d),
          ilEstimate7d: Number(r.ilEstimate7d),
          gasEstimate: Number(r.gasEstimate),
          netReturn7d: Number(r.netReturn7d),
          timeInRange7d: Number(r.timeInRange7d),
          capitalPercent: Number(r.capitalPercent),
          capitalUsd: Number(r.capitalUsd),
          riskLevel: r.riskLevel,
          explanation: r.explanation,
        })),
        bestRange: bestRange ? {
          rangeType: bestRange.rangeType,
          score: bestRange.score,
          netReturn7d: Number(bestRange.netReturn7d),
          capitalUsd: Number(bestRange.capitalUsd),
          riskLevel: bestRange.riskLevel,
        } : null,
        overallScore: bestRange?.score || 0,
      };
    });

    // Ordena por score
    recommended.sort((a, b) => b.overallScore - a.overallScore);

    res.json({
      pools: recommended,
      totalCount: recommended.length,
      lastUpdated: pools[0]?.lastScannedAt || new Date(),
    });
  } catch (error) {
    log.error('Failed to get recommended pools', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/pools/:id - Detalhes de uma pool
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Busca pool no banco
    let pool = await prisma.pool.findUnique({
      where: { id },
      include: {
        ranges: true,
        positions: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    // Se não encontrou ou está desatualizada, busca dados frescos
    const needsRefresh = !pool ||
      (new Date().getTime() - pool.lastScannedAt.getTime()) > 30 * 60 * 1000;

    if (needsRefresh) {
      // Extrai network e address do ID
      const parts = id.split('_');
      if (parts.length < 3) {
        res.status(400).json({ error: 'Invalid pool ID format' });
        return;
      }

      const network = parts[0];
      const address = parts.slice(2).join('_');

      // Busca dados atualizados
      const freshData = await fetchPoolComplete(network, address);

      if (!freshData) {
        res.status(404).json({ error: 'Pool not found' });
        return;
      }

      // Atualiza banco
      pool = await prisma.pool.upsert({
        where: { id },
        update: {
          tvlUsd: freshData.tvlUsd,
          volume24hUsd: freshData.volume24hUsd,
          volume7dUsd: freshData.volume7dUsd,
          currentPrice: freshData.currentPrice,
          currentTick: freshData.currentTick,
          aprEstimate: freshData.aprEstimate,
          lastScannedAt: new Date(),
        },
        create: {
          id,
          network: freshData.network,
          dex: freshData.dex,
          address: freshData.address,
          token0Symbol: freshData.token0.symbol,
          token1Symbol: freshData.token1.symbol,
          token0Address: freshData.token0.address,
          token0Decimals: freshData.token0.decimals,
          token1Address: freshData.token1.address,
          token1Decimals: freshData.token1.decimals,
          feeTier: freshData.feeTier,
          tvlUsd: freshData.tvlUsd,
          volume24hUsd: freshData.volume24hUsd,
          volume7dUsd: freshData.volume7dUsd,
          currentPrice: freshData.currentPrice,
          currentTick: freshData.currentTick,
          aprEstimate: freshData.aprEstimate,
          pairType: freshData.pairType,
          lastScannedAt: new Date(),
        },
        include: {
          ranges: true,
          positions: {
            where: { status: 'ACTIVE' },
          },
        },
      });

      // Recalcula ranges
      const settings = await prisma.settings.findUnique({ where: { id: 1 } });
      if (settings) {
        await calculateRanges(freshData, settings.riskProfile);
        pool = await prisma.pool.findUnique({
          where: { id },
          include: {
            ranges: true,
            positions: {
              where: { status: 'ACTIVE' },
            },
          },
        });
      }
    }

    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }

    // Busca distribuição de liquidez para o gráfico
    let liquidityChart: { tickIdx: number; price: string; liquidityGross: string }[] = [];
    try {
      const distribution = await fetchLiquidityDistribution(
        pool.network,
        pool.address,
        pool.currentTick || 0,
        pool.token0Decimals,
        pool.token1Decimals
      );
      liquidityChart = distribution.map(t => ({
        tickIdx: t.tickIdx,
        price: t.price.toString(),
        liquidityGross: t.liquidityGross.toString(),
      }));
    } catch {
      log.warn('Failed to fetch liquidity distribution', { poolId: id });
    }

    res.json({
      pool: {
        id: pool.id,
        network: pool.network,
        dex: pool.dex,
        address: pool.address,
        token0Symbol: pool.token0Symbol,
        token1Symbol: pool.token1Symbol,
        token0Address: pool.token0Address,
        token1Address: pool.token1Address,
        feeTier: pool.feeTier,
        tvlUsd: Number(pool.tvlUsd),
        volume24hUsd: Number(pool.volume24hUsd),
        volume7dUsd: Number(pool.volume7dUsd),
        currentPrice: pool.currentPrice.toString(),
        currentTick: pool.currentTick,
        aprEstimate: pool.aprEstimate ? Number(pool.aprEstimate) : null,
        pairType: pool.pairType,
        lastScannedAt: pool.lastScannedAt,
      },
      ranges: pool.ranges.map(r => ({
        rangeType: r.rangeType,
        priceLower: r.priceLower.toString(),
        priceUpper: r.priceUpper.toString(),
        tickLower: r.tickLower,
        tickUpper: r.tickUpper,
        score: r.score,
        feesEstimate7d: Number(r.feesEstimate7d),
        ilEstimate7d: Number(r.ilEstimate7d),
        gasEstimate: Number(r.gasEstimate),
        netReturn7d: Number(r.netReturn7d),
        timeInRange7d: Number(r.timeInRange7d),
        capitalPercent: Number(r.capitalPercent),
        capitalUsd: Number(r.capitalUsd),
        riskLevel: r.riskLevel,
        explanation: r.explanation,
      })),
      liquidityChart,
      hasActivePosition: pool.positions.length > 0,
      activePositions: pool.positions.map(p => ({
        id: p.id,
        isSimulation: p.isSimulation,
        capitalUsd: Number(p.capitalUsd),
        status: p.status,
      })),
    });
  } catch (error) {
    log.error('Failed to get pool details', { error, poolId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pools/:id/backtest - Roda backtest para um range customizado
router.post('/:id/backtest', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { priceLower, priceUpper, capitalUsd, period = '7d' } = req.body;

    if (!priceLower || !priceUpper || !capitalUsd) {
      res.status(400).json({
        error: 'Missing required fields: priceLower, priceUpper, capitalUsd',
      });
      return;
    }

    // Busca dados da pool
    const pool = await prisma.pool.findUnique({
      where: { id },
    });

    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }

    // Busca dados completos para backtest
    const fullPoolData = await fetchPoolComplete(pool.network, pool.address);

    if (!fullPoolData) {
      res.status(404).json({ error: 'Failed to fetch pool data' });
      return;
    }

    // Roda backtest
    const result = runBacktest({
      pool: fullPoolData,
      priceLower: new Decimal(priceLower),
      priceUpper: new Decimal(priceUpper),
      capitalUsd: new Decimal(capitalUsd),
      period: period as '7d' | '30d',
    });

    res.json({
      backtest: {
        period: result.period,
        startDate: result.startDate,
        endDate: result.endDate,
        metrics: {
          timeInRange: Number(result.metrics.timeInRange),
          totalFees: Number(result.metrics.totalFees),
          totalIL: Number(result.metrics.totalIL),
          netPnL: Number(result.metrics.netPnL),
          netPnLPercent: Number(result.metrics.netPnLPercent),
          maxDrawdown: Number(result.metrics.maxDrawdown),
          rebalancesNeeded: result.metrics.rebalancesNeeded,
        },
        dailyData: result.dailyData.map(d => ({
          date: d.date,
          inRange: d.inRange,
          fees: Number(d.fees),
          il: Number(d.il),
          cumulativePnL: Number(d.cumulativePnL),
        })),
      },
    });
  } catch (error) {
    log.error('Failed to run backtest', { error, poolId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/pools/:id/assess-risk - Avalia risco de uma posição
router.post('/:id/assess-risk', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { capitalUsd } = req.body;

    if (!capitalUsd) {
      res.status(400).json({ error: 'Missing required field: capitalUsd' });
      return;
    }

    const pool = await prisma.pool.findUnique({
      where: { id },
    });

    if (!pool) {
      res.status(404).json({ error: 'Pool not found' });
      return;
    }

    // Avalia risco
    const assessment = await assessPositionRisk(
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
        currentTick: pool.currentTick || undefined,
        pairType: pool.pairType as 'stable_stable' | 'bluechip_stable' | 'altcoin_stable' | 'other',
      },
      new Decimal(capitalUsd)
    );

    res.json({
      assessment: {
        allowed: assessment.allowed,
        warnings: assessment.warnings,
        errors: assessment.errors,
        adjustedCapital: assessment.adjustedCapital
          ? Number(assessment.adjustedCapital)
          : null,
        reason: assessment.reason,
      },
    });
  } catch (error) {
    log.error('Failed to assess risk', { error, poolId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
