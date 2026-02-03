import { prisma } from '../../database/client.js';
import { getTokenPrices, getEthPrice, cleanupDbCache } from '../../services/price/cache.js';
import { log } from '../../utils/logger.js';

// Job: Atualiza cache de preços
export async function runUpdatePricesJob(): Promise<void> {
  const operation = log.startOperation('Update prices job');

  try {
    // Busca todos os tokens únicos das pools ativas
    const pools = await prisma.pool.findMany({
      where: { isActive: true },
      select: {
        token0Address: true,
        token0Symbol: true,
        token1Address: true,
        token1Symbol: true,
      },
    });

    // Coleta tokens únicos
    const tokensMap = new Map<string, { address: string; symbol: string }>();
    for (const pool of pools) {
      tokensMap.set(pool.token0Address.toLowerCase(), {
        address: pool.token0Address,
        symbol: pool.token0Symbol,
      });
      tokensMap.set(pool.token1Address.toLowerCase(), {
        address: pool.token1Address,
        symbol: pool.token1Symbol,
      });
    }

    const tokens = Array.from(tokensMap.values());

    if (tokens.length === 0) {
      log.info('No tokens to update prices for');
      return;
    }

    // Atualiza preços (em lotes para evitar rate limit)
    const batchSize = 20;
    let updated = 0;

    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const prices = await getTokenPrices(batch);
      updated += prices.size;

      // Pequena pausa entre lotes
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Atualiza preço do ETH separadamente (usado para cálculos de gas)
    await getEthPrice();

    // Limpa cache expirado
    await cleanupDbCache();

    operation.success(`Updated ${updated} token prices`);
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}
