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
import { extractError, errorResponse } from '../utils/errorUtils.js';

const router = Router();

// GET /api/lp-positions
router.get('/lp-positions', async (_req, res) => {
  try {
    const positions = await getPrisma().lpPosition.findMany({
      orderBy: { startDate: 'desc' },
    });
    return res.json({ success: true, data: positions, timestamp: new Date() });
  } catch (error) {
    const e = extractError(error);
    // P2021 = tabela ainda não existe no banco → retorna vazio em vez de erro 500
    // Isso ocorre quando prisma db push ainda não foi executado (ex: primeiro deploy)
    if (e.code === 'P2021' || e.code === 'P2022') {
      logService.warn('SYSTEM', `GET /lp-positions: tabela não existe (${e.code}) — retornando array vazio`);
      return res.json({
        success: true,
        data: [],
        warning: 'Tabela de posições não encontrada no banco. Execute: prisma db push',
        timestamp: new Date(),
      });
    }
    logService.error('SYSTEM', `GET /lp-positions falhou [${e.code}]`, { detail: e.detail });
    return res.status(500).json({ success: false, ...errorResponse(error, 'Erro ao listar posições') });
  }
});

// POST /api/lp-positions
router.post('/lp-positions', async (req, res) => {
  try {
    const {
      token0, token1, token0Usd, token1Usd, feesEarned,
      feeTier, startDate, protocol, chain, poolLink, walletAddress, notes,
    } = req.body;

    if (!token0 || !token1) {
      return res.status(400).json({ success: false, error: 'token0 e token1 são obrigatórios', code: 'VALIDATION' });
    }
    if (typeof token0Usd !== 'number' || token0Usd < 0) {
      return res.status(400).json({ success: false, error: 'token0Usd deve ser número >= 0', code: 'VALIDATION' });
    }
    if (typeof token1Usd !== 'number' || token1Usd < 0) {
      return res.status(400).json({ success: false, error: 'token1Usd deve ser número >= 0', code: 'VALIDATION' });
    }
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, error: 'startDate deve ser data válida', code: 'VALIDATION' });
    }

    const position = await getPrisma().lpPosition.create({
      data: {
        token0: String(token0).toUpperCase(),
        token1: String(token1).toUpperCase(),
        token0Usd,
        token1Usd,
        feesEarned: typeof feesEarned === 'number' ? feesEarned : 0,
        feeTier: typeof feeTier === 'number' ? feeTier : 0.3,
        startDate: new Date(startDate),
        protocol: protocol ?? null,
        chain: chain ?? null,
        poolLink: poolLink ?? null,
        walletAddress: walletAddress ?? null,
        notes: notes ?? null,
      },
    });

    logService.info('SYSTEM', `POST /lp-positions criada: ${position.token0}/${position.token1} id=${position.id}`);
    return res.status(201).json({ success: true, data: position, timestamp: new Date() });
  } catch (error) {
    const e = extractError(error);
    logService.error('SYSTEM', `POST /lp-positions falhou [${e.code}]`, { detail: e.detail, body: req.body });
    return res.status(500).json({ success: false, ...errorResponse(error, 'Erro ao criar posição') });
  }
});

// PATCH /api/lp-positions/:id
router.patch('/lp-positions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { feesEarned, notes, poolLink, walletAddress, protocol, chain } = req.body;

    const existing = await getPrisma().lpPosition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Posição não encontrada', code: 'NOT_FOUND' });
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

    logService.info('SYSTEM', `PATCH /lp-positions/${id} atualizada`);
    return res.json({ success: true, data: updated, timestamp: new Date() });
  } catch (error) {
    const e = extractError(error);
    logService.error('SYSTEM', `PATCH /lp-positions/${req.params.id} falhou [${e.code}]`, { detail: e.detail });
    return res.status(500).json({ success: false, ...errorResponse(error, 'Erro ao atualizar posição') });
  }
});

// DELETE /api/lp-positions/:id
router.delete('/lp-positions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, error: 'id é obrigatório', code: 'VALIDATION' });
    }

    const existing = await getPrisma().lpPosition.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Posição não encontrada', code: 'NOT_FOUND' });
    }

    await getPrisma().lpPosition.delete({ where: { id } });
    logService.info('SYSTEM', `DELETE /lp-positions/${id} removida`);
    return res.json({ success: true, message: 'Posição removida', timestamp: new Date() });
  } catch (error) {
    const e = extractError(error);
    logService.error('SYSTEM', `DELETE /lp-positions/${req.params.id} falhou [${e.code}]`, { detail: e.detail });
    return res.status(500).json({ success: false, ...errorResponse(error, 'Erro ao remover posição') });
  }
});

export default router;
