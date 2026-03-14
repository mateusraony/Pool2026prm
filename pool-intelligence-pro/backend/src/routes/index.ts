import { Router } from 'express';
import { getAllProvidersHealth } from '../adapters/index.js';
import { cacheService } from '../services/cache.service.js';
import { alertService } from '../services/alert.service.js';
import { metricsService } from '../services/metrics.service.js';
import { logService } from '../services/log.service.js';
import { getMemoryStoreStats } from '../jobs/index.js';

import poolsRouter from './pools.routes.js';
import settingsRouter from './settings.routes.js';
import alertsRouter from './alerts.routes.js';
import rangesRouter from './ranges.routes.js';
import dataRouter from './data.routes.js';

const router = Router();

// Health check — comprehensive system status
router.get('/health', async (req, res) => {
  const providers = await getAllProvidersHealth();

  const mandatory = providers.filter(p => !p.isOptional);
  const healthyMandatory = mandatory.filter(p => p.isHealthy).length;

  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  if (healthyMandatory === mandatory.length && mandatory.length > 0) {
    status = 'HEALTHY';
  } else if (healthyMandatory > 0) {
    status = 'DEGRADED';
  } else {
    status = 'UNHEALTHY';
  }

  const metrics = metricsService.getSnapshot();

  res.json({
    status,
    uptime: metrics.uptime,
    memory: metrics.memory,
    providers,
    cache: cacheService.getStats(),
    memoryStore: getMemoryStoreStats(),
    alerts: alertService.getStats(),
    requests: metrics.requests,
    jobs: metrics.jobs,
    logs: logService.getSummary(60),
    timestamp: new Date(),
  });
});

// Mount sub-routers
router.use(poolsRouter);
router.use(settingsRouter);
router.use(alertsRouter);
router.use(rangesRouter);
router.use(dataRouter);

export default router;
