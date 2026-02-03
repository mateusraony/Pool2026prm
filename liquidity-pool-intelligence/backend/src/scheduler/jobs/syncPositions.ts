import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { config } from '../../config/index.js';
import { fetchOwnerPositions } from '../../services/graph/uniswap.js';
import { getTokenPrice } from '../../services/price/cache.js';
import { calculateImpermanentLoss, tickToPrice } from '../../utils/math.js';
import { log } from '../../utils/logger.js';

// Job: Sincroniza posições on-chain
export async function runSyncPositionsJob(): Promise<void> {
  const operation = log.startOperation('Sync positions job');

  try {
    // Se não há wallets configuradas, apenas atualiza métricas das posições existentes
    if (config.monitoredWallets.length === 0) {
      await updateExistingPositionsMetrics();
      operation.success('No wallets configured, updated existing positions only');
      return;
    }

    // Busca posições on-chain para cada wallet/rede
    for (const wallet of config.monitoredWallets) {
      for (const network of config.enabledNetworks) {
        try {
          await syncWalletPositions(wallet, network);
        } catch (error) {
          log.warn(`Failed to sync positions for wallet on ${network}`, {
            wallet: wallet.substring(0, 10) + '...',
            error,
          });
        }
      }
    }

    // Atualiza métricas de todas as posições
    await updateExistingPositionsMetrics();

    operation.success('Positions synced');
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

// Sincroniza posições de uma wallet em uma rede
async function syncWalletPositions(walletAddress: string, network: string): Promise<void> {
  // Busca posições do The Graph
  const onChainPositions = await fetchOwnerPositions(network, walletAddress);

  for (const onChain of onChainPositions) {
    const poolId = `${network}_uniswap_v3_${onChain.pool.id}`;

    // Verifica se a pool existe no banco
    let pool = await prisma.pool.findUnique({ where: { id: poolId } });

    if (!pool) {
      // Cria pool básica
      pool = await prisma.pool.create({
        data: {
          id: poolId,
          network,
          dex: 'uniswap_v3',
          address: onChain.pool.id,
          token0Symbol: onChain.pool.token0.symbol,
          token1Symbol: onChain.pool.token1.symbol,
          token0Address: onChain.pool.token0.id,
          token0Decimals: parseInt(onChain.pool.token0.decimals),
          token1Address: onChain.pool.token1.id,
          token1Decimals: parseInt(onChain.pool.token1.decimals),
          feeTier: parseInt(onChain.pool.feeTier),
          tvlUsd: 0,
          volume24hUsd: 0,
          volume7dUsd: 0,
          currentPrice: 0,
          pairType: 'other',
          lastScannedAt: new Date(),
        },
      });
    }

    // Calcula preços do range
    const tickLower = parseInt(onChain.tickLower.tickIdx);
    const tickUpper = parseInt(onChain.tickUpper.tickIdx);
    const priceLower = tickToPrice(tickLower, pool.token0Decimals, pool.token1Decimals);
    const priceUpper = tickToPrice(tickUpper, pool.token0Decimals, pool.token1Decimals);

    // Calcula capital aproximado
    const deposited0 = new Decimal(onChain.depositedToken0);
    const deposited1 = new Decimal(onChain.depositedToken1);

    // Busca preços dos tokens
    const price0 = await getTokenPrice(pool.token0Address, pool.token0Symbol, network);
    const price1 = await getTokenPrice(pool.token1Address, pool.token1Symbol, network);

    let capitalUsd = new Decimal(0);
    if (price0) capitalUsd = capitalUsd.add(deposited0.mul(price0));
    if (price1) capitalUsd = capitalUsd.add(deposited1.mul(price1));

    // Calcula fees coletadas
    const fees0 = new Decimal(onChain.collectedFeesToken0);
    const fees1 = new Decimal(onChain.collectedFeesToken1);
    let feesUsd = new Decimal(0);
    if (price0) feesUsd = feesUsd.add(fees0.mul(price0));
    if (price1) feesUsd = feesUsd.add(fees1.mul(price1));

    // Verifica se a posição já existe
    const existingPosition = await prisma.position.findFirst({
      where: {
        tokenId: onChain.id,
        walletAddress: walletAddress.toLowerCase(),
        poolId,
      },
    });

    if (existingPosition) {
      // Atualiza posição existente
      await prisma.position.update({
        where: { id: existingPosition.id },
        data: {
          feesAccrued: feesUsd,
          lastSyncAt: new Date(),
        },
      });
    } else {
      // Cria nova posição
      await prisma.position.create({
        data: {
          poolId,
          tokenId: onChain.id,
          walletAddress: walletAddress.toLowerCase(),
          isSimulation: false,
          priceLower,
          priceUpper,
          tickLower,
          tickUpper,
          capitalUsd,
          liquidity: onChain.liquidity,
          feesAccrued: feesUsd,
          status: 'ACTIVE',
          lastSyncAt: new Date(),
        },
      });

      // Registra no histórico
      await prisma.historyEntry.create({
        data: {
          poolId,
          action: 'SYNC_DETECTED',
          details: {
            tokenId: onChain.id,
            walletAddress: walletAddress.substring(0, 10) + '...',
            capitalUsd: capitalUsd.toString(),
          },
        },
      });

      log.info('New on-chain position detected', {
        poolId,
        tokenId: onChain.id,
      });
    }
  }
}

// Atualiza métricas de posições existentes
async function updateExistingPositionsMetrics(): Promise<void> {
  const activePositions = await prisma.position.findMany({
    where: { status: { in: ['ACTIVE', 'ATTENTION', 'CRITICAL'] } },
    include: { pool: true },
  });

  for (const position of activePositions) {
    try {
      const currentPrice = new Decimal(position.pool.currentPrice.toString());
      const priceLower = new Decimal(position.priceLower.toString());
      const priceUpper = new Decimal(position.priceUpper.toString());
      const capital = new Decimal(position.capitalUsd.toString());

      // Verifica se está no range
      const inRange = currentPrice.gte(priceLower) && currentPrice.lte(priceUpper);

      // Calcula IL
      const entryPrice = position.entryPrice
        ? new Decimal(position.entryPrice.toString())
        : currentPrice;

      const il = calculateImpermanentLoss(
        entryPrice,
        currentPrice,
        priceLower,
        priceUpper
      ).mul(capital);

      // Calcula PnL
      const fees = new Decimal(position.feesAccrued.toString());
      const pnl = fees.sub(il);

      // Determina status
      let status = position.status;
      if (!inRange) {
        const percentOutside = currentPrice.lt(priceLower)
          ? priceLower.sub(currentPrice).div(priceLower).mul(100)
          : currentPrice.sub(priceUpper).div(priceUpper).mul(100);

        status = percentOutside.gt(15) ? 'CRITICAL' : 'ATTENTION';
      } else if (position.status !== 'ACTIVE') {
        status = 'ACTIVE';
      }

      // Atualiza posição
      await prisma.position.update({
        where: { id: position.id },
        data: {
          ilAccrued: il,
          pnlUsd: pnl,
          status,
          lastSyncAt: new Date(),
        },
      });
    } catch (error) {
      log.warn(`Failed to update position metrics`, {
        positionId: position.id,
        error,
      });
    }
  }
}
