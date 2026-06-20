import { query } from '../db/pool.js';
import { randomToken } from './crypto.js';

// Add/refresh a newsletter subscriber. Used by the public sign-up form AND
// automatically whenever someone submits anything with an email (forms,
// applications, exhibitor apps, purchases). Idempotent and best-effort: never
// throws into the caller's flow, and never resurrects an unsubscribed address.
export async function subscribeEmail(email, { name = null, source = null } = {}) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return { skipped: true };
  try {
    await query(
      `INSERT INTO newsletter_subscribers (email, status, name, source, confirm_token)
       VALUES ($1, 'subscribed', $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         status = CASE WHEN newsletter_subscribers.status = 'unsubscribed'
                       THEN 'unsubscribed' ELSE 'subscribed' END,
         name   = COALESCE(newsletter_subscribers.name, EXCLUDED.name),
         source = COALESCE(newsletter_subscribers.source, EXCLUDED.source),
         confirm_token = COALESCE(newsletter_subscribers.confirm_token, EXCLUDED.confirm_token)`,
      [email, name, source, randomToken(16)],
    );
    return { ok: true };
  } catch {
    return { skipped: true };
  }
}
