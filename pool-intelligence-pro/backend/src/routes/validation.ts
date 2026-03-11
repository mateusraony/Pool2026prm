import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// ============================================
// PARAM VALIDATION
// ============================================

/** Safe poolId pattern: alphanumeric, colons, hyphens, underscores, dots, slashes (for chain/address combos) */
const POOL_ID_PATTERN = /^[a-zA-Z0-9:_\-./]+$/;

/** Validates req.params.poolId against injection. */
export function validatePoolIdParam(req: Request, res: Response, next: NextFunction) {
  const { poolId } = req.params;
  if (!poolId || poolId.length > 200 || !POOL_ID_PATTERN.test(poolId)) {
    return res.status(400).json({ success: false, error: 'Invalid poolId format' });
  }
  next();
}

/** Validates a generic :id param (alphanumeric, hyphens, underscores). */
export function validateIdParam(req: Request, res: Response, next: NextFunction) {
  const { id } = req.params;
  if (!id || id.length > 100 || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
    return res.status(400).json({ success: false, error: 'Invalid id format' });
  }
  next();
}

// ============================================
// SCHEMAS
// ============================================

export const watchlistSchema = z.object({
  poolId: z.string().min(1),
  chain: z.string().min(1),
  address: z.string().min(1),
});

export const alertSchema = z.object({
  poolId: z.string().optional(),
  type: z.string().min(1),
  threshold: z.number(),
});

export const rangePositionSchema = z.object({
  poolId: z.string().min(1),
  chain: z.string().optional().default('ethereum'),
  poolAddress: z.string().optional(),
  token0Symbol: z.string().optional().default('TOKEN0'),
  token1Symbol: z.string().optional().default('TOKEN1'),
  rangeLower: z.number().positive(),
  rangeUpper: z.number().positive(),
  entryPrice: z.number().optional(),
  capital: z.number().optional().default(1000),
  mode: z.enum(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).optional().default('NORMAL'),
  alertThreshold: z.number().optional().default(5),
});

export const rangeCalcSchema = z.object({
  price: z.number().positive('price is required and must be > 0'),
  volAnn: z.number().optional().default(0.40),
  horizonDays: z.number().optional().default(7),
  riskMode: z.string().optional().default('NORMAL'),
  tickSpacing: z.number().optional(),
  poolType: z.string().optional().default('CL'),
  capital: z.number().optional().default(1000),
  tvl: z.number().optional(),
  fees24h: z.number().optional(),
});

export const favoriteSchema = z.object({
  poolId: z.string().min(1),
  chain: z.string().min(1),
  poolAddress: z.string().min(1),
  token0Symbol: z.string().optional().default(''),
  token1Symbol: z.string().optional().default(''),
  protocol: z.string().optional().default(''),
});

export const noteSchema = z.object({
  poolId: z.string().min(1),
  text: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
});

export const telegramTestRecsSchema = z.object({
  limit: z.number().optional().default(5),
  useTokenFilter: z.boolean().optional().default(true),
});

export const telegramConfigSchema = z.object({
  chatId: z.string().optional(),
  botToken: z.string().optional(),
});

export const riskConfigSchema = z.object({
  totalBanca: z.number().min(0),
  profile: z.string().min(1),
  maxPerPool: z.number().min(0).max(100),
  maxPerNetwork: z.number().min(0).max(100),
  maxVolatile: z.number().min(0).max(100),
  allowedNetworks: z.array(z.string()).default([]),
  allowedDexs: z.array(z.string()).default([]),
  allowedTokens: z.array(z.string()).default([]),
  excludeMemecoins: z.boolean().default(false),
});

export const notificationSettingsSchema = z.object({
  appUrl: z.string().optional(),
  notifications: z.object({
    rangeExit: z.boolean().optional(),
    nearRangeExit: z.boolean().optional(),
    dailyReport: z.boolean().optional(),
    newRecommendation: z.boolean().optional(),
    priceAlerts: z.boolean().optional(),
    systemAlerts: z.boolean().optional(),
  }).optional(),
  dailyReportHour: z.number().min(0).max(23).optional(),
  dailyReportMinute: z.number().min(0).max(59).optional(),
  tokenFilters: z.array(z.string()).optional(),
}).partial();

// ============================================
// MIDDLEWARE
// ============================================

/** Express middleware that validates req.body against a Zod schema. */
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return res.status(400).json({
        success: false,
        error: messages.join('; '),
      });
    }
    req.body = result.data; // use parsed/coerced values
    next();
  };
}
