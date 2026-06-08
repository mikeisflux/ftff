import { query } from '../db/pool.js';

// Background job (§9): release expired booth soft-holds back to available and
// cancel their abandoned pending orders. Runs on an interval; lightweight enough
// to run in-process without a queue for now.
export async function releaseExpiredHolds() {
  // Capture the pre-update order_id via a snapshot subquery — RETURNING the
  // column we just nulled would yield NULL.
  const { rows } = await query(
    `UPDATE booths b SET status='available', held_until=NULL, order_id=NULL
       FROM (SELECT id, order_id FROM booths
              WHERE status='held' AND held_until IS NOT NULL AND held_until < now()) old
      WHERE b.id = old.id
      RETURNING b.id, old.order_id AS order_id`,
  );
  if (rows.length > 0) {
    const orderIds = rows.map((r) => r.order_id).filter(Boolean);
    if (orderIds.length > 0) {
      await query(
        `UPDATE orders SET status='cancelled'
          WHERE id = ANY($1) AND status='pending'`,
        [orderIds],
      );
    }
    // eslint-disable-next-line no-console
    console.log(`Released ${rows.length} expired booth hold(s).`);
  }
  return rows.length;
}

let timer = null;
export function startHoldReleaseJob(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(() => {
    releaseExpiredHolds().catch((err) =>
      // eslint-disable-next-line no-console
      console.error('releaseExpiredHolds failed:', err.message),
    );
  }, intervalMs);
  timer.unref?.();
}
