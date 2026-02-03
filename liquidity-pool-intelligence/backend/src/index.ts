import express from 'express';
import helmet from 'helmet';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './database/client.js';
import { corsMiddleware } from './api/middleware/cors.js';
import { rateLimit } from './api/middleware/auth.js';
import apiRoutes from './api/routes/index.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';
import { sendStartupNotification, initTelegramBot } from './services/telegram/bot.js';
import { log } from './utils/logger.js';

// ========================================
// INICIALIZAÇÃO DO SERVIDOR
// ========================================

const app = express();

// Middlewares de segurança
app.use(helmet({
  contentSecurityPolicy: config.isProd ? undefined : false,
}));

// CORS
app.use(corsMiddleware);

// Parser de JSON
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use(rateLimit);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    log.httpRequest(req.method, req.path, res.statusCode, duration);
  });

  next();
});

// Rotas da API
app.use('/api', apiRoutes);

// Rota raiz (redirect para health check)
app.get('/', (req, res) => {
  res.redirect('/api/health');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler global
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error('Unhandled error', {
    error: err,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: config.isDev ? err.message : 'An unexpected error occurred',
  });
});

// ========================================
// STARTUP E SHUTDOWN
// ========================================

async function startServer(): Promise<void> {
  log.info('Starting Liquidity Pool Intelligence server...');

  try {
    // Conecta ao banco de dados
    await connectDatabase();

    // Inicializa bot do Telegram
    initTelegramBot();

    // Inicia o scheduler
    startScheduler();

    // Inicia o servidor HTTP
    const server = app.listen(config.port, () => {
      log.info(`Server running on port ${config.port}`);
      log.info(`Environment: ${config.env}`);
      log.info(`Enabled networks: ${config.enabledNetworks.join(', ')}`);

      // Envia notificação de startup
      if (config.isProd) {
        sendStartupNotification();
      }
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down gracefully...`);

      // Para o servidor HTTP
      server.close(() => {
        log.info('HTTP server closed');
      });

      // Para o scheduler
      stopScheduler();

      // Desconecta do banco
      await disconnectDatabase();

      log.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      log.error('Unhandled Rejection', { reason, promise });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.error('Uncaught Exception', { error });
      process.exit(1);
    });

  } catch (error) {
    log.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Inicia o servidor
startServer();
