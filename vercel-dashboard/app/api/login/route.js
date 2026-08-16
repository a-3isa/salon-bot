export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { COOKIE, expectedToken } from '../../../lib/auth';

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch {}
  const pass = String(body.password || '');

  const configured = process.env.DASHBOARD_PASSWORD || '';
  if (!configured) {
    return NextResponse.json(
      { error: 'لم يتم ضبط كلمة مرور اللوحة على الخادم (DASHBOARD_PASSWORD).' },
      { status: 500 }
    );
  }
  if (pass !== configured) {
    return NextResponse.json({ error: 'كلمة المرور غير صحيحة.' }, { status: 401 });
  }

  const token = await expectedToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
