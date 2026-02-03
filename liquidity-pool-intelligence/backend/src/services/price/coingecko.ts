import axios, { AxiosInstance } from 'axios';
import { Decimal } from 'decimal.js';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

// Cliente Axios configurado
const client: AxiosInstance = axios.create({
  baseURL: config.apis.coingecko,
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
  },
});

// Mapeamento de endereços para IDs do CoinGecko
const addressToCoingeckoId: Record<string, string> = {
  // Ethereum
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'ethereum', // WETH
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 'usd-coin', // USDC
  '0xdac17f958d2ee523a2206206994597c13d831ec7': 'tether', // USDT
  '0x6b175474e89094c44da98b954eedeac495271d0f': 'dai', // DAI
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': 'wrapped-bitcoin', // WBTC
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': 'wrapped-steth', // wstETH
  '0xae78736cd615f374d3085123a210448e74fc6393': 'rocket-pool-eth', // rETH
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': 'coinbase-wrapped-staked-eth', // cbETH
  '0x853d955acef822db058eb8505911ed77f175b99e': 'frax', // FRAX
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': 'uniswap', // UNI
  '0x514910771af9ca656af840dff83e8264ecf986ca': 'chainlink', // LINK
  // Arbitrum (mesmo endereço em muitos casos)
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'ethereum', // WETH on Arbitrum
  '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8': 'usd-coin', // USDC.e on Arbitrum
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': 'usd-coin', // USDC on Arbitrum
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 'tether', // USDT on Arbitrum
  '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f': 'wrapped-bitcoin', // WBTC on Arbitrum
  // Base
  '0x4200000000000000000000000000000000000006': 'ethereum', // WETH on Base
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'usd-coin', // USDC on Base
};

// Mapeamento de símbolos para IDs do CoinGecko (fallback)
const symbolToCoingeckoId: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  FRAX: 'frax',
  UNI: 'uniswap',
  LINK: 'chainlink',
  AAVE: 'aave',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  ARB: 'arbitrum',
  OP: 'optimism',
  MATIC: 'matic-network',
};

// Interface de resposta
interface CoinGeckoPrice {
  [coinId: string]: {
    usd: number;
    usd_24h_change?: number;
    brl?: number;
  };
}

// ========================================
// FUNÇÕES DE BUSCA DE PREÇO
// ========================================

// Busca preços de múltiplos tokens por ID
export async function fetchPricesByIds(coinIds: string[]): Promise<Map<string, Decimal>> {
  const operation = log.startOperation('Fetch prices by IDs', { count: coinIds.length });

  try {
    const uniqueIds = [...new Set(coinIds)];
    const response = await client.get<CoinGeckoPrice>('/simple/price', {
      params: {
        ids: uniqueIds.join(','),
        vs_currencies: 'usd,brl',
        include_24hr_change: true,
      },
    });

    const prices = new Map<string, Decimal>();
    for (const [coinId, data] of Object.entries(response.data)) {
      prices.set(coinId, new Decimal(data.usd));
    }

    operation.success(`Fetched ${prices.size} prices`);
    return prices;
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

// Busca preço de um token por endereço
export async function fetchPriceByAddress(
  address: string,
  network: string = 'ethereum'
): Promise<Decimal | null> {
  const coinId = addressToCoingeckoId[address.toLowerCase()];

  if (!coinId) {
    log.warn('No CoinGecko mapping for address', { address, network });
    return null;
  }

  const prices = await fetchPricesByIds([coinId]);
  return prices.get(coinId) || null;
}

// Busca preço por símbolo
export async function fetchPriceBySymbol(symbol: string): Promise<Decimal | null> {
  const coinId = symbolToCoingeckoId[symbol.toUpperCase()];

  if (!coinId) {
    log.warn('No CoinGecko mapping for symbol', { symbol });
    return null;
  }

  const prices = await fetchPricesByIds([coinId]);
  return prices.get(coinId) || null;
}

// Busca preço do ETH (usado para cálculos de gas)
export async function fetchEthPrice(): Promise<Decimal> {
  const prices = await fetchPricesByIds(['ethereum']);
  const ethPrice = prices.get('ethereum');

  if (!ethPrice) {
    throw new Error('Failed to fetch ETH price');
  }

  return ethPrice;
}

// Busca taxa USD/BRL
export async function fetchUsdToBrl(): Promise<Decimal> {
  try {
    const response = await client.get<CoinGeckoPrice>('/simple/price', {
      params: {
        ids: 'usd-coin',
        vs_currencies: 'brl',
      },
    });

    const brlRate = response.data['usd-coin']?.brl;
    if (!brlRate) {
      throw new Error('BRL rate not available');
    }

    return new Decimal(brlRate);
  } catch (error) {
    log.warn('Failed to fetch USD/BRL rate, using fallback', { error });
    return new Decimal(5.0); // Fallback aproximado
  }
}

// ========================================
// RESOLUÇÃO DE TOKEN PARA ID
// ========================================

// Obtém CoinGecko ID de um token
export function getCoingeckoId(addressOrSymbol: string): string | null {
  // Tenta por endereço primeiro
  const byAddress = addressToCoingeckoId[addressOrSymbol.toLowerCase()];
  if (byAddress) return byAddress;

  // Tenta por símbolo
  const bySymbol = symbolToCoingeckoId[addressOrSymbol.toUpperCase()];
  if (bySymbol) return bySymbol;

  return null;
}

// Adiciona mapeamento customizado
export function addTokenMapping(address: string, coinGeckoId: string): void {
  addressToCoingeckoId[address.toLowerCase()] = coinGeckoId;
}

// ========================================
// BATCH DE PREÇOS
// ========================================

// Busca preços para uma lista de tokens (endereços ou símbolos)
export async function fetchTokenPrices(
  tokens: { address: string; symbol: string }[]
): Promise<Map<string, Decimal>> {
  const coinIds: string[] = [];
  const tokenToCoinId: Map<string, string> = new Map();

  // Mapeia tokens para IDs do CoinGecko
  for (const token of tokens) {
    const coinId = getCoingeckoId(token.address) || getCoingeckoId(token.symbol);
    if (coinId) {
      coinIds.push(coinId);
      tokenToCoinId.set(token.address.toLowerCase(), coinId);
    }
  }

  if (coinIds.length === 0) {
    return new Map();
  }

  // Busca preços
  const prices = await fetchPricesByIds(coinIds);

  // Mapeia de volta para endereços
  const result: Map<string, Decimal> = new Map();
  for (const [address, coinId] of tokenToCoinId) {
    const price = prices.get(coinId);
    if (price) {
      result.set(address, price);
    }
  }

  return result;
}
