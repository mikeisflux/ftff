// Small helpers for consistent JSON errors. Never leak stack traces or secrets.

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || undefined;
  }
}

export const badRequest = (m = 'Bad request', c) => new HttpError(400, m, c);
export const unauthorized = (m = 'Unauthorized', c) => new HttpError(401, m, c);
export const forbidden = (m = 'Forbidden', c) => new HttpError(403, m, c);
export const notFound = (m = 'Not found', c) => new HttpError(404, m, c);
export const conflict = (m = 'Conflict', c) => new HttpError(409, m, c);

/** Wrap an async route handler so thrown errors hit the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
