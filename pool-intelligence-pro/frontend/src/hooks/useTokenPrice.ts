import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

// Extended CoinGecko API token IDs mapping - Major tokens
const COINGECKO_IDS: Record<string, string> = {
  // Major L1s
  ETH: 'ethereum',
  WETH: 'ethereum',
  BTC: 'bitcoin',
  WBTC: 'wrapped-bitcoin',
  SOL: 'solana',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  POL: 'matic-network',
  BNB: 'binancecoin',
  FTM: 'fantom',
  NEAR: 'near',
  ATOM: 'cosmos',
  DOT: 'polkadot',
  ADA: 'cardano',
  TRX: 'tron',
  TON: 'the-open-network',
  SUI: 'sui',
  APT: 'aptos',
  SEI: 'sei-network',
  INJ: 'injective-protocol',
  TIA: 'celestia',
  
  // Stablecoins
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  FRAX: 'frax',
  LUSD: 'liquity-usd',
  TUSD: 'true-usd',
  GUSD: 'gemini-dollar',
  USDP: 'paxos-standard',
  PYUSD: 'paypal-usd',
  USDD: 'usdd',
  CRVUSD: 'crvusd',
  GHO: 'gho',
  EURC: 'euro-coin',
  EURT: 'tether-eurt',
  
  // L2 & Scaling tokens
  OP: 'optimism',
  ARB: 'arbitrum',
  STRK: 'starknet',
  IMX: 'immutable-x',
  METIS: 'metis-token',
  MANTA: 'manta-network',
  BLAST: 'blast',
  ZK: 'zksync',
  MODE: 'mode',
  SCROLL: 'scroll',
  LINEA: 'linea',
  BASE: 'base',
  BOBA: 'boba-network',
  
  // DeFi Blue chips
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  MKR: 'maker',
  CRV: 'curve-dao-token',
  CVX: 'convex-finance',
  LDO: 'lido-dao',
  RPL: 'rocket-pool',
  COMP: 'compound-governance-token',
  SNX: 'havven',
  BAL: 'balancer',
  SUSHI: 'sushi',
  YFI: 'yearn-finance',
  '1INCH': '1inch',
  DYDX: 'dydx',
  GMX: 'gmx',
  GNS: 'gains-network',
  PENDLE: 'pendle',
  RDNT: 'radiant-capital',
  JOE: 'trader-joe',
  CAKE: 'pancakeswap-token',
  
  // LST/LRT tokens
  STETH: 'staked-ether',
  WSTETH: 'wrapped-steth',
  RETH: 'rocket-pool-eth',
  CBETH: 'coinbase-wrapped-staked-eth',
  FRXETH: 'frax-ether',
  SFRXETH: 'staked-frax-ether',
  SWETH: 'sweth',
  OETH: 'origin-ether',
  WEETH: 'wrapped-eeth',
  EZETH: 'renzo-restaked-eth',
  RSETH: 'rseth',
  PUFETH: 'pufeth',
  
  // Meme coins
  DOGE: 'dogecoin',
  SHIB: 'shiba-inu',
  PEPE: 'pepe',
  FLOKI: 'floki',
  WIF: 'dogwifhat',
  BONK: 'bonk',
  MEME: 'memecoin',
  BRETT: 'brett',
  DEGEN: 'degen-base',
  TOSHI: 'toshi',
  
  // Base ecosystem
  AERO: 'aerodrome-finance',
  WELL: 'moonwell',
  EXTRA: 'extra-finance',
  SEAM: 'seamless-protocol',
  
  // Optimism ecosystem
  VELO: 'velodrome-finance',
  THALES: 'thales',
  LYRA: 'lyra-finance',
  
  // Arbitrum ecosystem
  MAGIC: 'magic',
  DPX: 'dopex',
  JONES: 'jones-dao',
  GLP: 'glp',
  GRAIL: 'camelot-token',
  
  // Gaming/Metaverse
  AXS: 'axie-infinity',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  ENJ: 'enjincoin',
  GALA: 'gala',
  ILV: 'illuvium',
  PRIME: 'echelon-prime',
  
  // AI tokens
  FET: 'fetch-ai',
  AGIX: 'singularitynet',
  OCEAN: 'ocean-protocol',
  RNDR: 'render-token',
  AKT: 'akash-network',
  TAO: 'bittensor',
  WLD: 'worldcoin-wld',
  
  // Real World Assets
  ONDO: 'ondo-finance',
  MPL: 'maple',
  CFG: 'centrifuge',
  RWA: 'rwa-inc',
  
  // Infrastructure
  FIL: 'filecoin',
  AR: 'arweave',
  GRT: 'the-graph',
  API3: 'api3',
  BAND: 'band-protocol',
  PYTH: 'pyth-network',
  
  // Privacy
  ZEC: 'zcash',
  XMR: 'monero',
  SCRT: 'secret',
  
  // Exchange tokens
  BGB: 'bitget-token',
  GT: 'gatechain-token',
  KCS: 'kucoin-shares',
  OKB: 'okb',
  LEO: 'leo-token',
  HT: 'huobi-token',
  
  // Cross-chain
  RUNE: 'thorchain',
  ZRO: 'layerzero',
  AXL: 'axelar',
  CCIP: 'chainlink',
  WORMHOLE: 'wormhole',
  STG: 'stargate-finance',
  HOP: 'hop-protocol',
  ACROSS: 'across-protocol',
  SYNAPSE: 'synapse-2',
  
  // Misc DeFi
  FXS: 'frax-share',
  SPELL: 'spell-token',
  ALCX: 'alchemix',
  ANGLE: 'angle-protocol',
  LQTY: 'liquity',
  PRISMA: 'prisma-governance-token',
  ENA: 'ethena',
  USDE: 'ethena-usde',
  SENA: 'ethena-staked-usde',
  EIGEN: 'eigenlayer',
};

// DeFiLlama token addresses for fallback (by chain)
const DEFILLAMA_TOKENS: Record<string, { chain: string; address: string }> = {
  // Ethereum mainnet
  ETH: { chain: 'ethereum', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
  WETH: { chain: 'ethereum', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' },
  USDC: { chain: 'ethereum', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  USDT: { chain: 'ethereum', address: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
  DAI: { chain: 'ethereum', address: '0x6b175474e89094c44da98b954eedeac495271d0f' },
  WBTC: { chain: 'ethereum', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
  LINK: { chain: 'ethereum', address: '0x514910771af9ca656af840dff83e8264ecf986ca' },
  UNI: { chain: 'ethereum', address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' },
  AAVE: { chain: 'ethereum', address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9' },
  MKR: { chain: 'ethereum', address: '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2' },
  CRV: { chain: 'ethereum', address: '0xd533a949740bb3306d119cc777fa900ba034cd52' },
  LDO: { chain: 'ethereum', address: '0x5a98fcbea516cf06857215779fd812ca3bef1b32' },
  STETH: { chain: 'ethereum', address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84' },
  RETH: { chain: 'ethereum', address: '0xae78736cd615f374d3085123a210448e74fc6393' },
  PENDLE: { chain: 'ethereum', address: '0x808507121b80c02388fad14726482e061b8da827' },
  
  // Arbitrum
  ARB: { chain: 'arbitrum', address: '0x912ce59144191c1204e64559fe8253a0e49e6548' },
  GMX: { chain: 'arbitrum', address: '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a' },
  MAGIC: { chain: 'arbitrum', address: '0x539bde0d7dbd336b79148aa742883198bbf60342' },
  GRAIL: { chain: 'arbitrum', address: '0x3d9907f9a368ad0a51be60f7da3b97cf940982d8' },
  RDNT: { chain: 'arbitrum', address: '0x3082cc23568ea640225c2467653db90e9250aaa0' },
  
  // Optimism
  OP: { chain: 'optimism', address: '0x4200000000000000000000000000000000000042' },
  VELO: { chain: 'optimism', address: '0x9560e827af36c94d2ac33a39bce1fe78631088db' },
  
  // Base
  AERO: { chain: 'base', address: '0x940181a94a35a4569e4529a3cdfb74e38fd98631' },
  DEGEN: { chain: 'base', address: '0x4ed4e862860bed51a9570b96d89af5e1b0efefed' },
  BRETT: { chain: 'base', address: '0x532f27101965dd16442e59d40670faf5ebb142e4' },
  TOSHI: { chain: 'base', address: '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4' },
  WELL: { chain: 'base', address: '0xff8adec2221f9f4d8dfbafa6b9a297d17603493d' },
  
  // Polygon
  MATIC: { chain: 'polygon', address: '0x0000000000000000000000000000000000001010' },
};

// Stablecoins that should always be ~$1
const STABLECOINS = [
  'USDC', 'USDT', 'DAI', 'USDbC', 'BUSD', 'FRAX', 'LUSD', 'TUSD', 
  'GUSD', 'USDP', 'PYUSD', 'USDD', 'CRVUSD', 'GHO', 'USDE'
];

// EUR stablecoins
const EUR_STABLECOINS = ['EURC', 'EURT', 'AGEUR'];

interface UseTokenPriceResult {
  price: number | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  lastUpdated: Date | null;
  source: 'coingecko' | 'defillama' | 'stablecoin' | null;
}

// Fetch from CoinGecko
async function fetchFromCoinGecko(tokenIds: string[]): Promise<Record<string, number>> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${tokenIds.join(',')}&vs_currencies=usd`
  );
  
  if (!response.ok) {
    throw new Error('CoinGecko API error');
  }
  
  const data = await response.json();
  const prices: Record<string, number> = {};
  
  for (const id of tokenIds) {
    if (data[id]?.usd) {
      prices[id] = data[id].usd;
    }
  }
  
  return prices;
}

// Fetch from DeFiLlama
async function fetchFromDeFiLlama(tokens: { symbol: string; chain: string; address: string }[]): Promise<Record<string, number>> {
  const coins = tokens.map(t => `${t.chain}:${t.address}`).join(',');
  
  const response = await fetch(
    `https://coins.llama.fi/prices/current/${coins}`
  );
  
  if (!response.ok) {
    throw new Error('DeFiLlama API error');
  }
  
  const data = await response.json();
  const prices: Record<string, number> = {};
  
  for (const token of tokens) {
    const key = `${token.chain}:${token.address}`;
    if (data.coins?.[key]?.price) {
      prices[token.symbol] = data.coins[key].price;
    }
  }
  
  return prices;
}

export function useTokenPrice(token0: string, token1: string): UseTokenPriceResult {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [source, setSource] = useState<UseTokenPriceResult['source']>(null);

  const fetchPrice = useCallback(async () => {
    if (!token0 || !token1 || token0 === token1) {
      setPrice(null);
      return;
    }

    // Handle stablecoin pairs
    const isToken0Stable = STABLECOINS.includes(token0);
    const isToken1Stable = STABLECOINS.includes(token1);
    const isToken0EurStable = EUR_STABLECOINS.includes(token0);
    const isToken1EurStable = EUR_STABLECOINS.includes(token1);
    
    if (isToken0Stable && isToken1Stable) {
      setPrice(1);
      setLastUpdated(new Date());
      setSource('stablecoin');
      return;
    }

    if (isToken0EurStable && isToken1EurStable) {
      setPrice(1);
      setLastUpdated(new Date());
      setSource('stablecoin');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let price0: number | null = null;
      let price1: number | null = null;
      let usedSource: UseTokenPriceResult['source'] = null;

      // Determine if tokens are stablecoins
      if (isToken0Stable) price0 = 1;
      if (isToken1Stable) price1 = 1;

      // Try CoinGecko first
      const tokensToFetch: string[] = [];
      const tokenIdMap: Record<string, string> = {};

      if (price0 === null && COINGECKO_IDS[token0]) {
        tokensToFetch.push(COINGECKO_IDS[token0]);
        tokenIdMap[COINGECKO_IDS[token0]] = token0;
      }
      if (price1 === null && COINGECKO_IDS[token1]) {
        tokensToFetch.push(COINGECKO_IDS[token1]);
        tokenIdMap[COINGECKO_IDS[token1]] = token1;
      }

      if (tokensToFetch.length > 0) {
        try {
          const geckoData = await fetchFromCoinGecko(tokensToFetch);
          
          for (const [id, usdPrice] of Object.entries(geckoData)) {
            const symbol = tokenIdMap[id];
            if (symbol === token0 && price0 === null) {
              price0 = usdPrice;
              usedSource = 'coingecko';
            }
            if (symbol === token1 && price1 === null) {
              price1 = usdPrice;
              usedSource = 'coingecko';
            }
          }
        } catch (geckoError) {
          console.warn('CoinGecko fetch failed, trying DeFiLlama...', geckoError);
        }
      }

      // Fallback to DeFiLlama for missing prices
      const llamaTokens: { symbol: string; chain: string; address: string }[] = [];
      
      if (price0 === null && DEFILLAMA_TOKENS[token0]) {
        llamaTokens.push({ symbol: token0, ...DEFILLAMA_TOKENS[token0] });
      }
      if (price1 === null && DEFILLAMA_TOKENS[token1]) {
        llamaTokens.push({ symbol: token1, ...DEFILLAMA_TOKENS[token1] });
      }

      if (llamaTokens.length > 0) {
        try {
          const llamaData = await fetchFromDeFiLlama(llamaTokens);
          
          if (llamaData[token0] !== undefined && price0 === null) {
            price0 = llamaData[token0];
            usedSource = 'defillama';
          }
          if (llamaData[token1] !== undefined && price1 === null) {
            price1 = llamaData[token1];
            usedSource = usedSource || 'defillama';
          }
        } catch (llamaError) {
          console.warn('DeFiLlama fetch failed:', llamaError);
        }
      }

      // Calculate final price
      if (price0 !== null && price1 !== null) {
        const finalPrice = price0 / price1;
        setPrice(finalPrice);
        setLastUpdated(new Date());
        setSource(usedSource || 'stablecoin');
        toast.success(`Preço atualizado: ${token0}/${token1}`, {
          description: `Via ${usedSource === 'coingecko' ? 'CoinGecko' : usedSource === 'defillama' ? 'DeFiLlama' : 'cache'}`
        });
      } else if (price0 !== null && isToken1Stable) {
        setPrice(price0);
        setLastUpdated(new Date());
        setSource(usedSource || 'stablecoin');
        toast.success(`Preço atualizado: ${token0}/${token1}`);
      } else if (price1 !== null && isToken0Stable) {
        setPrice(1 / price1);
        setLastUpdated(new Date());
        setSource(usedSource || 'stablecoin');
        toast.success(`Preço atualizado: ${token0}/${token1}`);
      } else {
        throw new Error(`Token não suportado: ${price0 === null ? token0 : token1}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
      toast.error(`Falha ao buscar preço: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [token0, token1]);

  // Auto-fetch when tokens change
  useEffect(() => {
    if (token0 && token1 && token0 !== token1) {
      const timer = setTimeout(() => {
        fetchPrice();
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [token0, token1, fetchPrice]);

  return {
    price,
    isLoading,
    error,
    refetch: fetchPrice,
    lastUpdated,
    source,
  };
}

// Export supported tokens for UI
export const SUPPORTED_TOKENS = Object.keys(COINGECKO_IDS);
export const STABLECOIN_TOKENS = STABLECOINS;
