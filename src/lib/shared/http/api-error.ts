/**
 * Central mapping from adapter/internal errors to safe public HTTP errors.
 *
 * Rules enforced here:
 * - Never forward an internal message, URL, host, or port to the client.
 * - Failures that are OUR fault (internal service 401/403/5xx) become 502,
 *   because the browser client did nothing wrong.
 * - Only genuine client-fault statuses are mirrored back verbatim.
 * - Original detail is logged server-side via console.error.
 *
 * Errors are matched structurally (name + status) instead of via `instanceof`
 * so this module stays free of adapter imports (shared must not depend on
 * adapters) and survives duplicated module instances. `PythonAgentError` and
 * `AiClientError` both set `name`, `status`, and — where relevant — a kind /
 * retryAfter discriminator.
 */

export interface PublicApiError {
  status: number;
  message: string;
  headers?: Record<string, string>;
}

export interface ApiErrorOptions {
  /** Tag for the server-side console.error line. */
  context: string;
  /** Message used when the error is unknown, or maps to an unlisted status. */
  fallbackMessage: string;
  /** Status used when the error is unknown. Defaults to 502. */
  fallbackStatus?: number;
  /** Per-status message overrides for this route. */
  messages?: Partial<Record<number, string>>;
}

/** Generic, detail-free copy. Keyed by the status we actually send. */
const MESSAGES: Record<number, string> = {
  400: 'The request was rejected as invalid.',
  404: 'The requested resource was not found.',
  409: 'The service is busy with a conflicting operation.',
  422: 'The request could not be processed.',
  429: 'Rate limit exceeded. Please wait a moment and try again.',
  502: 'Upstream service failed to respond correctly.',
  503: 'Upstream service is unavailable. Please try again later.',
  504: 'Upstream service took too long to respond.',
};

/** Statuses that are genuinely the caller's fault and safe to mirror. */
const PASS_THROUGH_STATUSES = new Set([400, 404, 409, 422, 429]);

interface ErrorShape {
  name?: string;
  status?: number;
  kind?: string;
  retryAfter?: string;
}

/**
 * Map any thrown error to a public status + safe message. Always logs the
 * original error server-side.
 */
export function toPublicApiError(err: unknown, options: ApiErrorOptions): PublicApiError {
  const { status, headers, fellBack } = classify(err, options);
  console.error(`[${options.context}] request failed:`, err);

  // A route's own fallback copy is more specific than the generic table.
  const message = fellBack
    ? (options.messages?.[status] ?? options.fallbackMessage)
    : (options.messages?.[status] ?? MESSAGES[status] ?? options.fallbackMessage);
  return { status, message, headers };
}

function classify(
  err: unknown,
  options: ApiErrorOptions
): { status: number; headers?: Record<string, string>; fellBack: boolean } {
  const e = (err ?? {}) as ErrorShape;
  const name = typeof e.name === 'string' ? e.name : '';
  const status = typeof e.status === 'number' ? e.status : undefined;

  // fetch/AbortSignal.timeout surfaces as AbortError or TimeoutError.
  if (name === 'AbortError' || name === 'TimeoutError') return { status: 504, fellBack: false };

  if (name === 'PythonAgentError') {
    if (e.kind === 'timeout') return { status: 504, fellBack: false };
    if (e.kind === 'unreachable') return { status: 503, fellBack: false };
    return { status: mapStatus(status), fellBack: false };
  }

  if (name === 'AiClientError') {
    if (status === 429) {
      const retryAfter = e.retryAfter?.trim();
      return {
        status: 429,
        headers: { 'Retry-After': retryAfter || '60' },
        fellBack: false,
      };
    }
    // No status means our own pre-flight validation (missing key/model) — client fault.
    return {
      status: status === undefined ? 400 : mapStatus(status),
      fellBack: false,
    };
  }

  return { status: options.fallbackStatus ?? 502, fellBack: true };
}

/** 401/403/5xx from an internal service are our problem, not the caller's. */
function mapStatus(status: number | undefined): number {
  if (status !== undefined && PASS_THROUGH_STATUSES.has(status)) return status;
  return 502;
}