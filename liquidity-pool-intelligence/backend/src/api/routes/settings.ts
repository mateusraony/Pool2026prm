import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { riskProfileConfigs } from '../../types/settings.js';
import { log } from '../../utils/logger.js';

const router = Router();

// Schema de validação para atualização de configurações
const updateSettingsSchema = z.object({
  totalBankroll: z.number().min(0).optional(),
  riskProfile: z.enum(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).optional(),
  maxPercentPerPool: z.number().min(1).max(100).optional(),
  maxPercentPerNetwork: z.number().min(1).max(100).optional(),
  maxPercentVolatile: z.number().min(0).max(100).optional(),
  enabledNetworks: z.array(z.string()).optional(),
  allowedPairTypes: z.array(z.string()).optional(),
  telegramChatId: z.string().optional().nullable(),
});

// GET /api/settings - Retorna configurações atuais
router.get('/', async (req: Request, res: Response) => {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 1 },
    });

    if (!settings) {
      res.status(404).json({ error: 'Settings not found' });
      return;
    }

    const riskConfig = riskProfileConfigs[settings.riskProfile];

    res.json({
      settings: {
        ...settings,
        totalBankroll: Number(settings.totalBankroll),
        maxPercentPerPool: Number(settings.maxPercentPerPool),
        maxPercentPerNetwork: Number(settings.maxPercentPerNetwork),
        maxPercentVolatile: Number(settings.maxPercentVolatile),
      },
      riskConfig,
      availableNetworks: ['ethereum', 'arbitrum', 'base'],
      availablePairTypes: ['stable_stable', 'bluechip_stable', 'altcoin_stable'],
    });
  } catch (error) {
    log.error('Failed to get settings', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/settings - Atualiza configurações
router.put('/', async (req: Request, res: Response) => {
  try {
    const validation = updateSettingsSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Validation error',
        details: validation.error.errors,
      });
      return;
    }

    const data = validation.data;

    // Atualiza configurações
    const updated = await prisma.settings.update({
      where: { id: 1 },
      data: {
        ...(data.totalBankroll !== undefined && { totalBankroll: data.totalBankroll }),
        ...(data.riskProfile && { riskProfile: data.riskProfile }),
        ...(data.maxPercentPerPool !== undefined && { maxPercentPerPool: data.maxPercentPerPool }),
        ...(data.maxPercentPerNetwork !== undefined && { maxPercentPerNetwork: data.maxPercentPerNetwork }),
        ...(data.maxPercentVolatile !== undefined && { maxPercentVolatile: data.maxPercentVolatile }),
        ...(data.enabledNetworks && { enabledNetworks: data.enabledNetworks }),
        ...(data.allowedPairTypes && { allowedPairTypes: data.allowedPairTypes }),
        ...(data.telegramChatId !== undefined && { telegramChatId: data.telegramChatId }),
      },
    });

    log.info('Settings updated', { updatedFields: Object.keys(data) });

    res.json({
      message: 'Settings updated successfully',
      settings: {
        ...updated,
        totalBankroll: Number(updated.totalBankroll),
        maxPercentPerPool: Number(updated.maxPercentPerPool),
        maxPercentPerNetwork: Number(updated.maxPercentPerNetwork),
        maxPercentVolatile: Number(updated.maxPercentVolatile),
      },
    });
  } catch (error) {
    log.error('Failed to update settings', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/settings/risk-profiles - Lista perfis de risco disponíveis
router.get('/risk-profiles', (req: Request, res: Response) => {
  const profiles = Object.entries(riskProfileConfigs).map(([key, config]) => ({
    id: key,
    ...config,
  }));

  res.json({ profiles });
});

export default router;
