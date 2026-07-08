// ponytail: in-memory Map throttle. Fine for single-instance standalone deploy.
// Upgrade to Redis when multi-instance.
const WINDOW_MS = 2000;
const MAX_HITS = 1;
const hits = new Map<string, number[]>();

export function rateLimit(ip: string, windowMs = WINDOW_MS, max = MAX_HITS): boolean {
  const now = Date.now();
  const arr = hits.get(ip) ?? [];
  const valid = arr.filter((t) => now - t < windowMs);
  if (valid.length >= max) {
    hits.set(ip, valid);
    return false;
  }
  valid.push(now);
  hits.set(ip, valid);
  return true;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}
