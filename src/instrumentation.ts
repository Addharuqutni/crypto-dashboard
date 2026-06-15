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
 * - Boots by default in a long-running Node.js server (self-host / VPS).
 * - SKIPPED automatically on Vercel/serverless (`process.env.VERCEL`): the
 *   filesystem is read-only and there is no persistent process, so the
 *   scheduler cannot run. Use Vercel Cron (/api/cron/screener) or run the
 *   `/api/screener` on-demand path instead.
 * - Skipped when `DISABLE_SCREENER_SCHEDULER=1` is set.
 * - Always skipped in the Edge runtime (uses Node-only modules like fs).
 * - Never throws: any bootstrap failure is logged and swallowed so it can
 *   never crash the server with an unhandled rejection (exit 128).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Serverless platforms (Vercel) have a read-only filesystem and no
  // long-running process. Running the scheduler there crashes startup with
  // ENOENT mkdir '/var/task/data'. Skip it entirely.
  if (process.env.VERCEL || process.env.VERCEL === '1') {
    console.info('[screener.scheduler] disabled on Vercel/serverless runtime');
    return;
  }

  if (process.env.DISABLE_SCREENER_SCHEDULER === '1') {
    console.info('[screener.scheduler] disabled via DISABLE_SCREENER_SCHEDULER=1');
    return;
  }

  try {
    const { startScreenerScheduler } = await import('./lib/application/screener/scheduler');
    await startScreenerScheduler();
  } catch (err) {
    // Never let a scheduler bootstrap failure crash the web server.
    console.error(
      '[screener.scheduler] failed to start (continuing without it):',
      err instanceof Error ? err.message : err
    );
  }
}
