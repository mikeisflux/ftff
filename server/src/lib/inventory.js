import { query } from '../db/pool.js';

// Oversell-safe inventory pools. available = total - reserved - sold.
// All mutations are single atomic UPDATEs guarded by the availability check, so
// concurrent checkouts can never push reserved+sold past total.

/** Current availability for a pool, or null if the pool doesn't exist. */
export async function getPool(key) {
  const { rows } = await query(`SELECT * FROM inventory_pools WHERE key = $1`, [key]);
  if (!rows[0]) return null;
  const p = rows[0];
  return { ...p, available: p.total - p.reserved - p.sold };
}

/**
 * Atomically reserve `qty` units. Returns true on success, false if there
 * isn't enough available (or the pool is missing). qty <= 0 is a no-op success.
 */
export async function reserve(key, qty, client = null) {
  const n = Math.trunc(Number(qty) || 0);
  if (n <= 0) return true;
  const run = client ? client.query.bind(client) : query;
  const { rowCount } = await run(
    `UPDATE inventory_pools SET reserved = reserved + $2
      WHERE key = $1 AND total - reserved - sold >= $2`,
    [key, n],
  );
  return rowCount > 0;
}

/** Move `qty` from reserved -> sold (on confirmed payment). */
export async function commit(key, qty, client = null) {
  const n = Math.trunc(Number(qty) || 0);
  if (n <= 0) return;
  const run = client ? client.query.bind(client) : query;
  await run(
    `UPDATE inventory_pools
        SET reserved = GREATEST(reserved - $2, 0), sold = sold + $2
      WHERE key = $1`,
    [key, n],
  );
}

/** Release `qty` reserved units back to available (abandoned/cancelled). */
export async function release(key, qty, client = null) {
  const n = Math.trunc(Number(qty) || 0);
  if (n <= 0) return;
  const run = client ? client.query.bind(client) : query;
  await run(
    `UPDATE inventory_pools SET reserved = GREATEST(reserved - $2, 0) WHERE key = $1`,
    [key, n],
  );
}
