import { expect, test, type Page } from '@playwright/test';

/**
 * Runtime regression test for the market WebSocket lifecycle.
 *
 * Covered defects only appear with a live socket over a client-side route
 * change, so this runs in the browser: the repo's Vitest suite is `node`-env
 * with no DOM and cannot mount hooks.
 *
 * Navigation goes through header links on purpose. `page.goto()` is a full
 * document load, which tears the whole React tree down and cannot reproduce a
 * stale async continuation inside a mounted provider.
 */

const BINANCE_STREAM = 'fstream.binance.com';

interface SocketRecord {
  opened: boolean;
  closed: boolean;
}

/**
 * Tracks every Binance socket's open/close lifecycle from inside the page.
 *
 * Records `opened` separately from `closed`: a socket that never connected
 * (offline CI, DNS failure) is neither the leak we are looking for nor proof
 * of health, so the assertion only counts sockets that actually opened.
 */
async function instrumentSockets(page: Page) {
  await page.addInitScript((stream) => {
    const Native = window.WebSocket;
    const records: { url: string; opened: boolean; closed: boolean }[] = [];
    (window as unknown as { __binanceSockets: typeof records }).__binanceSockets = records;

    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url as string, protocols as string);
        if (String(url).includes(stream)) {
          const record = { url: String(url), opened: false, closed: false };
          records.push(record);
          this.addEventListener('open', () => {
            record.opened = true;
          });
          this.addEventListener('close', () => {
            record.closed = true;
          });
        }
      }
    } as unknown as typeof WebSocket;
  }, BINANCE_STREAM);
}

async function readOpened(page: Page): Promise<SocketRecord[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __binanceSockets: SocketRecord[] }).__binanceSockets as SocketRecord[]
  );
}

/**
 * Holds `exchangeInfo` open so a route toggle happens while the init effect's
 * `loadValidSymbols()` is still in flight.
 *
 * That is the exact window the stale-continuation defect lived in: without a
 * generation token, the first run's promise resolves after the second run has
 * already set `mountedRef` back to `true`, sees a live component, and opens a
 * second socket. Left to real network timing the window is too narrow to hit
 * reliably, so the test would pass against the broken code.
 */
async function stallSymbolBootstrap(page: Page) {
  await page.route('**/fapi/v1/exchangeInfo', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    // Non-empty, or loadValidSymbols() treats it as transient and retries with
    // backoff, which stretches the stall unpredictably.
    await route.fulfill({ json: { symbols: [{ symbol: 'BTCUSDT', status: 'TRADING' }] } });
  });
}

test('does not open a second socket when a toggle lands mid-bootstrap', async ({ page }) => {
  test.setTimeout(180_000);
  await instrumentSockets(page);
  await stallSymbolBootstrap(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();

  // Navigate away and back while the first run is still awaiting exchangeInfo,
  // so the first effect's continuation is guaranteed to land after the second.
  await page.getByRole('link', { name: 'Screener', exact: true }).click();
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();

  // The stalled bootstrap plus its retry/backoff means the first socket does not
  // appear until ~16s, and the orphan only shows once a later reconnect has had
  // time to strand it.
  //
  // Assert on the settled state, not every instant: `close()` is asynchronous,
  // so a healthy reconnect briefly has the outgoing and incoming socket open at
  // the same time (measured with the fix: one sample of 2, then back to 1). The
  // unfixed hook instead holds 2 from ~24s and climbs to 3 and stays there.
  const samples: number[] = [];
  for (let i = 0; i < 32; i++) {
    await page.waitForTimeout(1_500);
    const sockets = await readOpened(page);
    samples.push(sockets.filter((s) => s.opened && !s.closed).length);
  }

  const settled = samples.slice(-5);
  expect(
    Math.max(...settled),
    `sockets never settled back to one — last 5 samples: ${settled.join(',')} ` +
      `(full run: ${samples.join(',')})`
  ).toBeLessThanOrEqual(1);
});

test('holds at most one live Binance socket across in-app route toggles', async ({ page }) => {
  test.setTimeout(90_000);
  await instrumentSockets(page);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();

  // Client-side hops that flip `enabled` off and on: /screener and /journal
  // are outside shouldEnableMarketStream, the rest are inside. Each toggle
  // used to risk a stale loadValidSymbols() continuation opening a second
  // socket, and a delayed onclose stranding the live one.
  const hops = ['Screener', 'Journal', 'Dashboard', 'Journal', 'Dashboard'];
  for (const label of hops) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await page.waitForTimeout(500);

    const sockets = await readOpened(page);
    const live = sockets.filter((s) => s.opened && !s.closed);
    expect(
      live.length,
      `${live.length} concurrent Binance sockets after navigating to ${label}: ` +
        JSON.stringify(sockets)
    ).toBeLessThanOrEqual(1);
  }

  expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
});

test('closes the Binance socket when the app unmounts it', async ({ page }) => {
  await instrumentSockets(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();
  await page.waitForTimeout(800);

  const before = await readOpened(page);
  expect(before.length, 'expected the market socket to have been constructed').toBeGreaterThan(0);

  // Leaving the stream-enabled routes tears the provider down.
  await page.getByRole('link', { name: 'Screener', exact: true }).click();
  await page.waitForTimeout(500);

  const after = await readOpened(page);
  const leaked = after.filter((s) => s.opened && !s.closed);
  expect(leaked.length, `socket outlived its route: ${JSON.stringify(after)}`).toBeLessThanOrEqual(1);
});