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
  // In some Next.js builds this is undefined during instrumentation bootstrap.
  // Only skip when it is explicitly non-node.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  if (process.env.DISABLE_SCREENER_SCHEDULER === '1') {
    console.info('[screener.scheduler] disabled via DISABLE_SCREENER_SCHEDULER=1');
    return;
  }

  // Serverless platforms have a read-only deployment filesystem and no
  // long-running process. Running an in-process scheduler there crashes startup
  // with ENOENT/EROFS around /var/task/data. Use /api/cron/screener instead.
  if (isServerlessRuntime()) {
    console.info('[screener.scheduler] disabled on serverless runtime');
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

function isServerlessRuntime(): boolean {
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  if (process.env.LAMBDA_TASK_ROOT === '/var/task') return true;
  if (process.env.NOW_REGION) return true;
  return false;
}
