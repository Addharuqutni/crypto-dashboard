import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ScreenerStore, LATEST_SNAPSHOT_FILE } from '../store';
import type { ScreenerLatestRun } from '../store';

const TEST_DIR = path.join(process.cwd(), 'data', 'screener-test-' + process.pid);

let store: ScreenerStore;

beforeEach(async () => {
  store = new ScreenerStore(TEST_DIR);
  await fs.mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // tolerate cleanup failures
  }
});

function makeLatest(): ScreenerLatestRun {
  const now = Date.now();
  return {
    completedAt: now,
    health: {
      status: 'completed',
      startedAt: now - 1000,
      completedAt: now,
      evaluatedSymbols: 10,
      failedSymbols: 0,
      errors: [],
    },
    results: [],
    timeframes: { setup: '30m', trigger: '15m', macro: '4h' },
    universeSize: 10,
  };
}

describe('ScreenerStore', () => {
  it('returns null when no latest exists', async () => {
    expect(await store.readLatest()).toBeNull();
  });

  it('returns null when the data directory does not exist at all', async () => {
    const missing = new ScreenerStore(path.join(TEST_DIR, 'never-created'));
    expect(await missing.readLatest()).toBeNull();
  });

  it('reads the snapshot the Python engine writes', async () => {
    const latest = makeLatest();
    await fs.writeFile(
      path.join(TEST_DIR, LATEST_SNAPSHOT_FILE),
      JSON.stringify(latest),
      'utf8'
    );

    const read = await store.readLatest();
    expect(read).not.toBeNull();
    expect(read!.completedAt).toBe(latest.completedAt);
    expect(read!.universeSize).toBe(10);
  });

  it('returns null on a corrupt snapshot instead of throwing', async () => {
    await fs.writeFile(path.join(TEST_DIR, LATEST_SNAPSHOT_FILE), '{ not json', 'utf8');
    expect(await store.readLatest()).toBeNull();
  });

  // The engine owns the filename. If it is ever renamed, this fails here rather
  // than as a silently empty dashboard in production.
  it('reads exactly `latest.json`', () => {
    expect(LATEST_SNAPSHOT_FILE).toBe('latest.json');
  });
});
