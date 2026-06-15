import { spawn } from 'node:child_process';

process.env.NODE_ENV = 'production';
process.env.DISABLE_SCREENER_SCHEDULER ??= '1';

const serverPath = '.next/standalone/server.js';
const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: process.env,
  shell: false,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
