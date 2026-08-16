export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { COOKIE } from '../../../lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
