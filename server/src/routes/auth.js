import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, unauthorized } from '../lib/http.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';
import { recordSuspicious } from '../lib/botblock.js';
import {
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  requireAuth,
  cookieNames,
} from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const REFRESH_TTL_DAYS = 30;

async function issueRefreshToken(userId, req) {
  const raw = randomToken(32);
  const tokenHash = sha256(raw);
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expires, req.get('user-agent') || null, req.ip || null],
  );
  return raw;
}

// POST /auth/login
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const { rows } = await query(
      `SELECT id, email, name, role, password_hash, is_active, failed_logins, locked_until
         FROM users WHERE email = $1`,
      [email],
    );
    const user = rows[0];

    // Uniform failure to avoid user enumeration / timing leaks.
    const fail = () => {
      throw unauthorized('Invalid credentials');
    };

    if (!user || !user.is_active) {
      // Still spend time hashing to equalize timing.
      await argon2.hash(password).catch(() => {});
      return fail();
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw unauthorized('Account temporarily locked. Try again later.', 'locked');
    }

    const ok = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!ok) {
      const failed = user.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
      await query(
        `UPDATE users SET failed_logins = $2, locked_until = $3 WHERE id = $1`,
        [user.id, failed, lock],
      );
      // Feed the BotBlock firewall: credential-stuffing looks like many failures.
      recordSuspicious(req, 'login_failed', { path: '/auth/login', userAgent: req.get('user-agent') });
      return fail();
    }

    await query(
      `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now()
         WHERE id = $1`,
      [user.id],
    );

    const accessToken = signAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id, req);
    const csrfToken = randomToken(24);
    setAuthCookies(res, { accessToken, refreshToken, csrfToken });
    await audit(user.id, 'auth.login', { entity: 'user', entityId: user.id });

    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }),
);

// POST /auth/refresh — rotates the refresh token.
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[cookieNames.REFRESH_COOKIE];
    if (!raw) throw unauthorized('No refresh token');
    const tokenHash = sha256(raw);
    const { rows } = await query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.email, u.role, u.is_active
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1`,
      [tokenHash],
    );
    const rec = rows[0];
    if (!rec || rec.revoked_at || !rec.is_active || new Date(rec.expires_at) < new Date()) {
      clearAuthCookies(res);
      throw unauthorized('Invalid refresh token');
    }

    // Rotate: revoke old, issue new.
    const newRaw = await issueRefreshToken(rec.user_id, req);
    await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [rec.id]);

    const user = { id: rec.user_id, email: rec.email, role: rec.role };
    setAuthCookies(res, {
      accessToken: signAccessToken(user),
      refreshToken: newRaw,
      csrfToken: randomToken(24),
    });
    res.json({ user });
  }),
);

// POST /auth/logout
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[cookieNames.REFRESH_COOKIE];
    if (raw) {
      await query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1`, [
        sha256(raw),
      ]);
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

// GET /auth/me
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, email, name, role FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (!rows[0]) throw unauthorized();
    res.json({ user: rows[0] });
  }),
);
