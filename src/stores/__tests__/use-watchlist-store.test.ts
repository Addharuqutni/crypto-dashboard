import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Watchlist store tests.
 *
 * Vitest runs in `node` env, so we can't rely on a real `localStorage`.
 * Instead we mock the storage adapter the store actually depends on
 * (`safeGetItem`/`safeSetItem`) and assert against those calls.
 *
 * Focus areas:
 * - Hydrate self-heal: normalize legacy data on read AND persist back exactly
 *   once when something actually changed.
 * - Hydrate is a no-op write when data is already clean.
 * - Symbol normalization for membership/mutation paths.
 */

const safeGetItem = vi.fn();
const safeSetItem = vi.fn();
const safeRemoveItem = vi.fn();

vi.mock('@/lib/adapters/storage', () => ({
  STORAGE_KEYS: {
    watchlist: 'crypto-dashboard.watchlist.v1',
    portfolio: 'crypto-dashboard.portfolio.v1',
    alerts: 'crypto-dashboard.alerts.v1',
    theme: 'crypto-dashboard.theme.v1',
    coinDetailMode: 'crypto-dashboard.coin-detail-mode.v1',
  },
  safeGetItem: (...args: unknown[]) => safeGetItem(...args),
  safeSetItem: (...args: unknown[]) => safeSetItem(...args),
  safeRemoveItem: (...args: unknown[]) => safeRemoveItem(...args),
}));

// Import AFTER vi.mock so the mocked module is used.
const { useWatchlistStore } = await import('../use-watchlist-store');

const WATCHLIST_KEY = 'crypto-dashboard.watchlist.v1';

function resetStore() {
  safeGetItem.mockReset();
  safeSetItem.mockReset();
  safeRemoveItem.mockReset();
  useWatchlistStore.setState({ items: [], hydrated: false });
}

describe('useWatchlistStore.hydrate self-heal', () => {
  beforeEach(() => resetStore());

  it('writes normalized items back when storage holds legacy lowercase symbols', () => {
    safeGetItem.mockReturnValue([{ symbol: 'btc', name: 'Bitcoin', addedAt: '2024-01-01' }]);

    useWatchlistStore.getState().hydrate();

    expect(safeSetItem).toHaveBeenCalledTimes(1);
    expect(safeSetItem).toHaveBeenCalledWith(WATCHLIST_KEY, [
      { symbol: 'BTC', name: 'Bitcoin', addedAt: '2024-01-01' },
    ]);
    expect(useWatchlistStore.getState().items[0]?.symbol).toBe('BTC');
  });

  it('drops invalid rows (empty symbol/name) and persists the cleaned shape', () => {
    safeGetItem.mockReturnValue([
      { symbol: 'btc', name: 'Bitcoin', addedAt: '2024-01-01' },
      { symbol: '   ', name: 'Garbage', addedAt: '2024-01-02' },
      { symbol: 'eth', name: '', addedAt: '2024-01-03' },
    ]);

    useWatchlistStore.getState().hydrate();

    const items = useWatchlistStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0]?.symbol).toBe('BTC');

    expect(safeSetItem).toHaveBeenCalledTimes(1);
    const persisted = safeSetItem.mock.calls[0]?.[1] as unknown[];
    expect(persisted).toHaveLength(1);
  });

  it('does NOT touch storage when items are already normalized', () => {
    safeGetItem.mockReturnValue([{ symbol: 'BTC', name: 'Bitcoin', addedAt: '2024-01-01' }]);

    useWatchlistStore.getState().hydrate();

    expect(safeSetItem).not.toHaveBeenCalled();
    expect(useWatchlistStore.getState().items[0]?.symbol).toBe('BTC');
  });

  it('hydrates an empty list when storage payload is non-array (corrupt)', () => {
    safeGetItem.mockReturnValue({ corrupt: true } as unknown as never);

    useWatchlistStore.getState().hydrate();

    expect(useWatchlistStore.getState().items).toEqual([]);
    expect(useWatchlistStore.getState().hydrated).toBe(true);
    // Corrupt payload triggers a self-heal write to recover the storage shape.
    expect(safeSetItem).toHaveBeenCalledTimes(1);
    expect(safeSetItem).toHaveBeenCalledWith(WATCHLIST_KEY, []);
  });

  it('hydrates an empty list when storage is empty', () => {
    safeGetItem.mockReturnValue([]);

    useWatchlistStore.getState().hydrate();

    expect(useWatchlistStore.getState().items).toEqual([]);
    expect(useWatchlistStore.getState().hydrated).toBe(true);
    expect(safeSetItem).not.toHaveBeenCalled();
  });
});

describe('useWatchlistStore membership and mutation', () => {
  beforeEach(() => resetStore());

  it('addCoin rejects empty symbol or name', () => {
    const ok1 = useWatchlistStore.getState().addCoin('   ', 'Bitcoin');
    const ok2 = useWatchlistStore.getState().addCoin('BTC', '   ');
    expect(ok1).toBe(false);
    expect(ok2).toBe(false);
    expect(useWatchlistStore.getState().items).toHaveLength(0);
    expect(safeSetItem).not.toHaveBeenCalled();
  });

  it('addCoin treats lowercase variants as duplicates', () => {
    useWatchlistStore.getState().addCoin('BTC', 'Bitcoin');
    const ok = useWatchlistStore.getState().addCoin('btc', 'Bitcoin');
    expect(ok).toBe(false);
    expect(useWatchlistStore.getState().items).toHaveLength(1);
  });

  it('isInWatchlist is case-insensitive', () => {
    useWatchlistStore.getState().addCoin('BTC', 'Bitcoin');
    expect(useWatchlistStore.getState().isInWatchlist('btc')).toBe(true);
    expect(useWatchlistStore.getState().isInWatchlist('BTC')).toBe(true);
    expect(useWatchlistStore.getState().isInWatchlist('eth')).toBe(false);
  });

  it('removeCoin handles legacy lowercase symbols still in the in-memory list', () => {
    // Defensive: even if hydrate normalization didn't run, removeCoin should
    // still match by normalized form.
    useWatchlistStore.setState({
      items: [{ symbol: 'btc', name: 'Bitcoin', addedAt: '2024-01-01' }],
      hydrated: true,
    });
    useWatchlistStore.getState().removeCoin('BTC');
    expect(useWatchlistStore.getState().items).toHaveLength(0);
  });
});
