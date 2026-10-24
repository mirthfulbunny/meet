import { NextRequest, NextResponse } from 'next/server';

// Shared-password gate for the whole site, including /api/connection-details.
// Set MEET_PASSWORD in the container env. If unset, the site is open (handy for local dev).
// Browsers show their native login prompt; any username works, only the password is checked.
export function middleware(req: NextRequest) {
  const expected = process.env.MEET_PASSWORD;
  if (!expected) return NextResponse.next();

  const header = req.headers.get('authorization');
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === expected) return NextResponse.next();
    } catch {
      // malformed header, fall through to the challenge
    }
  }

  return new NextResponse('Password required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="meet", charset="UTF-8"' },
  });
}

export const config = {
  // Skip Next's static assets so the prompt only fires once per visit.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
