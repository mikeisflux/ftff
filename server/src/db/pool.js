import pg from 'pg';
import { env, isProd } from '../config/env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: isProd ? { rejectUnauthorized: true } : false,
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
