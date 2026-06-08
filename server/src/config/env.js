import dotenv from 'dotenv';
import { z } from 'zod';

// Local dev only: load .env. In production, secrets come from the environment /
// secret manager. (§16)
dotenv.config();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  // 32-byte master key, hex-encoded => 64 hex chars. Encrypts secret settings.
  SETTINGS_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'SETTINGS_MASTER_KEY must be 64 hex chars (32 bytes)'),
  REDIS_URL: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
