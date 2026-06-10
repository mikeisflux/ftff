import { query } from '../db/pool.js';
import { randomToken } from './crypto.js';

// Exhibitor Rewards: referral cash-back toward future booth bookings. Exhibitors
// share a unique link (?ref=CODE); when fans buy tickets through it, the
// exhibitor earns REWARD_RATE of the ticket sale.

export const REWARD_RATE = 0.05; // 5% back

function makeCode() {
  // Short, URL-safe, human-shareable.
  return `FF${randomToken(3).toUpperCase()}`;
}

/** Create or fetch a reward account for an email; returns the row. */
export async function enrollReward({ name, email }) {
  const existing = await query(`SELECT * FROM exhibitor_rewards WHERE email = $1`, [email]);
  if (existing.rows[0]) {
    if (name && !existing.rows[0].name) {
      await query(`UPDATE exhibitor_rewards SET name=$2 WHERE id=$1`, [existing.rows[0].id, name]);
    }
    return existing.rows[0];
  }
  // Generate a unique code (retry on the astronomically unlikely collision).
  for (let i = 0; i < 5; i += 1) {
    try {
      const { rows } = await query(
        `INSERT INTO exhibitor_rewards (code, name, email) VALUES ($1,$2,$3) RETURNING *`,
        [makeCode(), name ?? null, email],
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505' && /code/.test(err.constraint || '')) continue; // dup code, retry
      if (err.code === '23505' && /email/.test(err.constraint || '')) {
        // Concurrent enroll for the same email lost the INSERT race — the
        // account now exists, so return it instead of erroring.
        const again = await query(`SELECT * FROM exhibitor_rewards WHERE email = $1`, [email]);
        if (again.rows[0]) return again.rows[0];
      }
      throw err;
    }
  }
  throw new Error('Could not allocate a reward code');
}

/**
 * Credit a paid referred ticket order to the referring exhibitor. Idempotent:
 * an order is credited at most once (orders.reward_credited). Runs inside the
 * fulfillment transaction. `client` is the txn client.
 */
export async function creditReferral(client, order) {
  if (!order?.referral_code || order.reward_credited) return;
  // Don't credit the exhibitor for buying through their own link.
  const reward = (
    await client.query(`SELECT * FROM exhibitor_rewards WHERE code = $1 AND is_active = TRUE`, [order.referral_code])
  ).rows[0];
  if (!reward) return;
  if (reward.email && order.customer_email && reward.email.toLowerCase() === order.customer_email.toLowerCase()) return;

  const sale = order.total_cents || 0;
  const credit = Math.round(sale * REWARD_RATE);
  if (credit <= 0) return;

  await client.query(
    `INSERT INTO reward_events (reward_id, type, order_id, sale_cents, amount_cents, note)
     VALUES ($1,'earn',$2,$3,$4,$5)`,
    [reward.id, order.id, sale, credit, `Referral: order ${order.order_number}`],
  );
  await client.query(
    `UPDATE exhibitor_rewards SET balance_cents = balance_cents + $2, earned_cents = earned_cents + $2 WHERE id = $1`,
    [reward.id, credit],
  );
  await client.query(`UPDATE orders SET reward_credited = TRUE WHERE id = $1`, [order.id]);
}
