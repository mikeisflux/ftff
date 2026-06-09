import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { asyncHandler, notFound } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { broadcastHide } from '../lib/chat.js';
import { audit } from '../lib/audit.js';

// Live chat moderation (§11). Hiding a message removes it from history and tells
// connected clients to drop it immediately.
export const adminChatRouter = Router();
adminChatRouter.use(requireAuth, requireRole('admin', 'editor'));

adminChatRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, handle, body, role, is_hidden, ip, created_at
         FROM chat_messages ORDER BY created_at DESC LIMIT 200`,
    );
    res.json({ messages: rows });
  }),
);

adminChatRouter.post(
  '/:id/hide',
  asyncHandler(async (req, res) => {
    const hidden = z.object({ hidden: z.boolean() }).parse(req.body).hidden;
    const { rows } = await query(
      `UPDATE chat_messages SET is_hidden=$2 WHERE id=$1 RETURNING id`,
      [req.params.id, hidden],
    );
    if (!rows[0]) throw notFound('Message not found');
    if (hidden) broadcastHide(req.params.id);
    await audit(req.user.id, 'chat.moderate', { entity: 'chat_message', entityId: req.params.id, meta: { hidden } });
    res.json({ ok: true });
  }),
);
