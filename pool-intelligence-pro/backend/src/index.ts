import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/index.js';
import { logService } from './services/log.service.js';
import { initializeJobs } from './jobs/index.js';
import routes from './routes/index.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/api/health') {
      logService.info('SYSTEM', req.method + ' ' + req.path + ' ' + res.statusCode + ' ' + duration + 'ms');
    }
  });
  next();
});

// API routes
app.use('/api', routes);

// Health check (root level for Render)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Pool Intelligence Pro',
    version: '2.0.0',
    status: 'running',
    docs: '/api/health',
  });
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
  logService.info('SYSTEM', 'Active chains: ' + config.defaults.chains.join(', '));
  
  // Initialize background jobs
  initializeJobs();
});

export default app;
