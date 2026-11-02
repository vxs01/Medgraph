import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Guards every page. API routes also check the session themselves (defence in depth).
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('session')?.value;
  let session = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
      session = payload;
    } catch {}
  }
  if (!session) {
    if (pathname.startsWith('/api')) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (pathname.startsWith('/audit') && session.role !== 'ADMIN')
    return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|login|api/auth).*)'],
};
