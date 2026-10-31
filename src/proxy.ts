import { NextResponse, type NextRequest } from 'next/server';

/** Must match SESSION_COOKIE in src/server/session-cookie.ts (which is server-only). */
const SESSION_COOKIE = 'fm_session';

/** Routes reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ['/login', '/setup', '/api/health'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Optimistic guard: sends requests without a session cookie to /login. The real check (is the
 * session valid and not idle-expired?) happens in getServiceContext(), which every protected
 * page and server action goes through.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname) || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  // Skip static assets; everything else (pages, server actions, route handlers) passes through.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
