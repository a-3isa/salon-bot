// Shared password-gate token. Works in both the Node runtime (API routes) and
// the Edge runtime (middleware) via the Web Crypto API.
const _enc = new TextEncoder();

export const COOKIE = 'salon_auth';

export function authSecret() {
  // AUTH_SECRET is preferred; fall back to the login password itself.
  return process.env.AUTH_SECRET || process.env.DASHBOARD_PASSWORD || '';
}

export async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', _enc.encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The opaque cookie value a logged-in browser must present. null => not configured.
export async function expectedToken() {
  const s = authSecret();
  if (!s) return null;
  return 'v1.' + (await sha256hex('salon-dashboard.' + s));
}
