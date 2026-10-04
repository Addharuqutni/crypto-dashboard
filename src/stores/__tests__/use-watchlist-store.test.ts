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

vi.mock('@/lib/shared/browser-storage', () => ({
  STORAGE_KEYS: {
    watchlist: 'crypto-dashboard.watchlist.v1',
    portfolio: 'crypto-dashboard.portfolio.v1',
    alerts: 'crypto-dashboard.alerts.v1',
    coinDetailMode: 'crypto-dashboard.coin-detail-mode.v1',
  },
  safeGetItem: (...args: unknown[]) => safeGetItem(...args),
  safeSetItem: (...args: unknown[]) => safeSetItem(...args),
}));

// Import AFTER vi.mock so the mocked module is used.
const { useWatchlistStore } = await import('../use-watchlist-store');

const WATCHLIST_KEY = 'crypto-dashboard.watchlist.v1';

function resetStore() {
  safeGetItem.mockReset();
  safeSetItem.mockReset();
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

describe('useWatchlistStore reordering', () => {
  beforeEach(() => resetStore());

  /** Seed three items in a known order. */
  function seed(): void {
    useWatchlistStore.setState({
      items: [
        { symbol: 'BTC', name: 'Bitcoin', addedAt: '2024-01-01' },
        { symbol: 'ETH', name: 'Ethereum', addedAt: '2024-01-02' },
        { symbol: 'SOL', name: 'Solana', addedAt: '2024-01-03' },
      ],
      hydrated: true,
    });
  }

  const order = () => useWatchlistStore.getState().items.map((item) => item.symbol);

  it('moveUp swaps with the previous item and persists the new order', () => {
    seed();
    useWatchlistStore.getState().moveUp('ETH');
    expect(order()).toEqual(['ETH', 'BTC', 'SOL']);
    expect(safeSetItem).toHaveBeenCalledTimes(1);
    expect(safeSetItem).toHaveBeenCalledWith(
      WATCHLIST_KEY,
      expect.arrayContaining([expect.objectContaining({ symbol: 'ETH' })])
    );
  });

  it('moveDown swaps with the next item and persists the new order', () => {
    seed();
    useWatchlistStore.getState().moveDown('ETH');
    expect(order()).toEqual(['BTC', 'SOL', 'ETH']);
    expect(safeSetItem).toHaveBeenCalledTimes(1);
  });

  it('moveUp is a no-op for the first item', () => {
    seed();
    useWatchlistStore.getState().moveUp('BTC');
    expect(order()).toEqual(['BTC', 'ETH', 'SOL']);
    expect(safeSetItem).not.toHaveBeenCalled();
  });

  it('moveDown is a no-op for the last item', () => {
    seed();
    useWatchlistStore.getState().moveDown('SOL');
    expect(order()).toEqual(['BTC', 'ETH', 'SOL']);
    expect(safeSetItem).not.toHaveBeenCalled();
  });

  it('moveUp and moveDown are no-ops for an unknown symbol', () => {
    seed();
    useWatchlistStore.getState().moveUp('DOGE');
    useWatchlistStore.getState().moveDown('DOGE');
    expect(order()).toEqual(['BTC', 'ETH', 'SOL']);
    expect(safeSetItem).not.toHaveBeenCalled();
  });

  it('matches the symbol case-insensitively', () => {
    seed();
    useWatchlistStore.getState().moveDown('btc');
    expect(order()).toEqual(['ETH', 'BTC', 'SOL']);
  });

  it('reorders a legacy lowercase entry in place, keeping its stored spelling', () => {
    // Defensive: hydrate normalization may not have run yet. Reordering must
    // still find the item without rewriting its symbol.
    useWatchlistStore.setState({
      items: [
        { symbol: 'btc', name: 'Bitcoin', addedAt: '2024-01-01' },
        { symbol: 'ETH', name: 'Ethereum', addedAt: '2024-01-02' },
      ],
      hydrated: true,
    });
    useWatchlistStore.getState().moveDown('BTC');
    expect(order()).toEqual(['ETH', 'btc']);
  });

  it('preserves the relative order of the untouched items', () => {
    useWatchlistStore.setState({
      items: [
        { symbol: 'BTC', name: 'Bitcoin', addedAt: '2024-01-01' },
        { symbol: 'ETH', name: 'Ethereum', addedAt: '2024-01-02' },
        { symbol: 'SOL', name: 'Solana', addedAt: '2024-01-03' },
        { symbol: 'ADA', name: 'Cardano', addedAt: '2024-01-04' },
      ],
      hydrated: true,
    });
    useWatchlistStore.getState().moveUp('SOL');
    expect(order()).toEqual(['BTC', 'SOL', 'ETH', 'ADA']);
  });
});
