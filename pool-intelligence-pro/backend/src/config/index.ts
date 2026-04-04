import dotenv from 'dotenv';
dotenv.config();

function safeInt(val: string | undefined, fallback: number): number {
  const parsed = parseInt(val || '', 10);
  return isNaN(parsed) ? fallback : parsed;
}

function safeFloat(val: string | undefined, fallback: number): number {
  const parsed = parseFloat(val || '');
  return isNaN(parsed) ? fallback : parsed;
}

export const config = {
  // Server
  port: safeInt(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: !!process.env.TELEGRAM_BOT_TOKEN,
  },
  
  // Default settings (can be overridden by DB)
  defaults: {
    mode: (process.env.DEFAULT_MODE || 'NORMAL') as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE',
    capital: safeFloat(process.env.DEFAULT_CAPITAL, 1000),
    chains: (process.env.ACTIVE_CHAINS || 'ethereum,arbitrum,base,polygon').split(','),
  },
  
  // Job intervals (ms)
  jobs: {
    radar: safeInt(process.env.JOB_RADAR_INTERVAL, 1800000),      // 30 min
    watchlist: safeInt(process.env.JOB_WATCHLIST_INTERVAL, 60000), // 1 min
    score: safeInt(process.env.JOB_SCORE_INTERVAL, 300000),        // 5 min
    recommendation: safeInt(process.env.JOB_RECOMMENDATION_INTERVAL, 3600000), // 1 hora
    alerts: safeInt(process.env.JOB_ALERTS_INTERVAL, 60000),       // 1 min
    health: safeInt(process.env.JOB_HEALTH_INTERVAL, 60000),       // 1 min
  },
  
  // Cache TTLs (seconds)
  cache: {
    macro: safeInt(process.env.CACHE_TTL_MACRO, 3600),
    price: safeInt(process.env.CACHE_TTL_PRICE, 60),
    watchlist: safeInt(process.env.CACHE_TTL_WATCHLIST, 300),
  },
  
  // Circuit breaker
  circuitBreaker: {
    threshold: safeInt(process.env.CIRCUIT_BREAKER_THRESHOLD, 15),
    timeout: safeInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 120000), // 2 min
  },
  
  // Rate limits por provider (requests per minute)
  rateLimits: {
    defillama: safeInt(process.env.RATE_LIMIT_DEFILLAMA, 30),
    geckoterminal: safeInt(process.env.RATE_LIMIT_GECKOTERMINAL, 30),
    dexscreener: safeInt(process.env.RATE_LIMIT_DEXSCREENER, 60),
  },
  
  // Score weights — calibrated so excellent pools can reach 80-90 range
  scoreWeights: {
    health: 50,
    return: 40,
    risk: 25,
  },
  
  // Thresholds
  thresholds: {
    minLiquidity: safeFloat(process.env.MIN_LIQUIDITY, 100000),
    minVolume24h: safeFloat(process.env.MIN_VOLUME_24H, 10000),
    minPoolAgeDays: safeInt(process.env.MIN_POOL_AGE_DAYS, 7),
    maxDivergencePercent: safeFloat(process.env.MAX_DIVERGENCE_PERCENT, 10),
  },

  // Timezone (Fase 5 — agendamento profissional)
  reportTimezone: process.env.REPORT_TIMEZONE || 'America/Sao_Paulo',
};

export type Config = typeof config;
