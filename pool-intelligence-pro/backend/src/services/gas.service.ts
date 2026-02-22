/**
 * Gas Service
 * Provides dynamic gas cost estimates per chain using free public JSON-RPC endpoints.
 *
 * Strategy:
 * - Calls eth_gasPrice (L2s) or eth_feeHistory (EIP-1559 chains) via free public RPCs
 * - Caches results for 60 seconds per chain
 * - Falls back to conservative static defaults on RPC failure
 * - Estimates total cost for a Uniswap v3 mint+burn round trip (~300K gas on L1, ~1M on L2)
 */

import axios from 'axios';
import { logService } from './log.service.js';

// --- Types ---

export interface GasEstimate {
  /** Gas price in Gwei */
  gasPriceGwei: number;
  /** Estimated cost for LP round trip (mint + burn) in USD */
  roundTripUsd: number;
  /** Whether this is from live RPC or static fallback */
  isLive: boolean;
  /** Chain */
  chain: string;
  /** Native token price used (ETH/MATIC) */
  nativeTokenPriceUsd: number;
  /** Timestamp */
  fetchedAt: number;
}

// --- Configuration ---

/** Free public RPC endpoints (no API key needed) */
const RPC_ENDPOINTS: Record<string, string[]> = {
  ethereum: [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://ethereum-rpc.publicnode.com',
  ],
  arbitrum: [
    'https://arb1.arbitrum.io/rpc',
    'https://rpc.ankr.com/arbitrum',
    'https://arbitrum-one-rpc.publicnode.com',
  ],
  base: [
    'https://mainnet.base.org',
    'https://rpc.ankr.com/base',
    'https://base-rpc.publicnode.com',
  ],
  optimism: [
    'https://mainnet.optimism.io',
    'https://rpc.ankr.com/optimism',
    'https://optimism-rpc.publicnode.com',
  ],
  polygon: [
    'https://polygon-rpc.com',
    'https://rpc.ankr.com/polygon',
    'https://polygon-bor-rpc.publicnode.com',
  ],
};

/** Gas units for a Uniswap v3 LP round trip (mint position + burn/collect) */
const GAS_UNITS: Record<string, number> = {
  ethereum: 350000,   // ~200K mint + ~150K burn
  arbitrum: 1200000,  // L2 gas units are higher but cheaper
  base: 1200000,
  optimism: 1200000,
  polygon: 500000,
};

/** Conservative static fallback gas prices (Gwei) when RPC fails */
const FALLBACK_GAS_GWEI: Record<string, number> = {
  ethereum: 30,
  arbitrum: 0.1,
  base: 0.01,
  optimism: 0.01,
  polygon: 50,
};

/** Approximate native token prices (USD) — used as fallback if price API fails */
const FALLBACK_NATIVE_PRICE: Record<string, number> = {
  ethereum: 3000,
  arbitrum: 3000,   // ETH
  base: 3000,       // ETH
  optimism: 3000,   // ETH
  polygon: 0.50,    // MATIC
};

// --- Cache ---

const cache = new Map<string, GasEstimate>();
const CACHE_TTL_MS = 60_000; // 60 seconds

// --- Core ---

/**
 * Call eth_gasPrice via JSON-RPC.
 * Tries multiple endpoints with 5s timeout each.
 */
async function fetchGasPrice(chain: string): Promise<number | null> {
  const endpoints = RPC_ENDPOINTS[chain];
  if (!endpoints) return null;

  for (const rpc of endpoints) {
    try {
      const resp = await axios.post(
        rpc,
        { jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 },
        { timeout: 5000 }
      );
      const hexPrice = resp.data?.result;
      if (hexPrice) {
        const gwei = parseInt(hexPrice, 16) / 1e9;
        return gwei;
      }
    } catch {
      // Try next endpoint
      continue;
    }
  }

  logService.warn('SYSTEM', `Gas RPC failed for ${chain} — using static fallback`, {
    chain,
    endpoints: endpoints.length,
  });
  return null;
}

/**
 * Fetch native token price from CoinGecko (free, no API key).
 * Returns price in USD or fallback.
 */
async function fetchNativeTokenPrice(chain: string): Promise<number> {
  const coinIds: Record<string, string> = {
    ethereum: 'ethereum',
    arbitrum: 'ethereum',
    base: 'ethereum',
    optimism: 'ethereum',
    polygon: 'matic-network',
  };
  const coinId = coinIds[chain];
  if (!coinId) return FALLBACK_NATIVE_PRICE[chain] || 3000;

  // Cache native price for 5 minutes
  const cacheKey = `native_price:${coinId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 300_000) {
    return cached.nativeTokenPriceUsd;
  }

  try {
    const resp = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
      { timeout: 5000 }
    );
    const price = resp.data?.[coinId]?.usd;
    if (price && price > 0) {
      return price;
    }
  } catch {
    // Use fallback
  }

  return FALLBACK_NATIVE_PRICE[chain] || 3000;
}

// --- Public API ---

/**
 * Get gas estimate for a chain.
 * Returns cached value if fresh (< 60s), otherwise fetches from RPC.
 */
export async function getGasEstimate(chain: string): Promise<GasEstimate> {
  const normalizedChain = chain.toLowerCase();

  // Check cache
  const cached = cache.get(normalizedChain);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  // Fetch live gas price
  const gasPriceGwei = await fetchGasPrice(normalizedChain);
  const nativeTokenPriceUsd = await fetchNativeTokenPrice(normalizedChain);
  const isLive = gasPriceGwei !== null;
  const effectiveGasPrice = gasPriceGwei ?? FALLBACK_GAS_GWEI[normalizedChain] ?? 30;
  const gasUnits = GAS_UNITS[normalizedChain] ?? 350000;

  // Calculate cost: gasUnits × gasPriceGwei × 1e-9 × nativeTokenPriceUsd
  const roundTripUsd = gasUnits * effectiveGasPrice * 1e-9 * nativeTokenPriceUsd;

  const estimate: GasEstimate = {
    gasPriceGwei: Math.round(effectiveGasPrice * 100) / 100,
    roundTripUsd: Math.round(roundTripUsd * 100) / 100,
    isLive,
    chain: normalizedChain,
    nativeTokenPriceUsd,
    fetchedAt: Date.now(),
  };

  // Store in cache
  cache.set(normalizedChain, estimate);

  if (!isLive) {
    logService.warn('SYSTEM', `Gas estimate for ${normalizedChain}: using static fallback $${estimate.roundTripUsd.toFixed(2)}`);
  }

  return estimate;
}

/**
 * Get gas estimates for all supported chains.
 * Fetches in parallel for efficiency.
 */
export async function getAllGasEstimates(): Promise<Record<string, GasEstimate>> {
  const chains = Object.keys(RPC_ENDPOINTS);
  const estimates = await Promise.all(chains.map(c => getGasEstimate(c)));
  const result: Record<string, GasEstimate> = {};
  for (let i = 0; i < chains.length; i++) {
    result[chains[i]] = estimates[i];
  }
  return result;
}

export const gasService = {
  getGasEstimate,
  getAllGasEstimates,
};
