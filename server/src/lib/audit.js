import { query } from '../db/pool.js';

// Append-only audit log (§4.3). NEVER record secret values — only the key /
// entity that changed, and who changed it.
export async function audit(actorId, action, { entity, entityId, meta } = {}) {
  try {
    await query(
      `INSERT INTO audit_log (actor_id, action, entity, entity_id, meta)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId ?? null, action, entity ?? null, entityId ?? null, meta ? JSON.stringify(meta) : null],
    );
  } catch (err) {
    // Auditing must never break the request, but failures should be visible.
     
    console.error('audit log failed:', err.message);
  }
}
