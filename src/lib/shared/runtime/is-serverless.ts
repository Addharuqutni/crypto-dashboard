/**
 * Detect serverless runtimes (Vercel, Lambda, Now) where the filesystem is
 * read-only and there is no long-running process. Single source of truth for
 * storage/scheduler gating.
 */
export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL === 'true' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    process.env.LAMBDA_TASK_ROOT === '/var/task' ||
    Boolean(process.env.NOW_REGION)
  );
}
