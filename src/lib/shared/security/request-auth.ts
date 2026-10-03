import { NextResponse } from 'next/server';

/** Constant-time string compare (length leak OK; content not). */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < maxLength; i += 1) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

/**
 * Require `Authorization: Bearer <CRON_SECRET>`.
 * Returns null when authorized; otherwise a ready JSON response.
 */
export function requireCronBearer(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: 'Cron secret is not configured' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const header = request.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!header.startsWith(prefix)) {
    return unauthorized();
  }
  const provided = header.slice(prefix.length).trim();
  if (!provided || !constantTimeEqual(provided, secret)) {
    return unauthorized();
  }
  return null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } }
  );
}
