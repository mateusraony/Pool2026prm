import { z } from 'zod';
import dotenv from 'dotenv';

// Carrega variáveis de ambiente
dotenv.config();

// Schema de validação das variáveis de ambiente
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // Segurança
  API_SECRET: z.string().min(16).optional().default('change-me-in-production-123'),

  // Carteiras
  MONITORED_WALLETS: z.string().optional().default(''),

  // Redes
  ENABLED_NETWORKS: z.string().optional().default('ethereum,arbitrum,base'),

  // RPCs
  RPC_ETHEREUM: z.string().optional().default('https://eth.llamarpc.com'),
  RPC_ARBITRUM: z.string().optional().default('https://arb1.arbitrum.io/rpc'),
  RPC_BASE: z.string().optional().default('https://mainnet.base.org'),

  // APIs
  COINGECKO_API_URL: z.string().optional().default('https://api.coingecko.com/api/v3'),
  GRAPH_UNISWAP_ETHEREUM: z.string().optional().default('https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'),
  GRAPH_UNISWAP_ARBITRUM: z.string().optional().default('https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-arbitrum'),
  GRAPH_UNISWAP_BASE: z.string().optional().default('https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest'),

  // Configurações de Risco (padrões)
  DEFAULT_TOTAL_BANKROLL: z.coerce.number().optional().default(10000),
  DEFAULT_RISK_PROFILE: z.enum(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).optional().default('NORMAL'),
  DEFAULT_MAX_PERCENT_PER_POOL: z.coerce.number().optional().default(5),
  DEFAULT_MAX_PERCENT_PER_NETWORK: z.coerce.number().optional().default(25),
  DEFAULT_MAX_PERCENT_VOLATILE: z.coerce.number().optional().default(20),

  // Filtros
  MIN_TVL_USD: z.coerce.number().optional().default(100000),
  MIN_VOLUME_24H_USD: z.coerce.number().optional().default(10000),

  // Scheduler
  SCAN_INTERVAL_MINUTES: z.coerce.number().optional().default(30),
  PRICE_UPDATE_MINUTES: z.coerce.number().optional().default(5),
  POSITION_SYNC_MINUTES: z.coerce.number().optional().default(15),
  ALERT_CHECK_MINUTES: z.coerce.number().optional().default(10),

  // Alertas
  ALERT_OUT_OF_RANGE_PERCENT: z.coerce.number().optional().default(5),
  ALERT_TVL_DROP_PERCENT: z.coerce.number().optional().default(20),
  ALERT_APR_MIN: z.coerce.number().optional().default(5),

  // Ambiente
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  PORT: z.coerce.number().optional().default(3001),
  FRONTEND_URL: z.string().optional().default('http://localhost:5173'),
});

// Valida e exporta configuração
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = {
  // Database
  databaseUrl: parsed.data.DATABASE_URL,

  // Telegram
  telegram: {
    botToken: parsed.data.TELEGRAM_BOT_TOKEN,
    chatId: parsed.data.TELEGRAM_CHAT_ID,
    enabled: !!(parsed.data.TELEGRAM_BOT_TOKEN && parsed.data.TELEGRAM_CHAT_ID),
  },

  // Segurança
  apiSecret: parsed.data.API_SECRET,

  // Carteiras
  monitoredWallets: parsed.data.MONITORED_WALLETS
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0),

  // Redes
  enabledNetworks: parsed.data.ENABLED_NETWORKS
    .split(',')
    .map(n => n.trim().toLowerCase())
    .filter(n => n.length > 0),

  // RPCs
  rpcs: {
    ethereum: parsed.data.RPC_ETHEREUM,
    arbitrum: parsed.data.RPC_ARBITRUM,
    base: parsed.data.RPC_BASE,
  } as Record<string, string>,

  // APIs
  apis: {
    coingecko: parsed.data.COINGECKO_API_URL,
    graph: {
      ethereum: parsed.data.GRAPH_UNISWAP_ETHEREUM,
      arbitrum: parsed.data.GRAPH_UNISWAP_ARBITRUM,
      base: parsed.data.GRAPH_UNISWAP_BASE,
    } as Record<string, string>,
  },

  // Configurações de Risco (padrões)
  defaults: {
    totalBankroll: parsed.data.DEFAULT_TOTAL_BANKROLL,
    riskProfile: parsed.data.DEFAULT_RISK_PROFILE as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE',
    maxPercentPerPool: parsed.data.DEFAULT_MAX_PERCENT_PER_POOL,
    maxPercentPerNetwork: parsed.data.DEFAULT_MAX_PERCENT_PER_NETWORK,
    maxPercentVolatile: parsed.data.DEFAULT_MAX_PERCENT_VOLATILE,
  },

  // Filtros
  filters: {
    minTvlUsd: parsed.data.MIN_TVL_USD,
    minVolume24hUsd: parsed.data.MIN_VOLUME_24H_USD,
  },

  // Scheduler
  scheduler: {
    scanIntervalMinutes: parsed.data.SCAN_INTERVAL_MINUTES,
    priceUpdateMinutes: parsed.data.PRICE_UPDATE_MINUTES,
    positionSyncMinutes: parsed.data.POSITION_SYNC_MINUTES,
    alertCheckMinutes: parsed.data.ALERT_CHECK_MINUTES,
  },

  // Alertas
  alerts: {
    outOfRangePercent: parsed.data.ALERT_OUT_OF_RANGE_PERCENT,
    tvlDropPercent: parsed.data.ALERT_TVL_DROP_PERCENT,
    aprMin: parsed.data.ALERT_APR_MIN,
  },

  // Ambiente
  env: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  frontendUrl: parsed.data.FRONTEND_URL,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
};

export type Config = typeof config;
