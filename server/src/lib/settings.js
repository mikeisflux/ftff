import { query } from '../db/pool.js';
import { encryptSecret, decryptSecret } from './crypto.js';

// Settings access layer (§5). Secrets are encrypted at rest and NEVER returned
// to the browser — only server-side code (e.g. the Stripe client) may decrypt.

const MASK = '••••••••';

/** Admin-facing list: masks secrets, returns is_set + value(non-secret only). */
export async function listSettingsForAdmin() {
  const { rows } = await query(
    `SELECT key, category, label, description, is_secret, is_set, value, updated_at
       FROM settings ORDER BY category, key`,
  );
  return rows.map((r) => ({
    key: r.key,
    category: r.category,
    label: r.label,
    description: r.description,
    isSecret: r.is_secret,
    isSet: r.is_set,
    // Secret values are never sent to the browser — only a masked placeholder.
    value: r.is_secret ? (r.is_set ? MASK : '') : (r.value ?? ''),
    updatedAt: r.updated_at,
  }));
}

/** Persist a single setting value. Encrypts if the key is secret. */
export async function setSetting(key, rawValue, actorId) {
  const { rows } = await query(`SELECT key, is_secret FROM settings WHERE key = $1`, [key]);
  if (rows.length === 0) return null;
  const { is_secret } = rows[0];
  if (is_secret) {
    const enc = encryptSecret(rawValue);
    await query(
      `UPDATE settings SET value = NULL, value_enc = $2, is_set = TRUE,
              updated_at = now(), updated_by = $3 WHERE key = $1`,
      [key, enc, actorId ?? null],
    );
  } else {
    await query(
      `UPDATE settings SET value = $2, value_enc = NULL, is_set = TRUE,
              updated_at = now(), updated_by = $3 WHERE key = $1`,
      [key, String(rawValue), actorId ?? null],
    );
  }
  return { key, isSet: true };
}

/** Clear a stored value (is_set = false). */
export async function clearSetting(key, actorId) {
  const { rowCount } = await query(
    `UPDATE settings SET value = NULL, value_enc = NULL, is_set = FALSE,
            updated_at = now(), updated_by = $2 WHERE key = $1`,
    [key, actorId ?? null],
  );
  return rowCount > 0;
}

/**
 * Server-side resolve of a setting's actual value (decrypting secrets).
 * For internal use only — never expose the result to the browser.
 */
export async function getSettingValue(key) {
  const { rows } = await query(
    `SELECT is_secret, is_set, value, value_enc FROM settings WHERE key = $1`,
    [key],
  );
  if (rows.length === 0 || !rows[0].is_set) return null;
  const r = rows[0];
  return r.is_secret ? decryptSecret(r.value_enc) : r.value;
}
