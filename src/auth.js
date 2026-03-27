import { config } from './config.js';
import { logger } from './logger.js';

/**
 * API key authentication middleware.
 * If API_KEY is not set, auth is bypassed (development mode).
 */
export function authMiddleware(req, res, next) {
  // Skip auth for health check
  if (req.path === '/health') return next();

  if (!config.apiKey) {
    // No key configured — dev mode, allow all
    return next();
  }

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== config.apiKey) {
    logger.warn('Auth rejected', { path: req.path, ip: req.ip });
    return res.status(401).json({ error: 'unauthorized', message: 'Valid x-api-key header required' });
  }
  next();
}
