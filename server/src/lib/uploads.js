import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomToken } from './crypto.js';
import { env } from '../config/env.js';
import { HttpError } from './http.js';

// Upload pipeline (§3, §4.3). Validates MIME + magic bytes, caps size, uses
// randomized object keys. In production these go to object storage (R2/S3) and
// are served via CDN; for local dev (no storage configured) we write to a served
// /uploads directory. Binaries never go in Postgres.

const here = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(here, '../../uploads');

const MAGIC = [
  { ext: 'jpg', mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'gif', mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: 'webp', mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WEBP)
];

function detectImage(buf) {
  return MAGIC.find((m) => m.bytes.every((b, i) => buf[i] === b)) || null;
}

/**
 * Validate and store an uploaded image buffer. Returns a public URL.
 * Re-encoding (e.g. via sharp) is a planned hardening step; magic-byte
 * validation + randomized keys + size cap are enforced here.
 */
export async function storeImage(buffer, { maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!buffer?.length) throw new HttpError(400, 'Empty upload');
  if (buffer.length > maxBytes) throw new HttpError(413, 'File too large');
  const kind = detectImage(buffer);
  if (!kind) throw new HttpError(415, 'Only JPEG, PNG, GIF, or WEBP images are allowed');

  const key = `${randomToken(16)}.${kind.ext}`;

  // Object storage path (when configured) would upload here and return the CDN
  // URL. Until then, dev fallback writes to the served /uploads directory.
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, key), buffer);
  return { url: `${env.PUBLIC_URL}/uploads/${key}`, key, mime: kind.mime };
}
