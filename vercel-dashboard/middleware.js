import { NextResponse } from 'next/server';
import { COOKIE, expectedToken } from './lib/auth';

// Public paths that never require the password.
const PUBLIC = ['/login', '/api/login'];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE)?.value;
  const expected = await expectedToken();

  if (expected && token && token === expected) {
    return NextResponse.next();
  }

  // Not authenticated. APIs get 401 JSON; pages redirect to /login.
  if (pathname.startsWith('/api/')) {
    return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
