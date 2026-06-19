import { existsSync, cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

process.env.NODE_ENV = 'production';
process.env.DISABLE_SCREENER_SCHEDULER ??= '1';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneDir = join(rootDir, '.next', 'standalone');
const serverPath = join(standaloneDir, 'server.js');

ensureStandaloneAssets();

const child = spawn(process.execPath, [serverPath], {
  stdio: 'inherit',
  env: process.env,
  cwd: standaloneDir,
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

function ensureStandaloneAssets() {
  if (!existsSync(serverPath)) {
    console.error('[start:prod] Missing .next/standalone/server.js. Run `npm run build` first.');
    process.exit(1);
  }

  copyDirIfExists(join(rootDir, '.next', 'static'), join(standaloneDir, '.next', 'static'));
  copyDirIfExists(join(rootDir, 'public'), join(standaloneDir, 'public'));
}

function copyDirIfExists(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}
