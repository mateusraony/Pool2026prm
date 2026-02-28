import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { config } from './config/index.js';
import { logService } from './services/log.service.js';
import { initializeJobs } from './jobs/index.js';
import routes from './routes/index.js';

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline scripts from Vite build
}));
app.use(cors());
app.use(compression());
app.use(express.json());

// Health check (FIRST - for Render health checks)
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

// API routes
app.use('/api', routes);

// ============================================
// SERVE FRONTEND STATIC FILES
// ============================================
// In production, the frontend build is copied to backend/public
// This allows a single Render service to serve both API and UI
// When compiled (dist/index.js), __dirname = backend/dist, so ../public = backend/public
const frontendPath = path.resolve(process.cwd(), 'public');
app.use(express.static(frontendPath));

// SPA fallback: any route not matched by API or static files → index.html
app.get('*', (req, res) => {
  // Don't serve index.html for API routes that weren't matched
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logService.error('SYSTEM', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  logService.info('SYSTEM', 'Server started on port ' + PORT);
  logService.info('SYSTEM', 'Environment: ' + config.nodeEnv);
  logService.info('SYSTEM', 'Frontend: ' + frontendPath);
  logService.info('SYSTEM', 'Active chains: ' + config.defaults.chains.join(', '));

  // Initialize background jobs
  initializeJobs();
});

export default app;
