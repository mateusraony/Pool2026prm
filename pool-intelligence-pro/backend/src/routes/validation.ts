import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

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
