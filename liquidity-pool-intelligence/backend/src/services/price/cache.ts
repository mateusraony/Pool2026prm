import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { fetchTokenPrices, fetchEthPrice, fetchUsdToBrl } from './coingecko.js';
import { log } from '../../utils/logger.js';

// Cache em memória com TTL
interface CacheEntry {
  value: Decimal;
  expiresAt: number;
}

const memoryCache: Map<string, CacheEntry> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ========================================
// CACHE EM MEMÓRIA
// ========================================

function getFromMemoryCache(key: string): Decimal | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.value;
}

function setMemoryCache(key: string, value: Decimal, ttlMs: number = CACHE_TTL_MS): void {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

// ========================================
// CACHE NO BANCO DE DADOS
// ========================================

async function getFromDbCache(tokenAddress: string): Promise<Decimal | null> {
  try {
    const cached = await prisma.priceCache.findUnique({
      where: { id: tokenAddress.toLowerCase() },
    });

    if (!cached) return null;

    // Verifica se ainda é válido (5 minutos)
    const ageMs = Date.now() - cached.updatedAt.getTime();
    if (ageMs > CACHE_TTL_MS) {
      return null;
    }

    return new Decimal(cached.priceUsd.toString());
  } catch (error) {
    log.warn('Failed to get price from DB cache', { tokenAddress, error });
    return null;
  }
}

async function setDbCache(
  tokenAddress: string,
  symbol: string,
  priceUsd: Decimal,
  network: string = 'ethereum'
): Promise<void> {
  try {
    await prisma.priceCache.upsert({
      where: { id: tokenAddress.toLowerCase() },
      update: {
        priceUsd,
        updatedAt: new Date(),
      },
      create: {
        id: tokenAddress.toLowerCase(),
        symbol,
        network,
        priceUsd,
      },
    });
  } catch (error) {
    log.warn('Failed to set price in DB cache', { tokenAddress, error });
  }
}

// ========================================
// FUNÇÕES PÚBLICAS
// ========================================

// Obtém preço de um token com cache
export async function getTokenPrice(
  tokenAddress: string,
  symbol: string,
  network: string = 'ethereum'
): Promise<Decimal | null> {
  const cacheKey = `price:${tokenAddress.toLowerCase()}`;

  // 1. Tenta cache em memória
  const memoryCached = getFromMemoryCache(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  // 2. Tenta cache no banco
  const dbCached = await getFromDbCache(tokenAddress);
  if (dbCached) {
    setMemoryCache(cacheKey, dbCached);
    return dbCached;
  }

  // 3. Busca na API
  const prices = await fetchTokenPrices([{ address: tokenAddress, symbol }]);
  const price = prices.get(tokenAddress.toLowerCase());

  if (price) {
    setMemoryCache(cacheKey, price);
    await setDbCache(tokenAddress, symbol, price, network);
    return price;
  }

  return null;
}

// Obtém preços de múltiplos tokens com cache
export async function getTokenPrices(
  tokens: { address: string; symbol: string; network?: string }[]
): Promise<Map<string, Decimal>> {
  const result: Map<string, Decimal> = new Map();
  const tokensToFetch: { address: string; symbol: string }[] = [];

  // 1. Verifica cache para cada token
  for (const token of tokens) {
    const cacheKey = `price:${token.address.toLowerCase()}`;
    const cached = getFromMemoryCache(cacheKey);

    if (cached) {
      result.set(token.address.toLowerCase(), cached);
    } else {
      tokensToFetch.push(token);
    }
  }

  // 2. Busca tokens não cacheados
  if (tokensToFetch.length > 0) {
    // Tenta DB primeiro
    for (const token of tokensToFetch) {
      const dbCached = await getFromDbCache(token.address);
      if (dbCached) {
        result.set(token.address.toLowerCase(), dbCached);
        setMemoryCache(`price:${token.address.toLowerCase()}`, dbCached);
        tokensToFetch.splice(tokensToFetch.indexOf(token), 1);
      }
    }

    // Busca restantes na API
    if (tokensToFetch.length > 0) {
      const fetched = await fetchTokenPrices(tokensToFetch);
      for (const [address, price] of fetched) {
        result.set(address, price);
        setMemoryCache(`price:${address}`, price);

        const token = tokensToFetch.find(t => t.address.toLowerCase() === address);
        if (token) {
          await setDbCache(address, token.symbol, price);
        }
      }
    }
  }

  return result;
}

// Obtém preço do ETH com cache
export async function getEthPrice(): Promise<Decimal> {
  const cacheKey = 'price:eth';
  const cached = getFromMemoryCache(cacheKey);

  if (cached) {
    return cached;
  }

  const price = await fetchEthPrice();
  setMemoryCache(cacheKey, price);
  return price;
}

// Obtém taxa USD/BRL com cache (TTL maior)
export async function getUsdToBrlRate(): Promise<Decimal> {
  const cacheKey = 'rate:usd_brl';
  const cached = getFromMemoryCache(cacheKey);

  if (cached) {
    return cached;
  }

  const rate = await fetchUsdToBrl();
  setMemoryCache(cacheKey, rate, 30 * 60 * 1000); // 30 minutos
  return rate;
}

// Converte USD para BRL
export async function convertUsdToBrl(usdAmount: Decimal): Promise<Decimal> {
  const rate = await getUsdToBrlRate();
  return usdAmount.mul(rate);
}

// Limpa cache em memória
export function clearMemoryCache(): void {
  memoryCache.clear();
  log.info('Memory price cache cleared');
}

// Limpa cache expirado no banco
export async function cleanupDbCache(): Promise<number> {
  const expirationTime = new Date(Date.now() - CACHE_TTL_MS);

  const result = await prisma.priceCache.deleteMany({
    where: {
      updatedAt: {
        lt: expirationTime,
      },
    },
  });

  if (result.count > 0) {
    log.info(`Cleaned up ${result.count} expired price cache entries`);
  }

  return result.count;
}
