/**
 * Next.js instrumentation hook.
 *
 * Screener scheduling is owned by the separate Python worker. The web process
 * intentionally performs no background screener work.
 */
export async function register() {
  return;
}
