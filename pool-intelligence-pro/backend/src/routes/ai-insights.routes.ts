/**
 * AI Insights Routes — ETAPA 17
 */

import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { aiInsightsService } from '../services/ai-insights.service.js';
import { getLatestRadarResults } from '../jobs/index.js';

const router = Router();

// GET /api/pools/:chain/:address/insights
// Gera análise AI da pool (usa Claude API se disponível, senão rule-based)
router.get('/pools/:chain/:address/insights', async (req, res) => {
  try {
    const { chain, address } = req.params;

    if (!chain || !address || address.length > 200) {
      return res.status(400).json({ success: false, error: 'Invalid chain or address', timestamp: new Date() });
    }

    // Find pool from radar results
    const radarResults = getLatestRadarResults();
    const found = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress?.toLowerCase() === address.toLowerCase() ||
       r.pool.externalId?.toLowerCase() === address.toLowerCase())
    );

    if (!found) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found in radar. Wait for next radar cycle or add to watchlist.',
        timestamp: new Date(),
      });
    }

    const insight = await aiInsightsService.getInsight(found.pool, found.score);
    res.json({ success: true, data: insight, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools/:chain/:address/insights failed', { error });
    res.status(500).json({ success: false, error: 'Failed to generate insights', timestamp: new Date() });
  }
});

export default router;
