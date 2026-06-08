import { ZodError } from 'zod';
import { HttpError } from '../lib/http.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

// Centralized error handler. Never leak stack traces, SQL, or secrets (§4.1).
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  // Unexpected: log server-side, return opaque message client-side.
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    ...(isProd ? {} : { detail: err.message }),
  });
}
