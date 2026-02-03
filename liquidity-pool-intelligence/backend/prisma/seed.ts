import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Cria configurações iniciais
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      totalBankroll: 10000,
      riskProfile: 'NORMAL',
      maxPercentPerPool: 5,
      maxPercentPerNetwork: 25,
      maxPercentVolatile: 20,
      enabledNetworks: ['ethereum', 'arbitrum', 'base'],
      allowedPairTypes: ['stable_stable', 'bluechip_stable'],
    },
  });

  console.log('Settings created:', settings);

  // Adiciona algumas pools de exemplo para testes
  const examplePools = [
    {
      id: 'ethereum_uniswap_v3_0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      network: 'ethereum',
      dex: 'uniswap_v3',
      address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
      token0Symbol: 'USDC',
      token1Symbol: 'ETH',
      token0Address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      token0Decimals: 6,
      token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
      token1Decimals: 18,
      feeTier: 500,
      tvlUsd: 250000000,
      volume24hUsd: 50000000,
      volume7dUsd: 350000000,
      currentPrice: 0.00035, // ETH/USDC
      pairType: 'bluechip_stable',
    },
    {
      id: 'ethereum_uniswap_v3_0x5777d92f208679db4b9778590fa3cab3ac9e2168',
      network: 'ethereum',
      dex: 'uniswap_v3',
      address: '0x5777d92f208679db4b9778590fa3cab3ac9e2168',
      token0Symbol: 'DAI',
      token1Symbol: 'USDC',
      token0Address: '0x6b175474e89094c44da98b954eedeac495271d0f',
      token0Decimals: 18,
      token1Address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      token1Decimals: 6,
      feeTier: 100,
      tvlUsd: 100000000,
      volume24hUsd: 10000000,
      volume7dUsd: 70000000,
      currentPrice: 1.0001,
      pairType: 'stable_stable',
    },
    {
      id: 'arbitrum_uniswap_v3_0xc31e54c7a869b9fcbecc14363cf510d1c41fa443',
      network: 'arbitrum',
      dex: 'uniswap_v3',
      address: '0xc31e54c7a869b9fcbecc14363cf510d1c41fa443',
      token0Symbol: 'WETH',
      token1Symbol: 'USDC',
      token0Address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
      token0Decimals: 18,
      token1Address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      token1Decimals: 6,
      feeTier: 500,
      tvlUsd: 150000000,
      volume24hUsd: 30000000,
      volume7dUsd: 210000000,
      currentPrice: 0.00035,
      pairType: 'bluechip_stable',
    },
  ];

  for (const pool of examplePools) {
    await prisma.pool.upsert({
      where: { id: pool.id },
      update: pool,
      create: {
        ...pool,
        lastScannedAt: new Date(),
      },
    });
    console.log(`Pool created: ${pool.token0Symbol}/${pool.token1Symbol} on ${pool.network}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
