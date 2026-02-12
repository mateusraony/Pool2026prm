import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001'),
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
    capital: parseFloat(process.env.DEFAULT_CAPITAL || '1000'),
    chains: (process.env.ACTIVE_CHAINS || 'ethereum,arbitrum,base,polygon').split(','),
  },
  
  // Job intervals (ms)
  jobs: {
    radar: parseInt(process.env.JOB_RADAR_INTERVAL || '1800000'),      // 30 min
    watchlist: parseInt(process.env.JOB_WATCHLIST_INTERVAL || '60000'), // 1 min
    score: parseInt(process.env.JOB_SCORE_INTERVAL || '300000'),        // 5 min
    recommendation: parseInt(process.env.JOB_RECOMMENDATION_INTERVAL || '3600000'), // 1 hora
    alerts: parseInt(process.env.JOB_ALERTS_INTERVAL || '60000'),       // 1 min
    health: parseInt(process.env.JOB_HEALTH_INTERVAL || '60000'),       // 1 min
  },
  
  // Cache TTLs (seconds)
  cache: {
    macro: parseInt(process.env.CACHE_TTL_MACRO || '3600'),
    price: parseInt(process.env.CACHE_TTL_PRICE || '60'),
    watchlist: parseInt(process.env.CACHE_TTL_WATCHLIST || '300'),
  },
  
  // Circuit breaker
  circuitBreaker: {
    threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '5'),
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '300000'), // 5 min
  },
  
  // Rate limits por provider (requests per minute)
  rateLimits: {
    defillama: parseInt(process.env.RATE_LIMIT_DEFILLAMA || '30'),
    geckoterminal: parseInt(process.env.RATE_LIMIT_GECKOTERMINAL || '30'),
    dexscreener: parseInt(process.env.RATE_LIMIT_DEXSCREENER || '60'),
  },
  
  // Score weights
  scoreWeights: {
    health: 40,
    return: 35,
    risk: 25,
  },
  
  // Thresholds
  thresholds: {
    minLiquidity: parseFloat(process.env.MIN_LIQUIDITY || '100000'),
    minVolume24h: parseFloat(process.env.MIN_VOLUME_24H || '10000'),
    minPoolAgeDays: parseInt(process.env.MIN_POOL_AGE_DAYS || '7'),
    maxDivergencePercent: parseFloat(process.env.MAX_DIVERGENCE_PERCENT || '10'),
  },
};

export type Config = typeof config;
