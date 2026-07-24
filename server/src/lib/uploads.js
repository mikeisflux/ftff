import { writeFile, mkdir, rename, unlink, stat, open } from 'node:fs/promises';
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

// Video containers we accept for hero backgrounds. MP4/MOV share the ISO
// base-media 'ftyp' box at offset 4; WebM/Matroska start with the EBML header.
const VIDEO_MAGIC = [
  { ext: 'webm', mime: 'video/webm', test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { ext: 'mp4', mime: 'video/mp4', test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
];
function detectVideo(buf) {
  return VIDEO_MAGIC.find((m) => m.test(buf)) || null;
}

/**
 * Validate + store an image OR video buffer. Same guarantees as storeImage
 * (magic-byte validation, randomized key, size cap) with a larger default cap
 * for video. Used by the generic /admin/uploads endpoint (hero slides, etc.).
 */
export async function storeMedia(buffer, { maxBytes = 64 * 1024 * 1024 } = {}) {
  if (!buffer?.length) throw new HttpError(400, 'Empty upload');
  if (buffer.length > maxBytes) throw new HttpError(413, 'File too large');
  const kind = detectImage(buffer) || detectVideo(buffer);
  if (!kind) throw new HttpError(415, 'Only images (JPEG, PNG, GIF, WEBP) or video (MP4, WebM) are allowed');
  const key = `${randomToken(16)}.${kind.ext}`;
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, key), buffer);
  return { url: `${env.PUBLIC_URL}/uploads/${key}`, key, mime: kind.mime };
}

/**
 * Store an already-streamed upload (multer diskStorage) WITHOUT loading it into
 * memory — needed for large video files that would otherwise blow the process's
 * memory budget. `tmpPath` must be a temp file inside UPLOAD_DIR (so the final
 * rename stays on the same filesystem). Only the header is read for magic-byte
 * validation; on failure the temp file is removed.
 */
export async function storeMediaFromFile(tmpPath, { maxBytes = 256 * 1024 * 1024 } = {}) {
  const cleanup = () => unlink(tmpPath).catch(() => {});
  let size;
  try { ({ size } = await stat(tmpPath)); } catch { throw new HttpError(400, 'Upload not found'); }
  if (size === 0) { await cleanup(); throw new HttpError(400, 'Empty upload'); }
  if (size > maxBytes) { await cleanup(); throw new HttpError(413, 'File too large'); }

  const header = Buffer.alloc(16);
  const fh = await open(tmpPath, 'r');
  try { await fh.read(header, 0, 16, 0); } finally { await fh.close(); }

  const kind = detectImage(header) || detectVideo(header);
  if (!kind) { await cleanup(); throw new HttpError(415, 'Only images (JPEG, PNG, GIF, WEBP) or video (MP4, WebM) are allowed'); }

  const key = `${randomToken(16)}.${kind.ext}`;
  await rename(tmpPath, path.join(UPLOAD_DIR, key)); // same-dir rename = atomic, no copy
  return { url: `${env.PUBLIC_URL}/uploads/${key}`, key, mime: kind.mime };
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
