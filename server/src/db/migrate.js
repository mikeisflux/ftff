import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from './pool.js';

// Applies schema.sql (and optionally seed.sql with --seed). Both are written to
// be idempotent, so re-running is safe.

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../db');

async function runFile(name) {
  const sql = await readFile(path.join(dbDir, name), 'utf8');
   
  console.log(`→ applying ${name} …`);
  await pool.query(sql);
   
  console.log(`  ✓ ${name}`);
}

async function main() {
  const withSeed = process.argv.includes('--seed');
  try {
    await runFile('schema.sql');
    if (withSeed) await runFile('seed.sql');
     
    console.log('Done.');
  } catch (err) {
     
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
