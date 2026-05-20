/**
 * Next.js Instrumentation Hook.
 *
 * Called once when the Next.js server starts. Used to bootstrap background
 * tasks that should run for the lifetime of the server process.
 *
 * Boots the screener scheduler so market data is automatically refreshed
 * without requiring a separate `npm run screener` terminal/process.
 *
 * Behavior:
 * - Boots by default in both development and production.
 * - Skipped only when `DISABLE_SCREENER_SCHEDULER=1` is set, useful when
 *   you want a faster `next dev` cold-start while debugging UI that
 *   doesn't depend on screener data.
 * - Always skipped in the Edge runtime (uses Node-only modules like fs).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (process.env.DISABLE_SCREENER_SCHEDULER === '1') {
    console.info('[screener.scheduler] disabled via DISABLE_SCREENER_SCHEDULER=1');
    return;
  }

  const { startScreenerScheduler } = await import('./lib/application/screener/scheduler');
  await startScreenerScheduler();
}
