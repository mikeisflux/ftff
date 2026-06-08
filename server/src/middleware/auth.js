import jwt from 'jsonwebtoken';
import { env, isProd } from '../config/env.js';
import { unauthorized, forbidden } from '../lib/http.js';
import { safeEqual } from '../lib/crypto.js';

// JWT access token in an httpOnly, Secure, SameSite=Strict cookie (§3).
// No tokens in localStorage. A rotating refresh token (also httpOnly) is
// handled in routes/auth.js.

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';
const CSRF_COOKIE = 'csrf_token';
const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 30;

export const cookieNames = { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE };

const baseCookie = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/',
};

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: ACCESS_TTL },
  );
}

export function setAuthCookies(res, { accessToken, refreshToken, csrfToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...baseCookie, maxAge: 15 * 60_000 });
  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...baseCookie,
      maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60_000,
    });
  }
  // CSRF token is double-submit: readable by JS so the SPA can echo it in a
  // header, but the matching cookie proves same-origin.
  if (csrfToken) {
    res.cookie(CSRF_COOKIE, csrfToken, {
      ...baseCookie,
      httpOnly: false,
      maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60_000,
    });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, baseCookie);
  res.clearCookie(CSRF_COOKIE, { ...baseCookie, httpOnly: false });
}

/** Require a valid access token. Attaches req.user. */
export function requireAuth(req, _res, next) {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return next(unauthorized('Authentication required'));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    next();
  } catch {
    next(unauthorized('Invalid or expired session'));
  }
}

/** Require one of the given roles (server-side authZ; never trust client). */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('Insufficient role'));
    next();
  };
}

/**
 * CSRF protection for state-changing requests (§4.3): double-submit cookie.
 * SameSite=Strict already blocks cross-site cookies; this adds defense in depth
 * by requiring the X-CSRF-Token header to match the csrf_token cookie.
 */
export function csrfProtection(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) {
    return next(forbidden('CSRF token missing or invalid', 'csrf'));
  }
  next();
}
