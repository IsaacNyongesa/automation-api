import { config } from './config.js';

/**
 * Express middleware — rejects requests without a valid x-api-key header.
 * Attach to any route that should be private:
 *   app.post('/route', requireApiKey, handler)
 */
export function requireApiKey(req, res, next) {
  const key = req.header('x-api-key');

  if (!key) {
    return res.status(401).json({
      error: 'missing_api_key',
      message: 'Send your key in the x-api-key header.',
    });
  }

  if (key !== config.apiKey) {
    return res.status(403).json({
      error: 'invalid_api_key',
      message: 'The x-api-key header does not match.',
    });
  }

  next();
}