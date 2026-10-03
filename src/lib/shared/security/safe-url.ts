/**
 * SSRF guards for server-side outbound fetches (AI providers).
 * Blocks link-local / private / metadata hosts while allowing localhost Ollama.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function assertSafeOutboundUrl(
  value: string,
  options?: { allowLocalhost?: boolean }
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('URL must be a valid absolute URL.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URL must not include credentials.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL must use HTTP or HTTPS.');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const allowLocal = options?.allowLocalhost !== false;
  const isLocal = LOCAL_HOSTS.has(host);

  if (isLocal) {
    if (!allowLocal) throw new Error('Localhost URLs are not allowed.');
    return parsed;
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Remote providers must use HTTPS.');
  }

  if (isBlockedHostname(host)) {
    throw new Error('URL host is not allowed.');
  }

  return parsed;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === '0.0.0.0' || host === '::' || host === 'localhost') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true;
  }
  if (host === 'metadata.google.internal' || host === 'metadata') return true;

  if (isIpv4(host)) return isPrivateOrReservedIpv4(host);
  if (host.includes(':')) return isPrivateOrReservedIpv6(host);

  return false;
}

function isIpv4(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  if (normalized.startsWith('fe80')) return true; // link-local
  if (normalized.startsWith('ff')) return true; // multicast
  // IPv4-mapped :ffff:x.x.x.x
  const mapped = normalized.match(/^:ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) return isPrivateOrReservedIpv4(mapped[1]);
  return false;
}
