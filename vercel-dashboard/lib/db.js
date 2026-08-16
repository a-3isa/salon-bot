import { Pool } from 'pg';

// Single shared pool across warm serverless invocations.
let _pool = null;

// Strip sslmode/ssl from a connection string, reporting whether it asked for TLS
// to be off. Falls back to string surgery for URLs the URL parser rejects.
function splitSslMode(cs) {
  try {
    const u = new URL(cs);
    const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
    u.searchParams.delete('sslmode');
    u.searchParams.delete('ssl');
    return { connectionString: u.toString(), sslDisabled: mode === 'disable' };
  } catch {
    return {
      connectionString: cs
        .replace(/([?&])(sslmode|ssl)=[^&]*/gi, '$1')
        .replace(/[?&]$/, '')
        .replace(/\?&/, '?'),
      sslDisabled: /sslmode=disable/i.test(cs),
    };
  }
}

export function getPool() {
  if (_pool) return _pool;
  // DATABASE_URL is ours; the POSTGRES_* names are what the Supabase↔Vercel
  // integration injects, so either way of wiring the project works.
  const cs =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!cs) throw new Error('DATABASE_URL / POSTGRES_URL غير مضبوط على الخادم');

  // TLS: Supabase requires it, but we can't verify its chain from a Lambda —
  // the runtime trust store doesn't carry it, which surfaces as
  // "self-signed certificate in certificate chain".
  //
  // The Supabase↔Vercel integration hands us a URL ending in `?sslmode=require`,
  // and node-postgres (a) parses sslmode out of the connection string and lets it
  // WIN over the `ssl` option, and (b) currently treats `require` as `verify-full`.
  // So the parameter has to come off the URL, otherwise the setting below is
  // silently discarded.
  const { connectionString, sslDisabled } = splitSslMode(cs);
  const ssl = sslDisabled ? false : { rejectUnauthorized: false };
  _pool = new Pool({ connectionString, ssl, max: 3, idleTimeoutMillis: 10000 });
  return _pool;
}

export async function q(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}
