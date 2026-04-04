import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Middleware de autenticação para endpoints de admin.
 * Verifica o header X-Admin-Key contra a variável de ambiente ADMIN_SECRET.
 * - Se ADMIN_SECRET não estiver configurado em produção: bloqueia (503).
 * - Se ADMIN_SECRET não estiver configurado em desenvolvimento: permite acesso.
 * - Se ADMIN_SECRET estiver configurado e a chave não bater: 401.
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    // ADMIN_SECRET não configurado — bloquear em produção, passar em dev
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({ success: false, error: 'Admin authentication not configured' });
      return;
    }
    next();
    return;
  }
  const key = req.headers['x-admin-key'];
  const keyBuffer = Buffer.from(String(key));
  const secretBuffer = Buffer.from(adminSecret);
  if (keyBuffer.length !== secretBuffer.length || !timingSafeEqual(keyBuffer, secretBuffer)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
