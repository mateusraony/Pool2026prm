import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { logService } from './services/log.service.js';

// Catch unhandled errors so they show in Render logs
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts from Vite build
}));
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check (FIRST - before anything else, for Render health checks)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Request logging (skip health checks and static files)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && !req.path.startsWith('/assets/')) {
      logService.info('SYSTEM', req.method + ' ' + req.path + ' ' + res.statusCode + ' ' + duration + 'ms');
    }
  });
  next();
});

// ============================================
// API ROUTES — loaded dynamically to prevent crash on import
// ============================================
try {
  const routes = require('./routes/index.js').default;
  app.use('/api', routes);
  console.log('[BOOT] API routes loaded successfully');
} catch (err: any) {
  console.error('[BOOT] Failed to load API routes:', err.message);
  // Fallback: API returns error message so we can debug
  app.use('/api', (_req, res) => {
    res.status(503).json({
      success: false,
      error: 'API routes failed to load: ' + (err.message || 'unknown error'),
      hint: 'Check Render logs for details',
    });
  });
}

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
const frontendPath = path.resolve(process.cwd(), 'public');
const indexHtmlPath = path.join(frontendPath, 'index.html');
const hasFrontend = fs.existsSync(indexHtmlPath);

if (hasFrontend) {
  app.use(express.static(frontendPath));
  console.log('[BOOT] Frontend static files: ' + frontendPath);
} else {
  console.warn('[BOOT] No frontend build found at: ' + frontendPath);
}

// SPA fallback: any route not matched by API or static files → index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  if (hasFrontend) {
    return res.sendFile(indexHtmlPath);
  }
  res.status(404).json({
    success: false,
    error: 'Frontend not built. Check build logs.',
    frontendPath,
  });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message, err.stack);
  logService.error('SYSTEM', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  console.log('[BOOT] Server started on port ' + PORT);
  console.log('[BOOT] Environment: ' + config.nodeEnv);
  console.log('[BOOT] Frontend: ' + frontendPath + (hasFrontend ? ' (OK)' : ' (NOT FOUND)'));
  console.log('[BOOT] Active chains: ' + config.defaults.chains.join(', '));

  // Initialize background jobs (deferred, non-blocking)
  try {
    const { initializeJobs } = require('./jobs/index.js');
    initializeJobs();
  } catch (err: any) {
    console.error('[BOOT] Failed to initialize jobs:', err.message);
  }
});

export default app;
