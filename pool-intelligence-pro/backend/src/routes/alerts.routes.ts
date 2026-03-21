import { Router } from 'express';
import { randomUUID } from 'crypto';
import { logService } from '../services/log.service.js';
import { alertService } from '../services/alert.service.js';
import { validate, validateIdParam, alertSchema } from './validation.js';

const router = Router();

// Get all alert rules
router.get('/alerts', async (req, res) => {
  try {
    const rules = alertService.getRules();
    const recent = alertService.getRecentAlerts();

    res.json({
      success: true,
      data: { rules, recentAlerts: recent.slice(0, 20) },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /alerts failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Create alert rule
router.post('/alerts', validate(alertSchema), async (req, res) => {
  try {
    const { poolId, type, threshold, condition } = req.body;
    const id = randomUUID();
    alertService.addRule(id, { type, poolId, value: threshold, condition });

    res.json({
      success: true,
      data: { id },
      message: 'Alert rule created',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /alerts failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Delete alert rule
router.delete('/alerts/:id', validateIdParam, async (req, res) => {
  try {
    const { id } = req.params;
    const existed = alertService.hasRule(id);
    if (!existed) {
      return res.status(404).json({ success: false, error: 'Alert rule not found', timestamp: new Date() });
    }
    alertService.removeRule(id);

    res.json({
      success: true,
      message: 'Alert rule deleted',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /alerts/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
