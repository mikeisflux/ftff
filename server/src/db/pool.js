import pg from 'pg';
import { env, isProd } from '../config/env.js';

const { Pool } = pg;

// SSL policy. A local Postgres on the same host needs no TLS (and PG's default
// self-signed cert would fail verification), while a managed/remote DB should
// verify. Override with DATABASE_SSL = disable | no-verify | require.
function sslConfig() {
  switch (process.env.DATABASE_SSL) {
    case 'disable': return false;
    case 'no-verify': return { rejectUnauthorized: false };
    case 'require': return { rejectUnauthorized: true };
    default: break;
  }
  const local = /@(localhost|127\.0\.0\.1|\[::1\]|::1)([:/]|$)/.test(env.DATABASE_URL);
  if (local) return false;               // same-host DB: no TLS needed
  return isProd ? { rejectUnauthorized: true } : false;
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: sslConfig(),
});

pool.on('error', (err) => {
   
  console.error('Unexpected idle pg client error', err);
});

/** Run a parameterized query. Never string-concatenate SQL (§4.3). */
export function query(text, params) {
  return pool.query(text, params);
}

/** Run fn inside a transaction with a dedicated client. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
