import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { config } from '../../config/index.js';
import { sendTelegramAlert } from '../telegram/bot.js';
import { AlertData, AlertType, AlertSeverity, AlertPayload } from '../../types/alert.js';
import { log } from '../../utils/logger.js';
import { formatUsd, formatPercent, formatPairName, formatNetworkName } from '../../utils/formatting.js';

// ========================================
// MONITOR DE ALERTAS
// ========================================

// Verifica todas as condições de alerta
export async function checkAllAlerts(): Promise<void> {
  const operation = log.startOperation('Check all alerts');

  try {
    await checkOutOfRangePositions();
    await checkTvlDrops();
    await checkAprDrops();
    await checkNewOpportunities();

    operation.success();
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

// Verifica posições fora do range
async function checkOutOfRangePositions(): Promise<void> {
  const activePositions = await prisma.position.findMany({
    where: { status: 'ACTIVE' },
    include: { pool: true },
  });

  for (const position of activePositions) {
    const currentPrice = new Decimal(position.pool.currentPrice.toString());
    const priceLower = new Decimal(position.priceLower.toString());
    const priceUpper = new Decimal(position.priceUpper.toString());

    // Verifica se está fora do range
    let percentOutside = 0;
    let direction: 'above' | 'below' | null = null;

    if (currentPrice.lt(priceLower)) {
      percentOutside = priceLower.sub(currentPrice).div(priceLower).mul(100).toNumber();
      direction = 'below';
    } else if (currentPrice.gt(priceUpper)) {
      percentOutside = currentPrice.sub(priceUpper).div(priceUpper).mul(100).toNumber();
      direction = 'above';
    }

    if (direction && percentOutside >= config.alerts.outOfRangePercent) {
      // Verifica se já enviou alerta recente
      const recentAlert = await prisma.alert.findFirst({
        where: {
          poolId: position.poolId,
          type: 'MAINTENANCE',
          sentAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // 1 hora
        },
      });

      if (!recentAlert) {
        const severity: AlertSeverity = percentOutside > 15 ? 'CRITICAL' : 'WARNING';

        await createAlert({
          poolId: position.poolId,
          type: 'MAINTENANCE',
          severity,
          title: `Posição fora do range - ${position.pool.token0Symbol}/${position.pool.token1Symbol}`,
          payload: {
            type: 'OUT_OF_RANGE',
            currentPrice,
            rangeLower: priceLower,
            rangeUpper: priceUpper,
            percentOutside,
            direction,
            capitalAtRisk: new Decimal(position.capitalUsd.toString()),
            recommendation: percentOutside > 20 ? 'exit' : 'rebalance',
          },
        });

        // Atualiza status da posição
        await prisma.position.update({
          where: { id: position.id },
          data: { status: percentOutside > 15 ? 'CRITICAL' : 'ATTENTION' },
        });
      }
    } else if (direction === null) {
      // Voltou ao range - atualiza status se estava em atenção
      if (position.status === 'ATTENTION' || position.status === 'CRITICAL') {
        await prisma.position.update({
          where: { id: position.id },
          data: { status: 'ACTIVE' },
        });
      }
    }
  }
}

// Verifica quedas de TVL
async function checkTvlDrops(): Promise<void> {
  // Busca pools monitoradas (com posições ativas)
  const poolsWithPositions = await prisma.pool.findMany({
    where: {
      positions: { some: { status: 'ACTIVE' } },
    },
  });

  for (const pool of poolsWithPositions) {
    // Busca TVL anterior (do último scan)
    const previousEntry = await prisma.historyEntry.findFirst({
      where: {
        poolId: pool.id,
        action: 'SCAN',
      },
      orderBy: { createdAt: 'desc' },
      skip: 1, // Pega o penúltimo
    });

    if (!previousEntry) continue;

    const previousData = previousEntry.details as { tvlUsd?: string };
    if (!previousData.tvlUsd) continue;

    const previousTvl = new Decimal(previousData.tvlUsd);
    const currentTvl = new Decimal(pool.tvlUsd.toString());

    if (previousTvl.gt(0)) {
      const dropPercent = previousTvl.sub(currentTvl).div(previousTvl).mul(100);

      if (dropPercent.gte(config.alerts.tvlDropPercent)) {
        const recentAlert = await prisma.alert.findFirst({
          where: {
            poolId: pool.id,
            type: 'RISK',
            sentAt: { gte: new Date(Date.now() - 4 * 60 * 60 * 1000) }, // 4 horas
          },
        });

        if (!recentAlert) {
          await createAlert({
            poolId: pool.id,
            type: 'RISK',
            severity: dropPercent.gt(40) ? 'CRITICAL' : 'WARNING',
            title: `Queda de TVL - ${pool.token0Symbol}/${pool.token1Symbol}`,
            payload: {
              type: 'TVL_DROP',
              previousTvl,
              currentTvl,
              dropPercent: dropPercent.toNumber(),
              recommendation: dropPercent.gt(40) ? 'exit' : 'monitor',
            },
          });
        }
      }
    }
  }
}

// Verifica quedas de APR
async function checkAprDrops(): Promise<void> {
  const poolsWithPositions = await prisma.pool.findMany({
    where: {
      positions: { some: { status: 'ACTIVE' } },
      aprEstimate: { not: null },
    },
  });

  for (const pool of poolsWithPositions) {
    const currentApr = new Decimal(pool.aprEstimate?.toString() || '0');

    if (currentApr.lt(config.alerts.aprMin)) {
      const recentAlert = await prisma.alert.findFirst({
        where: {
          poolId: pool.id,
          type: 'MAINTENANCE',
          sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24 horas
        },
      });

      if (!recentAlert) {
        await createAlert({
          poolId: pool.id,
          type: 'MAINTENANCE',
          severity: 'INFO',
          title: `APR baixo - ${pool.token0Symbol}/${pool.token1Symbol}`,
          payload: {
            type: 'APR_DROP',
            previousApr: new Decimal(config.alerts.aprMin), // Assumindo que estava acima do mínimo
            currentApr,
            minimumRequired: config.alerts.aprMin,
            recommendation: 'hold',
          },
        });
      }
    }
  }
}

// Verifica novas oportunidades
async function checkNewOpportunities(): Promise<void> {
  // Busca pools com alto score que não tem posição
  const highScoreRanges = await prisma.poolRange.findMany({
    where: {
      score: { gte: 75 },
      pool: {
        positions: { none: { status: 'ACTIVE' } },
      },
    },
    include: {
      pool: true,
    },
    orderBy: { score: 'desc' },
    take: 5,
  });

  for (const range of highScoreRanges) {
    // Verifica se já alertou sobre essa pool recentemente
    const recentAlert = await prisma.alert.findFirst({
      where: {
        poolId: range.poolId,
        type: 'OPPORTUNITY',
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24 horas
      },
    });

    if (!recentAlert) {
      await createAlert({
        poolId: range.poolId,
        type: 'OPPORTUNITY',
        severity: 'INFO',
        title: `Nova oportunidade - ${range.pool.token0Symbol}/${range.pool.token1Symbol}`,
        payload: {
          type: 'NEW_OPPORTUNITY',
          poolId: range.poolId,
          poolName: `${range.pool.token0Symbol}/${range.pool.token1Symbol}`,
          network: range.pool.network,
          score: range.score,
          projectedReturn: new Decimal(range.netReturn7d.toString()),
          suggestedCapital: new Decimal(range.capitalUsd.toString()),
        },
      });
    }
  }
}

// Cria e envia alerta
async function createAlert(params: {
  poolId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  payload: AlertPayload;
}): Promise<AlertData> {
  const { poolId, type, severity, title, payload } = params;

  // Busca info da pool
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });

  // Formata mensagem
  const message = formatAlertMessage(title, payload, pool);

  // Salva no banco
  const alert = await prisma.alert.create({
    data: {
      poolId,
      type,
      severity,
      title,
      message,
      data: payload as object,
      sentAt: new Date(),
    },
  });

  // Envia no Telegram
  if (config.telegram.enabled) {
    try {
      await sendTelegramAlert({
        title,
        severity,
        message,
        poolId,
        network: pool?.network,
      });
      log.alert(type, severity, poolId);
    } catch (error) {
      log.error('Failed to send Telegram alert', { error, alertId: alert.id });
    }
  }

  return {
    ...alert,
    type: alert.type as AlertType,
    severity: alert.severity as AlertSeverity,
    data: alert.data as AlertPayload,
  };
}

// Formata mensagem de alerta
function formatAlertMessage(
  title: string,
  payload: AlertPayload,
  pool: { network: string; token0Symbol: string; token1Symbol: string; feeTier: number } | null
): string {
  let message = '';

  if (pool) {
    message += `📍 ${formatPairName(pool.token0Symbol, pool.token1Symbol)} · ${formatNetworkName(pool.network)}\n\n`;
  }

  switch (payload.type) {
    case 'OUT_OF_RANGE':
      message += `O preço atual (${formatUsd(payload.currentPrice)}) está `;
      message += payload.direction === 'above' ? 'ACIMA' : 'ABAIXO';
      message += ` do range configurado.\n\n`;
      message += `• Range: ${formatUsd(payload.rangeLower)} - ${formatUsd(payload.rangeUpper)}\n`;
      message += `• Desvio: ${payload.percentOutside.toFixed(1)}%\n`;
      message += `• Capital: ${formatUsd(payload.capitalAtRisk)}\n\n`;
      message += `💡 Recomendação: ${payload.recommendation === 'exit' ? 'Considere sair da posição' : 'Considere rebalancear'}`;
      break;

    case 'TVL_DROP':
      message += `O TVL da pool caiu significativamente.\n\n`;
      message += `• TVL anterior: ${formatUsd(payload.previousTvl, { compact: true })}\n`;
      message += `• TVL atual: ${formatUsd(payload.currentTvl, { compact: true })}\n`;
      message += `• Queda: ${formatPercent(payload.dropPercent)}\n\n`;
      message += `💡 Recomendação: ${payload.recommendation === 'exit' ? 'Considere sair' : 'Continue monitorando'}`;
      break;

    case 'APR_DROP':
      message += `O APR da pool está abaixo do mínimo configurado.\n\n`;
      message += `• APR atual: ${formatPercent(payload.currentApr)}\n`;
      message += `• Mínimo: ${payload.minimumRequired}%\n\n`;
      message += `💡 Esta pool pode não estar rendendo o esperado.`;
      break;

    case 'NEW_OPPORTUNITY':
      message += `Nova pool com alto potencial identificada!\n\n`;
      message += `• Pool: ${payload.poolName}\n`;
      message += `• Rede: ${formatNetworkName(payload.network)}\n`;
      message += `• Score: ${payload.score}/100\n`;
      message += `• Retorno projetado (7d): ${formatPercent(payload.projectedReturn)}\n`;
      message += `• Capital sugerido: ${formatUsd(payload.suggestedCapital)}\n\n`;
      message += `💡 Acesse o painel para mais detalhes.`;
      break;

    case 'GAS_HIGH':
      message += `O custo de gas está elevado na rede ${payload.network}.\n\n`;
      message += `• Gas atual: ${payload.currentGasGwei} gwei\n`;
      message += `• Gas normal: ${payload.normalGasGwei} gwei\n`;
      message += `• Custo estimado: ${formatUsd(payload.estimatedCostUsd)}\n\n`;
      message += `💡 ${payload.recommendation === 'wait' ? 'Aguarde para realizar operações' : 'Pode prosseguir'}`;
      break;

    case 'REBALANCE_NEEDED':
      message += `Rebalanceamento pode melhorar sua posição.\n\n`;
      message += `• Range atual: ${formatUsd(payload.currentRange.lower)} - ${formatUsd(payload.currentRange.upper)}\n`;
      message += `• Range sugerido: ${formatUsd(payload.suggestedRange.lower)} - ${formatUsd(payload.suggestedRange.upper)}\n`;
      message += `• Melhoria esperada: ${formatPercent(payload.expectedImprovement)}\n`;
      message += `• Custo de gas: ${formatUsd(payload.estimatedGasCost)}\n\n`;
      message += `💡 ${payload.worthIt ? 'Rebalanceamento recomendado' : 'Custo não compensa a melhoria'}`;
      break;
  }

  return message;
}
