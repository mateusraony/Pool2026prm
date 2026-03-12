import { Router } from 'express';
import { logService } from '../services/log.service.js';
import { rangeMonitorService } from '../services/range.service.js';
import { validate, validateIdParam, rangePositionSchema } from './validation.js';

const router = Router();

// Get all range positions
router.get('/ranges', async (req, res) => {
  try {
    const positions = rangeMonitorService.getPositions();
    const stats = rangeMonitorService.getStats();

    res.json({ success: true, data: positions, stats, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /ranges failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Create range position to monitor
router.post('/ranges', validate(rangePositionSchema), async (req, res) => {
  try {
    const {
      poolId, chain, poolAddress, token0Symbol, token1Symbol,
      rangeLower, rangeUpper, entryPrice, capital, mode, alertThreshold,
    } = req.body;

    const position = rangeMonitorService.createPosition({
      poolId,
      chain,
      poolAddress: poolAddress || poolId,
      token0Symbol,
      token1Symbol,
      rangeLower,
      rangeUpper,
      entryPrice: entryPrice || (rangeLower + rangeUpper) / 2,
      capital,
      mode,
      alertThreshold,
    });

    res.json({
      success: true,
      data: position,
      message: 'Range monitoring started! You will be notified when price approaches the edges.',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Delete range position
router.delete('/ranges/:id', validateIdParam, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = rangeMonitorService.deletePosition(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    res.json({ success: true, message: 'Range monitoring stopped', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /ranges/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Manually trigger range check (for testing)
router.post('/ranges/check', async (req, res) => {
  try {
    await rangeMonitorService.checkAllPositions();

    res.json({ success: true, message: 'Range check completed', stats: rangeMonitorService.getStats(), timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges/check failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Trigger portfolio report manually
router.post('/ranges/report', async (req, res) => {
  try {
    await rangeMonitorService.sendPortfolioReport();
    res.json({ success: true, message: 'Portfolio report sent via Telegram', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges/report failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
