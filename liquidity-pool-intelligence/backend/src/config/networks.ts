// Configurações específicas de cada rede suportada

export interface NetworkConfig {
  name: string;
  chainId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorer: string;
  // Uniswap V3 contracts
  uniswapV3: {
    factory: string;
    quoter: string;
    positionManager: string;
    subgraphUrl: string;
  };
  // Gas estimations (em gwei)
  gasEstimates: {
    mintPosition: number; // gas units
    collectFees: number;
    removeLiquidity: number;
    avgGasPrice: number; // gwei
  };
}

export const networks: Record<string, NetworkConfig> = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://ethereum.publicnode.com',
    ],
    blockExplorer: 'https://etherscan.io',
    uniswapV3: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      subgraphUrl: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
    },
    gasEstimates: {
      mintPosition: 500000,
      collectFees: 150000,
      removeLiquidity: 300000,
      avgGasPrice: 30, // gwei
    },
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://rpc.ankr.com/arbitrum',
    ],
    blockExplorer: 'https://arbiscan.io',
    uniswapV3: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      positionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      subgraphUrl: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-arbitrum',
    },
    gasEstimates: {
      mintPosition: 800000,
      collectFees: 250000,
      removeLiquidity: 500000,
      avgGasPrice: 0.1, // gwei (muito mais barato)
    },
  },
  base: {
    name: 'Base',
    chainId: 8453,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base.publicnode.com',
    ],
    blockExplorer: 'https://basescan.org',
    uniswapV3: {
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
      subgraphUrl: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
    },
    gasEstimates: {
      mintPosition: 600000,
      collectFees: 200000,
      removeLiquidity: 400000,
      avgGasPrice: 0.01, // gwei (muito barato)
    },
  },
};

// Tokens conhecidos (bluechips e stables) para classificação de pares
export const knownTokens: Record<string, { type: 'stable' | 'bluechip' | 'altcoin'; symbol: string }> = {
  // Stablecoins
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { type: 'stable', symbol: 'USDC' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { type: 'stable', symbol: 'USDT' },
  '0x6b175474e89094c44da98b954eedeac495271d0f': { type: 'stable', symbol: 'DAI' },
  '0x4fabb145d64652a948d72533023f6e7a623c7c53': { type: 'stable', symbol: 'BUSD' },
  '0x853d955acef822db058eb8505911ed77f175b99e': { type: 'stable', symbol: 'FRAX' },
  // Bluechips
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { type: 'bluechip', symbol: 'WETH' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { type: 'bluechip', symbol: 'WBTC' },
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { type: 'bluechip', symbol: 'wstETH' },
  '0xae78736cd615f374d3085123a210448e74fc6393': { type: 'bluechip', symbol: 'rETH' },
  '0xbe9895146f7af43049ca1c1ae358b0541ea49704': { type: 'bluechip', symbol: 'cbETH' },
};

// Função para classificar tipo de par
export function classifyPairType(
  token0Address: string,
  token1Address: string
): 'stable_stable' | 'bluechip_stable' | 'altcoin_stable' | 'other' {
  const t0 = knownTokens[token0Address.toLowerCase()];
  const t1 = knownTokens[token1Address.toLowerCase()];

  if (t0?.type === 'stable' && t1?.type === 'stable') {
    return 'stable_stable';
  }

  if (
    (t0?.type === 'bluechip' && t1?.type === 'stable') ||
    (t0?.type === 'stable' && t1?.type === 'bluechip')
  ) {
    return 'bluechip_stable';
  }

  if (
    (t0?.type === 'altcoin' || !t0) && t1?.type === 'stable' ||
    t0?.type === 'stable' && (t1?.type === 'altcoin' || !t1)
  ) {
    return 'altcoin_stable';
  }

  return 'other';
}

// Fee tiers do Uniswap V3 (em basis points)
export const feeTiers = {
  100: { label: '0.01%', description: 'Pools estáveis' },
  500: { label: '0.05%', description: 'Pares correlacionados' },
  3000: { label: '0.30%', description: 'Pares padrão' },
  10000: { label: '1.00%', description: 'Pares exóticos/voláteis' },
};
