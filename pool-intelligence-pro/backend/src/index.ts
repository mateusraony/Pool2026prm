import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config/index.js';
import { logService } from './services/log.service.js';
import { metricsService } from './services/metrics.service.js';

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
// CORS: restritivo em produção, aberto em desenvolvimento
if (config.nodeEnv === 'production') {
  const allowedOrigins = [
    process.env.RENDER_EXTERNAL_URL,
    process.env.APP_URL,
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];
  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
} else {
  app.use(cors());
}
app.use(compression());
app.use(express.json());

// Health check (FIRST - before anything else, for Render health checks)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint — only available in development (exposes internal paths and env info)
if (config.nodeEnv !== 'production') {
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
    console.log('[BOOT] Database persistence initialized');

    const { telegramBot } = await import('./bot/telegram.js');
    telegramBot.loadFromDb();
    console.log('[BOOT] Telegram config loaded from DB');

    const { notificationSettingsService } = await import('./services/notification-settings.service.js');
    notificationSettingsService.loadFromDb();
    console.log('[BOOT] Notification settings loaded from DB');

    const { rangeMonitorService } = await import('./services/range.service.js');
    await rangeMonitorService.loadFromDb();
    console.log('[BOOT] Range positions loaded from DB');

    // Auto-detect appUrl from RENDER_EXTERNAL_URL if not set by user
    const currentAppUrl = notificationSettingsService.getAppUrl();
    const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || '';
    if (renderUrl && (currentAppUrl === 'http://localhost:5173' || !currentAppUrl)) {
      notificationSettingsService.updateSettings({ appUrl: renderUrl });
      console.log('[BOOT] Auto-set appUrl from RENDER_EXTERNAL_URL:', renderUrl);
    }
  } catch (err: any) {
    console.error('[BOOT] Persistence init failed (using defaults):', err.message);
  }
}

// ============================================
// PERSISTENCE READINESS GATE
// MUST be registered BEFORE routes so Express processes it first
// ============================================
let persistenceReady = false;
const persistencePromise = initPersistence().then(() => {
  persistenceReady = true;
  console.log('[BOOT] Persistence ready — API requests unblocked');
}).catch((err: any) => {
  persistenceReady = true; // allow requests through with defaults
  console.error('[BOOT] Persistence init failed, using defaults:', err?.message);
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
console.log('[BOOT] API routes loaded');

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

const server = app.listen(PORT, () => {
  console.log('[BOOT] Server started on port ' + PORT);
  console.log('[BOOT] Environment: ' + config.nodeEnv);
  console.log('[BOOT] Frontend: ' + frontendPath + (hasFrontend ? ' (OK)' : ' (NOT FOUND)'));
  console.log('[BOOT] Active chains: ' + config.defaults.chains.join(', '));

  // Initialize background jobs (deferred, non-blocking)
  import('./jobs/index.js').then(({ initializeJobs }) => {
    initializeJobs();
  }).catch((err: any) => {
    console.error('[BOOT] Failed to initialize jobs:', err.message);
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
        m.get(pingUrl, (res: any) => { res.resume(); }).on('error', () => {});
      });
    });
    console.log(`[BOOT] Keep-alive cron every 13min → ${keepAliveUrl}/health`);
  }).catch(() => {
    console.warn('[BOOT] node-cron not available, using setInterval for keep-alive');
    setInterval(() => {
      const pingUrl = `${keepAliveUrl}/health`;
      const mod = pingUrl.startsWith('https') ? 'https' : 'http';
      import(mod).then(m => {
        m.get(pingUrl, (res: any) => { res.resume(); }).on('error', () => {});
      });
    }, 13 * 60 * 1000);
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
function gracefulShutdown(signal: string) {
  console.log(`[SHUTDOWN] ${signal} received — closing server gracefully...`);

  server.close(() => {
    console.log('[SHUTDOWN] HTTP server closed');

    // Close Prisma connections
    import('@prisma/client').then(({ PrismaClient }) => {
      const prisma = new PrismaClient();
      prisma.$disconnect().then(() => {
        console.log('[SHUTDOWN] Prisma disconnected');
        process.exit(0);
      }).catch(() => process.exit(0));
    }).catch(() => process.exit(0));
  });

  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => {
    console.error('[SHUTDOWN] Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
