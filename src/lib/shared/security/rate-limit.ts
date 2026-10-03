import { NextResponse } from 'next/server';

// ponytail: in-memory Map throttle. Fine for single-instance standalone deploy.
// Upgrade to Redis when multi-instance.
const hits = new Map<string, number[]>();
let warnedAboutMissingTrustProxy = false;

export function rateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const arr = hits.get(key) ?? [];
  const valid = arr.filter((t) => now - t < windowMs);
  if (valid.length >= max) {
    hits.set(key, valid);
    return false;
  }
  valid.push(now);
  hits.set(key, valid);
  if (hits.size > 5_000) prune(now, windowMs);
  return true;
}

/** Standard 429 response for rate-limited routes. Callers keep their own body envelope. */
export function rateLimitedResponse(
  body: Record<string, unknown>,
  headers: Record<string, string> = { 'Cache-Control': 'no-store' }
): NextResponse {
  return NextResponse.json(body, { status: 429, headers });
}

/**
 * Client IP for rate limiting.
 * Prefer socket-style headers only when TRUST_PROXY=1 (nginx sets X-Real-IP).
 * Otherwise ignore X-Forwarded-For (spoofable) and bucket as "local".
 */
export function getClientIp(request: Request): string {
  if (process.env.TRUST_PROXY === '1') {
    const realIp = request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    // Rightmost hop is usually the trusted proxy's view of the client when
    // nginx appends; leftmost is client-controlled. Prefer rightmost.
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) {
      const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) return last;
    }
  } else if (!warnedAboutMissingTrustProxy && hasProxyHeaders(request)) {
    // Collapsing every client into one bucket is a silent footgun behind a proxy.
    warnedAboutMissingTrustProxy = true;
    console.warn(
      '[rate-limit] proxy headers present but TRUST_PROXY!=1; all clients share one bucket. Set TRUST_PROXY=1 behind a trusted proxy.'
    );
  }
  return 'local';
}

function hasProxyHeaders(request: Request): boolean {
  return Boolean(request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for'));
}

function prune(now: number, windowMs: number): void {
  for (const [key, arr] of hits) {
    const valid = arr.filter((t) => now - t < windowMs);
    if (valid.length === 0) hits.delete(key);
    else hits.set(key, valid);
  }
}
