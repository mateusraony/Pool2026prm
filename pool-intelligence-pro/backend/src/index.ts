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

// Debug endpoint — shows exactly what the server sees
app.get('/debug', (_req, res) => {
  const frontendDir = path.resolve(process.cwd(), 'public');
  let files: string[] = [];
  let indexExists = false;
  try {
    files = fs.readdirSync(frontendDir);
    indexExists = fs.existsSync(path.join(frontendDir, 'index.html'));
  } catch { /* dir doesn't exist */ }

  let assetsFiles: string[] = [];
  try {
    assetsFiles = fs.readdirSync(path.join(frontendDir, 'assets'));
  } catch { /* no assets dir */ }

  res.json({
    status: 'running',
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    frontendPath: frontendDir,
    frontendExists: indexExists,
    frontendFiles: files,
    assetsFiles: assetsFiles,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    uptime: Math.round(process.uptime()) + 's',
    timestamp: new Date().toISOString(),
  });
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
// INITIALIZE PERSISTENCE (load config from DB)
// Must happen AFTER routes are loaded (services already instantiated)
// but BEFORE server starts accepting requests
// ============================================
async function initPersistence() {
  try {
    const { persistService } = require('./services/persist.service.js');
    await persistService.init();
    console.log('[BOOT] Database persistence initialized');

    // Now load saved config into services
    const { telegramBot } = require('./bot/telegram.js');
    telegramBot.loadFromDb();
    console.log('[BOOT] Telegram config loaded from DB');

    const { notificationSettingsService } = require('./services/notification-settings.service.js');
    notificationSettingsService.loadFromDb();
    console.log('[BOOT] Notification settings loaded from DB');
  } catch (err: any) {
    console.error('[BOOT] Persistence init failed (using defaults):', err.message);
  }
}

// Run persistence init immediately
initPersistence();

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

  // ============================================
  // KEEP-ALIVE: Prevent Render free tier from sleeping (every 13 min)
  // Uses the public app URL (from notification settings or env var)
  // so Render sees external traffic and stays awake.
  // ============================================
  const KEEP_ALIVE_INTERVAL = 13 * 60 * 1000; // 13 minutes (Render sleeps at 15)
  let keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
  // Add https:// if it's just a hostname
  if (keepAliveUrl && !keepAliveUrl.startsWith('http')) {
    keepAliveUrl = 'https://' + keepAliveUrl;
  }
  // Fallback to localhost
  if (!keepAliveUrl) {
    keepAliveUrl = `http://localhost:${PORT}`;
  }

  setInterval(() => {
    const pingUrl = `${keepAliveUrl}/health`;
    const mod = pingUrl.startsWith('https') ? 'https' : 'http';
    import(mod).then(m => {
      m.get(pingUrl, (res: any) => { res.resume(); }).on('error', () => {});
    });
  }, KEEP_ALIVE_INTERVAL);
  console.log(`[BOOT] Keep-alive ping every 13min → ${keepAliveUrl}/health`);
});

export default app;
