import cors from 'cors';
import { config } from '../../config/index.js';

// Configuração de CORS
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Permite requests sem origem (como mobile apps ou curl)
    if (!origin) {
      callback(null, true);
      return;
    }

    // Em desenvolvimento, permite qualquer origem
    if (config.isDev) {
      callback(null, true);
      return;
    }

    // Em produção, valida origens permitidas
    const allowedOrigins = [
      config.frontendUrl,
      'https://liquidity-pool-intelligence.onrender.com',
      /\.onrender\.com$/, // Qualquer subdomínio do Render
    ];

    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      }
      return allowed.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Secret',
    'X-Requested-With',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  credentials: true,
  maxAge: 86400, // 24 horas
});
