import { NextResponse } from 'next/server';

import { toPublicApiError, type ApiErrorOptions } from './api-error';

/**
 * Build a public error response for a BFF route.
 *
 * Every route had been assembling this by hand, and they drifted. Probing the
 * built server showed `/api/screener` and `/api/cron/screener` returning 5xx
 * with no `Cache-Control` at all, while `/api/agent` and `/api/action-call` set
 * `no-store`. Same intent, two behaviours — and the two that forgot are the two
 * a shared proxy or CDN is most likely to hold on to.
 *
 * Only the *error* shape is shared here. Success envelopes genuinely differ
 * (`{ok, mode, latest, …}` vs `{ok, source, result}` vs a passthrough of the
 * upstream body), so forcing them together would trade one shallow seam for
 * another. The failure envelope is the part that really is the same job, so it
 * gets a default and routes that differ pass their own.
 */
export interface ApiErrorResponseOptions extends ApiErrorOptions {
  /**
   * Failure body, given the already-sanitised message. Defaults to
   * `{ ok: false, error }`, which is what most routes send.
   */
  envelope?: (message: string) => Record<string, unknown>;
}

/** Default failure envelope: `{ ok: false, error }`. */
export const defaultErrorEnvelope = (message: string) => ({ ok: false, error: message });

/** `{ success: false, error }` — the cron route's documented contract. */
export const successKeyErrorEnvelope = (message: string) => ({ success: false, error: message });

/** `{ error }` — used by the AI routes. */
export const bareErrorEnvelope = (message: string) => ({ error: message });

export function apiErrorResponse(
  error: unknown,
  options: ApiErrorResponseOptions
): NextResponse {
  const { envelope = defaultErrorEnvelope, ...classifierOptions } = options;
  const { status, message, headers } = toPublicApiError(error, classifierOptions);

  return NextResponse.json(envelope(message), {
    status,
    // no-store first, classifier headers after: a provider 429 must still be
    // able to add Retry-After without losing the cache directive.
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}
