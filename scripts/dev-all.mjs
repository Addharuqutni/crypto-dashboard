#!/usr/bin/env node
/**
 * One command to run the local dev stack:
 *
 *   [web]       Next.js (UI + BFF API routes)  — port 3000
 *   [api]       Python Action Call (FastAPI)   — port 8000
 *   [screener]  Python screener worker         — writes data/screener/latest.json
 *
 * Why a hand-rolled orchestrator instead of `concurrently`: this repo has no
 * process-runner dependency, and we need to (a) verify the Python interpreter
 * actually runs (a venv built on another OS looks present but is dead), and
 * (b) kill the whole process tree on Windows, which `concurrently` does not do.
 *
 * Usage:  npm run dev:all [-- --keep-alive]
 *   --keep-alive  don't stop the other processes when one exits
 */

import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AGENT_DIR = join(ROOT, 'agent');
const VENV_DIR = join(AGENT_DIR, '.venv');
const IS_WIN = process.platform === 'win32';
const VENV_PY = IS_WIN
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python');

const WEB_PORT = Number(process.env.PORT ?? 3000);
const API_PORT = Number(process.env.DASHBOARD_PORT ?? 8000);
const LOCK_FILE = join(ROOT, 'data', 'screener', 'screener.lock');

const KEEP_ALIVE = process.argv.includes('--keep-alive');

const ANSI = {
  web: '\x1b[36m',
  api: '\x1b[35m',
  screener: '\x1b[33m',
  sys: '\x1b[90m',
  reset: '\x1b[0m',
};

const children = new Map(); // name -> ChildProcess
let shuttingDown = false;

function log(tag, message) {
  const color = ANSI[tag] ?? ANSI.sys;
  process.stdout.write(`${color}[${tag}]${ANSI.reset} ${message}\n`);
}

/** Pipe a child stream line-by-line, prefixing every line with its tag. */
function pipeWithPrefix(stream, tag) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length > 0) log(tag, line);
    }
  });
  stream.on('end', () => {
    if (buffer.length > 0) log(tag, buffer);
  });
}

/** True if the port is already bound by something else. */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(port, '127.0.0.1');
  });
}

/** Poll a URL until it answers, or throw on timeout. */
async function waitForUrl(url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok || res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} tidak merespons di ${url} setelah ${timeoutMs / 1000}s`);
}

/**
 * The screener worker takes an exclusive lock (O_CREAT|O_EXCL). If a previous
 * run was killed hard, the lock file survives, and the worker then treats
 * every cycle as "already running" and silently does nothing. Clear it only
 * when the PID it names is no longer alive.
 */
function clearStaleLock() {
  if (!existsSync(LOCK_FILE)) return;
  const pid = Number.parseInt(readFileSync(LOCK_FILE, 'utf8').trim(), 10);

  if (Number.isFinite(pid) && isProcessAlive(pid)) {
    throw new Error(
      `Screener worker sudah jalan (PID ${pid}, lock: ${LOCK_FILE}).\n` +
        'Hentikan dulu proses itu, atau hapus file lock kalau Anda yakin prosesnya sudah mati.'
    );
  }

  rmSync(LOCK_FILE, { force: true });
  log('sys', `menghapus lock basi: ${LOCK_FILE}`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // exists but not ours
  }
}

/** Run a command to completion, inheriting stdio. Throws on non-zero exit. */
function runOrThrow(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} gagal (exit ${result.status})`);
  }
}

/**
 * A venv created on a different OS (or moved) has a python binary that exists
 * but cannot start. Verify by running it, not by checking the file.
 */
function interpreterWorks() {
  if (!existsSync(VENV_PY)) return false;
  const probe = spawnSync(VENV_PY, ['-c', 'import sys'], { stdio: 'ignore', shell: false });
  return !probe.error && probe.status === 0;
}

function ensureVenv() {
  if (interpreterWorks()) return;

  if (existsSync(VENV_DIR)) {
    log('sys', 'agent/.venv tidak bisa dijalankan (kemungkinan dibuat di OS lain) — membangun ulang');
    rmSync(VENV_DIR, { recursive: true, force: true });
  } else {
    log('sys', 'membuat agent/.venv (sekali saja)');
  }

  const systemPython = IS_WIN ? 'python' : 'python3';
  runOrThrow(systemPython, ['-m', 'venv', '.venv'], { cwd: AGENT_DIR });
  runOrThrow(VENV_PY, ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: AGENT_DIR });
  log('sys', 'menginstall agent/requirements.txt (perlu beberapa menit)');
  runOrThrow(VENV_PY, ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: AGENT_DIR });
  log('sys', 'venv siap');
}

function ensureEnvFile() {
  const envLocal = join(ROOT, '.env.local');
  if (existsSync(envLocal)) return;
  copyFileSync(join(ROOT, '.env.example'), envLocal);
  log('sys', 'membuat .env.local dari .env.example (tinjau nilainya bila perlu)');
}

function start(name, command, args, options) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, ...options });
  pipeWithPrefix(child.stdout, name);
  pipeWithPrefix(child.stderr, name);
  child.on('exit', (code, signal) => onChildExit(name, code, signal));
  child.on('error', (err) => log(name, `gagal start: ${err.message}`));
  children.set(name, child);
  return child;
}

function onChildExit(name, code, signal) {
  if (shuttingDown) return;
  const reason = signal ? `signal ${signal}` : `exit ${code}`;
  log('sys', `[${name}] berhenti (${reason})`);
  if (KEEP_ALIVE) {
    children.delete(name);
    return;
  }
  shutdown(typeof code === 'number' && code !== 0 ? code : 1);
}

/** Kill a child and its whole process tree. */
function killChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WIN) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('sys', 'menghentikan semua proses...');
  for (const child of children.values()) killChild(child);
  rmSync(LOCK_FILE, { force: true });
  setTimeout(() => process.exit(exitCode), 500).unref();
}

async function main() {
  ensureEnvFile();

  if (await isPortInUse(WEB_PORT)) {
    throw new Error(`Port ${WEB_PORT} sudah dipakai. Hentikan proses itu atau set PORT lain.`);
  }
  if (await isPortInUse(API_PORT)) {
    throw new Error(
      `Port ${API_PORT} sudah dipakai. Hentikan proses itu atau set DASHBOARD_PORT lain.`
    );
  }

  clearStaleLock();
  ensureVenv();

  const nextBin = join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const pythonEnv = { ...process.env, MARKET_DATA_MODE: 'dashboard' };

  log('sys', 'menjalankan Next.js, Python Action Call, dan screener worker...');
  start('web', process.execPath, [nextBin, 'dev', '--turbopack'], { cwd: ROOT });
  start('api', VENV_PY, ['main.py'], { cwd: AGENT_DIR, env: pythonEnv });
  start('screener', VENV_PY, ['-m', 'src.screener.worker'], { cwd: AGENT_DIR });

  await waitForUrl(`http://127.0.0.1:${API_PORT}/api/v1/health`, 'Python Action Call');
  await waitForUrl(`http://127.0.0.1:${WEB_PORT}`, 'Next.js');

  log('sys', `siap — web http://localhost:${WEB_PORT} · python http://127.0.0.1:${API_PORT}`);
  log('sys', 'Ctrl+C untuk menghentikan semuanya');
}

// Ctrl+C (SIGINT) and terminal-close (SIGHUP/SIGBREAK on Windows) should all
// tear the stack down. SIGTERM is included for Unix/PM2-style callers; note it
// is not delivered on Windows.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => shutdown(0));
}

main().catch((err) => {
  log('sys', `ERROR: ${err.message}`);
  shutdown(1);
});
