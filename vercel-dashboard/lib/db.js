import { Pool } from 'pg';

// Single shared pool across warm serverless invocations.
let _pool = null;

export function getPool() {
  if (_pool) return _pool;
  const cs = process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL غير مضبوط على الخادم');
  // Supabase (and most managed Postgres) require TLS. For serverless we don't
  // pin the CA, so allow the managed cert. Use the *pooler* connection string
  // (port 6543, ?pgbouncer=true) on Vercel for best results.
  const ssl = /sslmode=disable/.test(cs) ? false : { rejectUnauthorized: false };
  _pool = new Pool({ connectionString: cs, ssl, max: 3, idleTimeoutMillis: 10000 });
  return _pool;
}

export async function q(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}
