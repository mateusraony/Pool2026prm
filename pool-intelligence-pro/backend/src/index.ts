import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { getPrisma, closePrisma } from './routes/prisma.js';
import { logService } from './services/log.service.js';
import { requireAdminKey } from './routes/middleware/admin-auth.js';
import { metricsService } from './services/metrics.service.js';
import { wsService } from './services/websocket.service.js';

// Catch unhandled errors so they show in Render logs
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason);
});

const app = express();
const server = createServer(app);
// Initialize WebSocket server (Socket.io) on the same HTTP server
wsService.init(server);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'sha256-31fQF/g9KGmEnutu6M7cTHdK4cN5J5z5NRerO5mFMfQ='"],   // inline SW registration script
      styleSrc: ["'self'", "'unsafe-inline'"],    // inline styles in loading div + Tailwind
      imgSrc: ["'self'", "data:", "https:"],      // data: for base64 icons, https: for external token logos
      connectSrc: ["'self'", "wss:", "ws:", "https:"], // WebSocket (Socket.io) + APIs externas
      fontSrc: ["'self'", "data:"],
      workerSrc: ["'self'"],                      // Service Worker
      manifestSrc: ["'self'"],                    // PWA manifest
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}));
// CORS: restritivo em produção, aberto em desenvolvimento
if (config.nodeEnv === 'production') {
  const allowedOrigins = [
    process.env.RENDER_EXTERNAL_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];
  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : (logService.warn('SYSTEM', 'No CORS origins configured — defaulting to self-origin only'), false),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  }));
} else {
  app.use(cors());
}
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Health check (FIRST - before anything else, for Render health checks)
app.get('/health', async (_req, res) => {
  const mem = process.memoryUsage();
  const memMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

  // DB ping (non-blocking: timeout 3s so health check stays fast)
  let dbStatus: 'ok' | 'unavailable' | 'unconfigured' = 'unconfigured';
  if (process.env.DATABASE_URL) {
    try {
      const prisma = getPrisma();
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      dbStatus = 'ok';
    } catch {
      dbStatus = 'unavailable';
    }
  }

  const healthy = dbStatus !== 'unavailable';
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: { rss_mb: memMb, heap_mb: heapMb },
    db: dbStatus,
  });
});

// Debug endpoint — only available in development (exposes internal paths and env info)
if (config.nodeEnv !== 'production') {
  app.get('/debug', requireAdminKey, (_req, res) => {
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
}

// Request logging + metrics (skip health checks and static files)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && !req.path.startsWith('/assets/')) {
      logService.info('SYSTEM', req.method + ' ' + req.path + ' ' + res.statusCode + ' ' + duration + 'ms');
      metricsService.recordRequest(req.method, req.path, res.statusCode, duration);
    }
  });
  next();
});

// ============================================
// PERSISTENCE INITIALIZATION
// ============================================
async function initPersistence() {
  try {
    const { persistService } = await import('./services/persist.service.js');
    await persistService.init();
    logService.info('BOOT', 'Database persistence initialized');

    const { telegramBot } = await import('./bot/telegram.js');
    telegramBot.loadFromDb();
    logService.info('BOOT', 'Telegram config loaded from DB');
    await telegramBot.setupCommands();
    logService.info('BOOT', 'Telegram bot commands registered');

    const { notificationSettingsService } = await import('./services/notification-settings.service.js');
    notificationSettingsService.loadFromDb();
    logService.info('BOOT', 'Notification settings loaded from DB');

    const { rangeMonitorService } = await import('./services/range.service.js');
    await rangeMonitorService.loadFromDb();
    logService.info('BOOT', 'Range positions loaded from DB');

    const { loadIntegrations } = await import('./routes/integrations.routes.js');
    await loadIntegrations();
    logService.info('BOOT', 'Webhook integrations loaded from DB');

    // Carregar regras de alerta persistidas
    const { alertService } = await import('./services/alert.service.js');
    await alertService.loadFromDb();
    logService.info('BOOT', 'Alert rules loaded from DB');

    // Inicializar Push Notifications (VAPID)
    const { pushService } = await import('./services/push.service.js');
    await pushService.init();
    logService.info('BOOT', 'Push notification service initialized');

    // Inicializar Wallet Tracker
    const { walletService } = await import('./services/wallet.service.js');
    await walletService.init();
    logService.info('BOOT', 'Wallet tracker service initialized');

    // Amarrar event bus: registrar listeners (ALERT_FIRED → webhook + telegram)
    const { bootstrapEventBus } = await import('./services/event-bus.bootstrap.js');
    bootstrapEventBus();
    logService.info('BOOT', 'Event bus listeners registered');

    // Auto-detect appUrl from RENDER_EXTERNAL_URL if not set by user
    const currentAppUrl = notificationSettingsService.getAppUrl();
    const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
    if (renderUrl && (currentAppUrl === 'http://localhost:5173' || !currentAppUrl)) {
      notificationSettingsService.updateSettings({ appUrl: renderUrl });
      logService.info('BOOT', 'Auto-set appUrl from RENDER_EXTERNAL_URL: ' + renderUrl);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logService.error('BOOT', 'Persistence init failed (using defaults)', { error: msg });
  }
}

// ============================================
// PERSISTENCE READINESS GATE
// MUST be registered BEFORE routes so Express processes it first
// ============================================
let persistenceReady = false;
const persistencePromise = initPersistence().then(() => {
  persistenceReady = true;
  logService.info('BOOT', 'Persistence ready — API requests unblocked');
}).catch((err: unknown) => {
  persistenceReady = true; // allow requests through with defaults
  logService.error('BOOT', 'Persistence init failed, using defaults', { error: err instanceof Error ? err.message : String(err) });
});

// Rate limiting: previne abuso da API (100 req/min por IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later' },
  skip: (req) => req.path === '/health',
});
app.use('/api', apiLimiter);

// Middleware: hold /api requests until DB config is loaded
app.use('/api', async (_req, res, next) => {
  if (persistenceReady) return next();
  try {
    await persistencePromise;
    return next();
  } catch {
    return res.status(503).json({ success: false, error: 'Server is starting up, please retry in a few seconds' });
  }
});

// ============================================
// API ROUTES — loaded AFTER readiness gate
// ============================================
import routes from './routes/index.js';
app.use('/api', routes);
logService.info('BOOT', 'API routes loaded');

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
const frontendPath = path.resolve(process.cwd(), 'public');
const indexHtmlPath = path.join(frontendPath, 'index.html');
const hasFrontend = fs.existsSync(indexHtmlPath);

if (hasFrontend) {
  app.use(express.static(frontendPath));
  logService.info('BOOT', 'Frontend static files: ' + frontendPath);
} else {
  logService.warn('BOOT', 'No frontend build found at: ' + frontendPath);
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
  logService.error('SYSTEM', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
const PORT = config.port;

server.listen(PORT, () => {
  logService.info('BOOT', 'Server started on port ' + PORT);
  logService.info('BOOT', 'Environment: ' + config.nodeEnv);
  logService.info('BOOT', 'Frontend: ' + frontendPath + (hasFrontend ? ' (OK)' : ' (NOT FOUND)'));
  logService.info('BOOT', 'Active chains: ' + config.defaults.chains.join(', '));

  // Initialize background jobs (deferred, non-blocking)
  import('./jobs/index.js').then(({ initializeJobs }) => {
    initializeJobs();
  }).catch((err: unknown) => {
    logService.error('BOOT', 'Failed to initialize jobs', { error: err instanceof Error ? err.message : String(err) });
  });

  // ============================================
  // KEEP-ALIVE: Prevent Render free tier from sleeping (every 13 min via cron)
  // ============================================
  let keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
  if (keepAliveUrl && !keepAliveUrl.startsWith('http')) {
    keepAliveUrl = 'https://' + keepAliveUrl;
  }
  if (!keepAliveUrl) {
    keepAliveUrl = `http://localhost:${PORT}`;
  }

  import('node-cron').then(({ default: cron }) => {
    // Every 13 minutes: */13 * * * *
    cron.schedule('*/13 * * * *', () => {
      const pingUrl = `${keepAliveUrl}/health`;
      const mod = pingUrl.startsWith('https') ? 'https' : 'http';
      import(mod).then(m => {
        m.get(pingUrl, (res: { resume(): void }) => { res.resume(); }).on('error', () => {});
      });
    });
    logService.info('BOOT', 'Keep-alive cron every 13min → ' + keepAliveUrl + '/health');
  }).catch(() => {
    logService.warn('BOOT', 'node-cron not available, using setInterval for keep-alive');
    setInterval(() => {
      const pingUrl = `${keepAliveUrl}/health`;
      const mod = pingUrl.startsWith('https') ? 'https' : 'http';
      import(mod).then(m => {
        m.get(pingUrl, (res: { resume(): void }) => { res.resume(); }).on('error', () => {});
      });
    }, 13 * 60 * 1000);
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
function gracefulShutdown(signal: string) {
  logService.info('SHUTDOWN', signal + ' received — closing server gracefully...');

  server.close(() => {
    logService.info('SHUTDOWN', 'HTTP server closed');

    // Close Prisma connections
    closePrisma()
      .then(() => {
        logService.info('SHUTDOWN', 'Prisma disconnected');
        process.exit(0);
      })
      .catch(() => process.exit(0));
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    logService.error('SHUTDOWN', 'Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
