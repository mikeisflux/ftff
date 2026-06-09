import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound, badRequest } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';

// Users & roles (§13) — admin only. Guards against locking everyone out:
// you can't demote/deactivate/delete the last active admin, nor delete yourself.
export const adminUsersRouter = Router();
adminUsersRouter.use(requireAuth, requireRole('admin'));

const ROLES = ['admin', 'editor', 'door_staff'];

async function activeAdminCount(excludeId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM users WHERE role='admin' AND is_active=TRUE AND id <> $1`,
    [excludeId ?? '00000000-0000-0000-0000-000000000000'],
  );
  return rows[0].n;
}

adminUsersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, email, name, role, is_active, last_login_at, created_at
         FROM users ORDER BY created_at`,
    );
    res.json({ users: rows });
  }),
);

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  role: z.enum(ROLES),
  password: z.string().min(12),
});

adminUsersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = createSchema.parse(req.body);
    const hash = await argon2.hash(u.password, { type: argon2.argon2id });
    const { rows } = await query(
      `INSERT INTO users (email, name, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,TRUE) RETURNING id, email, name, role, is_active`,
      [u.email, u.name, u.role, hash],
    ).catch((e) => {
      if (e.code === '23505') throw badRequest('A user with that email already exists');
      throw e;
    });
    await audit(req.user.id, 'user.create', { entity: 'user', entityId: rows[0].id, meta: { role: u.role } });
    res.status(201).json({ user: rows[0] });
  }),
);

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
});

adminUsersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const patch = updateSchema.parse(req.body);
    const cur = (await query(`SELECT * FROM users WHERE id=$1`, [req.params.id])).rows[0];
    if (!cur) throw notFound('User not found');

    // Last-admin protection.
    const demoting = (patch.role && patch.role !== 'admin') || patch.is_active === false;
    if (cur.role === 'admin' && cur.is_active && demoting && (await activeAdminCount(cur.id)) === 0) {
      throw badRequest('Cannot remove the last active admin');
    }

    const { rows } = await query(
      `UPDATE users SET name=COALESCE($2,name), role=COALESCE($3,role),
              is_active=COALESCE($4,is_active) WHERE id=$1
       RETURNING id, email, name, role, is_active`,
      [req.params.id, patch.name ?? null, patch.role ?? null, patch.is_active ?? null],
    );
    await audit(req.user.id, 'user.update', { entity: 'user', entityId: req.params.id, meta: patch });
    res.json({ user: rows[0] });
  }),
);

const pwSchema = z.object({ password: z.string().min(12) });

adminUsersRouter.post(
  '/:id/password',
  asyncHandler(async (req, res) => {
    const { password } = pwSchema.parse(req.body);
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const { rowCount } = await query(
      `UPDATE users SET password_hash=$2, failed_logins=0, locked_until=NULL WHERE id=$1`,
      [req.params.id, hash],
    );
    if (rowCount === 0) throw notFound('User not found');
    // Revoke existing sessions for safety.
    await query(`UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [req.params.id]);
    await audit(req.user.id, 'user.password_reset', { entity: 'user', entityId: req.params.id });
    res.json({ ok: true });
  }),
);

adminUsersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw badRequest('You cannot delete your own account');
    const cur = (await query(`SELECT role, is_active FROM users WHERE id=$1`, [req.params.id])).rows[0];
    if (!cur) throw notFound('User not found');
    if (cur.role === 'admin' && cur.is_active && (await activeAdminCount(req.params.id)) === 0) {
      throw badRequest('Cannot delete the last active admin');
    }
    await query(`DELETE FROM users WHERE id=$1`, [req.params.id]);
    await audit(req.user.id, 'user.delete', { entity: 'user', entityId: req.params.id });
    res.json({ ok: true });
  }),
);
