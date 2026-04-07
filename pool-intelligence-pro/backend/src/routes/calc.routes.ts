/**
 * Rotas de cálculo avançado — features inspiradas no Revert Finance
 * POST /api/calc/optimal-compound  — Auto-compound ROI Calculator
 * POST /api/calc/lending           — Lending Simulator
 * GET  /api/backtest-real/:chain/:address — Backtest com dados reais TheGraph
 */
import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { calcOptimalCompound, calcLendingPosition } from '../services/calc.service.js';

const router = Router();

// ============================================
// POST /api/calc/optimal-compound
// Calcula intervalo ótimo de auto-compound
// ============================================
router.post('/optimal-compound', async (req, res) => {
  try {
    const { capital, apr, timeInRangePct, gasEstimate, daysElapsed, chain } = req.body;

    if (typeof capital !== 'number' || capital <= 0) {
      return res.status(400).json({ success: false, error: 'capital deve ser número > 0' });
    }
    if (typeof apr !== 'number' || apr < 0) {
      return res.status(400).json({ success: false, error: 'apr deve ser número >= 0' });
    }

    // Gas por chain se não fornecido
    const gasMap: Record<string, number> = {
      ethereum: 30, arbitrum: 3, base: 1.5, optimism: 2, polygon: 0.5,
    };
    const gas = typeof gasEstimate === 'number' && gasEstimate > 0
      ? gasEstimate
      : gasMap[(chain as string) ?? 'ethereum'] ?? 5;

    const result = calcOptimalCompound({
      capital,
      apr: apr ?? 0,
      timeInRangePct: timeInRangePct ?? 70,
      gasEstimate: gas,
      daysElapsed: daysElapsed ?? 0,
    });

    return res.json({ success: true, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /calc/optimal-compound falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro interno no cálculo de compound' });
  }
});

// ============================================
// POST /api/calc/lending
// Simula posição de lending usando LP como colateral
// ============================================
router.post('/lending', async (req, res) => {
  try {
    const { capital, entryPrice, poolScore, poolApr, ltvManual, interestRateManual, borrowAmount } = req.body;

    if (typeof capital !== 'number' || capital <= 0) {
      return res.status(400).json({ success: false, error: 'capital deve ser número > 0' });
    }
    if (typeof borrowAmount !== 'number' || borrowAmount < 0) {
      return res.status(400).json({ success: false, error: 'borrowAmount deve ser número >= 0' });
    }
    if (typeof entryPrice !== 'number' || entryPrice <= 0) {
      return res.status(400).json({ success: false, error: 'entryPrice deve ser número > 0' });
    }

    const ltvMax = (poolScore ?? 50) >= 75 ? 70 : (poolScore ?? 50) >= 50 ? 55 : 35;
    const maxBorrow = capital * ltvMax / 100;
    if (borrowAmount > maxBorrow) {
      return res.status(400).json({
        success: false,
        error: `borrowAmount (${borrowAmount}) excede capacidade máxima de empréstimo (${maxBorrow.toFixed(2)}) para LTV de ${ltvMax}%`,
      });
    }

    const result = calcLendingPosition({
      capital,
      entryPrice,
      poolScore: poolScore ?? 50,
      poolApr: poolApr ?? 0,
      ltvManual: ltvManual ?? 50,
      interestRateManual: interestRateManual ?? 8,
      borrowAmount,
    });

    return res.json({ success: true, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /calc/lending falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro interno no cálculo de lending' });
  }
});

// ============================================
// GET /api/backtest-real/:chain/:address
// Backtest com dados reais do TheGraph
// ============================================
router.get('/backtest-real/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;
    const { lower, upper, capital, days } = req.query;

    if (!chain || !address) {
      return res.status(400).json({ success: false, error: 'chain e address são obrigatórios' });
    }

    const rangeLower = parseFloat(lower as string);
    const rangeUpper = parseFloat(upper as string);
    const capitalUsd = parseFloat(capital as string) || 1000;
    const periodDays = parseInt(days as string) || 7;

    if (isNaN(rangeLower) || isNaN(rangeUpper) || rangeLower >= rangeUpper) {
      return res.status(400).json({ success: false, error: 'lower e upper devem ser números válidos com lower < upper' });
    }

    if (![7, 14, 30, 90].includes(periodDays)) {
      return res.status(400).json({ success: false, error: 'days deve ser 7, 14, 30 ou 90' });
    }

    // Import dinâmico para evitar circular dependency
    const { calcRealBacktest } = await import('../services/backtest-real.service.js');

    const result = await calcRealBacktest({
      chain,
      address,
      rangeLower,
      rangeUpper,
      capital: capitalUsd,
      days: periodDays as 7 | 14 | 30 | 90,
    });

    return res.json({ success: true, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /backtest-real falhou', { error });
    return res.status(500).json({ success: false, error: 'Erro interno no backtest real' });
  }
});

export default router;
