import argon2 from 'argon2';
import { pool } from './pool.js';

// Seeds the platform's superuser (admin) accounts. Emails are fixed; the
// password is read from SUPERUSER_PASSWORD so it never lives in source control.
//
//   SUPERUSER_PASSWORD='…' npm run db:seed:superusers
//
// Re-running is idempotent: it upserts each account to admin + active and resets
// the password to the provided value.

const SUPERUSERS = [
  { email: 'forthefansfest@gmail.com', name: 'For The Fans Fest' },
  { email: 'divinitycomicsinc@gmail.com', name: 'Divinity Comics Inc' },
];

async function main() {
  const password = process.env.SUPERUSER_PASSWORD;
  if (!password) {
     
    console.error('Set SUPERUSER_PASSWORD before running (kept out of source control).');
    process.exit(1);
  }
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  try {
    for (const u of SUPERUSERS) {
      const { rows } = await pool.query(
        `INSERT INTO users (email, name, role, password_hash, is_active)
         VALUES ($1, $2, 'admin', $3, TRUE)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name, role = 'admin', password_hash = EXCLUDED.password_hash,
           is_active = TRUE, failed_logins = 0, locked_until = NULL
         RETURNING email, role`,
        [u.email, u.name, hash],
      );
       
      console.log('✓ superuser ready:', rows[0].email, `(${rows[0].role})`);
    }
  } catch (err) {
     
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
