import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import argon2 from 'argon2';
import { z } from 'zod';
import { pool } from './pool.js';

// Interactive first-admin bootstrap. Keeps credentials out of source control.
// Usage: npm run db:seed:admin
// Non-interactive: ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… npm run db:seed:admin

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(12, 'Use at least 12 characters'),
});

async function prompt() {
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    return {
      email: process.env.ADMIN_EMAIL,
      name: process.env.ADMIN_NAME || 'Administrator',
      password: process.env.ADMIN_PASSWORD,
    };
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = await rl.question('Admin email: ');
  const name = await rl.question('Admin name: ');
  const password = await rl.question('Admin password (min 12 chars): ');
  rl.close();
  return { email, name, password };
}

async function main() {
  try {
    const input = schema.parse(await prompt());
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, role, password_hash, is_active)
       VALUES ($1, $2, 'admin', $3, TRUE)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
         role = 'admin', is_active = TRUE
       RETURNING id, email, role`,
      [input.email, input.name, hash],
    );
     
    console.log('✓ Admin ready:', rows[0]);
  } catch (err) {
     
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
