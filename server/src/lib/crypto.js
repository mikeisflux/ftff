import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM encryption for secret settings stored at rest (§5, §4.3).
// The 32-byte master key lives ONLY in the environment (SETTINGS_MASTER_KEY).
// Blob layout: iv(12) || authTag(16) || ciphertext.

const MASTER_KEY = Buffer.from(env.SETTINGS_MASTER_KEY, 'hex'); // 32 bytes
const IV_LEN = 12;
const TAG_LEN = 16;

/** Encrypt a UTF-8 string. Returns a Buffer suitable for a BYTEA column. */
export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]);
}

/** Decrypt a BYTEA blob produced by encryptSecret. Returns the UTF-8 string. */
export function decryptSecret(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Opaque, unguessable token (e.g. QR tokens, refresh tokens). */
export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** SHA-256 hex digest (for storing refresh-token hashes, webhook dedupe, etc.). */
export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
