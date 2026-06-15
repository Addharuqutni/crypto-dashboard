import { NextRequest, NextResponse } from 'next/server';

/**
 * Optional Basic Auth gate for private production deployments.
 *
 * Enable it by setting:
 *   BASIC_AUTH_ENABLED=1
 *   BASIC_AUTH_USER=<username>
 *   BASIC_AUTH_PASSWORD=<strong-password>
 *
 * Keep it disabled for public dashboards, Vercel preview links, or local dev.
 */
export function proxy(request: NextRequest) {
  if (process.env.BASIC_AUTH_ENABLED !== '1') {
    return NextResponse.next();
  }

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return new NextResponse('Basic auth is enabled but credentials are not configured.', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const authHeader = request.headers.get('authorization');
  const credentials = parseBasicAuth(authHeader);

  if (
    credentials &&
    constantTimeEqual(credentials.username, expectedUser) &&
    constantTimeEqual(credentials.password, expectedPassword)
  ) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Crypto Dashboard", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};

function parseBasicAuth(authHeader: string | null): { username: string; password: string } | null {
  if (!authHeader?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(authHeader.slice('Basic '.length));
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;

  for (let i = 0; i < maxLength; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return mismatch === 0;
}
