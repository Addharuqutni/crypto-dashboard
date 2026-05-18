/**
 * Next.js Instrumentation Hook.
 *
 * Called once when the Next.js server starts. Used to bootstrap background
 * tasks that should run for the lifetime of the server process.
 *
 * Currently starts the screener scheduler so market data is automatically
 * refreshed without requiring a separate terminal/process.
 */
export async function register() {
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScreenerScheduler } = await import('./lib/screener/scheduler');
    await startScreenerScheduler();
  }
}
