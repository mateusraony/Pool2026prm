/**
 * LP Position Tracker — CRUD de posições pessoais de LP
 * GET    /api/lp-positions         — lista todas
 * POST   /api/lp-positions         — cria nova
 * PATCH  /api/lp-positions/:id     — atualiza (fees, notas, etc.)
 * DELETE /api/lp-positions/:id     — remove
 */
import { Router } from 'express';
import { getPrisma } from './prisma.js';
import { logService } from '../services/log.service.js';

const router = Router();

// GET /api/lp-positions
router.get('/lp-positions', async (_req, res) => {
  try {
    const positions = await getPrisma().lpPosition.findMany({
      orderBy: { startDate: 'desc' },
    });
    return res.json({ success: true, data: positions, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /lp-positions falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro ao listar posições' });
  }
});

// POST /api/lp-positions
router.post('/lp-positions', async (req, res) => {
  try {
    const { token0, token1, token0Usd, token1Usd, feeTier, startDate, protocol, chain, poolLink, walletAddress, notes } = req.body;

    if (!token0 || !token1) {
      return res.status(400).json({ success: false, error: 'token0 e token1 são obrigatórios' });
    }
    if (typeof token0Usd !== 'number' || token0Usd < 0) {
      return res.status(400).json({ success: false, error: 'token0Usd deve ser número >= 0' });
    }
    if (typeof token1Usd !== 'number' || token1Usd < 0) {
      return res.status(400).json({ success: false, error: 'token1Usd deve ser número >= 0' });
    }
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, error: 'startDate deve ser data válida' });
    }

    const position = await getPrisma().lpPosition.create({
      data: {
        token0: String(token0).toUpperCase(),
        token1: String(token1).toUpperCase(),
        token0Usd,
        token1Usd,
        feesEarned: typeof req.body.feesEarned === 'number' ? req.body.feesEarned : 0,
        feeTier: typeof feeTier === 'number' ? feeTier : 0.3,
        startDate: new Date(startDate),
        protocol: protocol ?? null,
        chain: chain ?? null,
        poolLink: poolLink ?? null,
        walletAddress: walletAddress ?? null,
        notes: notes ?? null,
      },
    });

    return res.status(201).json({ success: true, data: position, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /lp-positions falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro ao criar posição' });
  }
});

// PATCH /api/lp-positions/:id
router.patch('/lp-positions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { feesEarned, notes, poolLink, walletAddress, protocol, chain } = req.body;

    const existing = await getPrisma().lpPosition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Posição não encontrada' });
    }

    const updated = await getPrisma().lpPosition.update({
      where: { id },
      data: {
        ...(typeof feesEarned === 'number' && feesEarned >= 0 ? { feesEarned } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(poolLink !== undefined ? { poolLink } : {}),
        ...(walletAddress !== undefined ? { walletAddress } : {}),
        ...(protocol !== undefined ? { protocol } : {}),
        ...(chain !== undefined ? { chain } : {}),
      },
    });

    return res.json({ success: true, data: updated, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'PATCH /lp-positions falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro ao atualizar posição' });
  }
});

// DELETE /api/lp-positions/:id
router.delete('/lp-positions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id é obrigatório' });
    }

    const existing = await getPrisma().lpPosition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Posição não encontrada' });
    }

    await getPrisma().lpPosition.delete({ where: { id } });
    return res.json({ success: true, message: 'Posição removida', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /lp-positions falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro ao remover posição' });
  }
});

export default router;
