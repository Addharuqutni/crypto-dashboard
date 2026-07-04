import { expect, test } from '@playwright/test';

const screenerPayload = {
  ok: true,
  latest: {
    completedAt: Date.now(),
    universeSize: 1,
    timeframes: { setup: '1h', trigger: '15m', macro: '4h' },
    health: {
      status: 'completed',
      startedAt: 1,
      completedAt: 2,
      evaluatedSymbols: 1,
      failedSymbols: 0,
      errors: [],
    },
    results: [
      {
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        setupTimeframe: '1h',
        triggerTimeframe: '15m',
        macroTimeframe: '4h',
        evaluatedAt: 1,
        candleCloseTime: 1,
        currentPrice: 65000,
        dataHealth: {
          ok: true,
          symbol: { provided: true, valid: true, reason: null },
          setup: {
            required: true,
            candleCount: 100,
            minCandlesRequired: 50,
            lastCandleAgeSec: 60,
            maxAgeSec: 3600,
            ok: true,
            reason: null,
          },
          macro: {
            required: true,
            candleCount: 100,
            minCandlesRequired: 50,
            lastCandleAgeSec: 60,
            maxAgeSec: 3600,
            ok: true,
            reason: null,
          },
          trigger: {
            required: true,
            candleCount: 100,
            minCandlesRequired: 50,
            lastCandleAgeSec: 60,
            maxAgeSec: 3600,
            ok: true,
            reason: null,
          },
          funding: { available: true, ageSec: 60, maxAgeSec: 32400, ok: true },
          openInterest: { available: true, ageSec: 60, maxAgeSec: 900, ok: true },
          reasons: [],
          confidenceCap: 100,
        },
        action: 'LONG',
        confidence: 82,
        grade: 'A',
        entry: 65000,
        stopLoss: 64000,
        takeProfits: [67000, 69000],
        riskReward: 2,
        marketRegime: 'bullish_trend',
        tradePermission: 'long_only',
        reasons: ['trend aligned'],
        noTradeReasons: [],
        fundingRate: 0.0001,
        openInterestChangePercent: 2,
        mtfAlignmentScore: 80,
        warnings: [],
        freshness: {
          setupCandleAgeSec: 60,
          macroCandleAgeSec: 60,
          triggerCandleAgeSec: 60,
          fundingAgeSec: 60,
          openInterestAgeSec: 60,
        },
        rank: 1,
        rankingScore: 91,
        rankReason: ['strong setup'],
        alertEligible: true,
        alertBlockReasons: [],
      },
    ],
  },
  settings: {
    enabled: false,
    minConfidence: 70,
    minGrade: 'B',
    minRiskReward: 1.5,
    maxAlertsPerHour: 3,
    cooldownMinutes: 30,
    sendWaitAlerts: false,
    topNOnly: 5,
  },
  recentAlerts: [],
  recentActionCalls: [],
  recentJournalEntries: [],
};

test('dashboard renders shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: /CryptoHawk dashboard/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();
});

test('screener renders decision-support page', async ({ page }) => {
  await page.route('**/api/screener', async (route) => {
    await route.fulfill({ json: { ...screenerPayload, latest: null } });
  });

  await page.goto('/screener');

  await expect(page.getByRole('heading', { name: 'Futures Screener' })).toBeVisible();
  await expect(page.getByText(/educational decision-support only/i)).toBeVisible();
});

test('coin detail renders known symbol', async ({ page }) => {
  await page.goto('/coin/btc');

  await expect(page.getByRole('heading', { name: 'Bitcoin' })).toBeVisible();
  await expect(page.getByText('BTC')).toBeVisible();
});

test('search navigates to coin detail', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('combobox', { name: /search cryptocurrency/i }).fill('btc');
  await page.getByRole('option', { name: /bitcoin/i }).click();

  await expect(page).toHaveURL(/\/coin\/btc$/);
  await expect(page.getByRole('heading', { name: 'Bitcoin' })).toBeVisible();
});

test('watchlist toggle persists after reload', async ({ page }) => {
  await page.goto('/coin/btc');

  const toggle = page.getByRole('button', { name: /watchlist/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.getByRole('button', { name: /remove BTC from watchlist/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: /remove BTC from watchlist/i })).toBeVisible();
});

test('screener top setup opens detail drawer', async ({ page }) => {
  await page.route('**/api/screener', async (route) => {
    await route.fulfill({ json: screenerPayload });
  });

  await page.goto('/screener');
  await page.getByRole('button', { name: /LONG BTC/i }).click();

  await expect(page.getByRole('dialog', { name: /BTC\/USDT/i })).toBeVisible();
  await expect(page.getByText('Engine levels')).toBeVisible();
  await page.getByRole('button', { name: /close setup details/i }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
