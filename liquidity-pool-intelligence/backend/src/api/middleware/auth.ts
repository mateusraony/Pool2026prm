import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';
import { log } from '../../utils/logger.js';

// Middleware de autenticação via secret (para webhooks)
export function requireSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.query.secret || req.headers['x-api-secret'];

  if (!secret || secret !== config.apiSecret) {
    log.warn('Unauthorized request', {
      path: req.path,
      ip: req.ip,
    });

    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API secret',
    });
    return;
  }

  next();
}

// Middleware de validação de origem (CORS customizado)
export function validateOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // Em desenvolvimento, aceita qualquer origem
  if (config.isDev) {
    next();
    return;
  }

  // Em produção, valida origem
  const allowedOrigins = [
    config.frontendUrl,
    'https://liquidity-pool-intelligence.onrender.com',
  ];

  if (origin && !allowedOrigins.includes(origin)) {
    log.warn('Request from invalid origin', { origin, path: req.path });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid origin',
    });
    return;
  }

  next();
}

// Middleware de rate limiting simples
const requestCounts: Map<string, { count: number; resetAt: number }> = new Map();
const RATE_LIMIT = 100; // requests
const RATE_WINDOW = 60 * 1000; // 1 minuto

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  let record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + RATE_WINDOW };
    requestCounts.set(ip, record);
  }

  record.count++;

  if (record.count > RATE_LIMIT) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: Math.ceil((record.resetAt - now) / 1000),
    });
    return;
  }

  // Adiciona headers de rate limit
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - record.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

  next();
}
