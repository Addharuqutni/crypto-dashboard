'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { searchCoins, getCoinBySymbol } from '@/lib/shared/registry/coin-registry';
import { useMarketStore } from '@/stores/use-market-store';
import { formatCurrency, formatPercentage } from '@/lib/shared/formatting';
import { cn } from '@/lib/shared/utils';

/** Max results shown in dropdown to keep it performant. */
const MAX_RESULTS = 12;

/** Debounce delay for search to avoid filtering 200+ items on every keystroke. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Unified search result combining registry metadata and live price.
 */
interface SearchResult {
  symbol: string;
  name: string;
  binanceSymbol: string;
  price?: number;
  priceChangePercent24h?: number;
  /** Whether this coin exists in the static registry (has richer metadata). */
  isRegistryCoin: boolean;
}

/**
 * Global search component — searches coins from three sources:
 * 1. Static registry (has name, coingeckoId, metadata)
 * 2. Live prices in the store (200+ Futures coins from WebSocket)
 * 3. validSymbols from exchangeInfo (coins known but not yet priced)
 *
 * Keyboard accessible: ArrowUp/Down to navigate, Enter to select, Escape to close.
 */
export function SearchCoin() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const prices = useMarketStore((s) => s.prices);
  const validSymbols = useMarketStore((s) => s.validSymbols);

  /** Debounce search query. */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  /**
   * Search across registry, live store prices, AND validSymbols.
   * Priority: registry > live prices > validSymbols (no price yet).
   */
  const results: SearchResult[] = useMemo(() => {
    if (!debouncedQuery.trim()) return [];

    const q = debouncedQuery.trim().toLowerCase();
    const seen = new Set<string>();
    const output: SearchResult[] = [];

    // 1. Search from registry (has name, coingeckoId, detail page)
    const registryResults = searchCoins(debouncedQuery);
    for (const coin of registryResults) {
      if (output.length >= MAX_RESULTS) break;
      seen.add(coin.symbol);

      const livePrice = prices[coin.symbol];
      output.push({
        symbol: coin.symbol,
        name: coin.name,
        binanceSymbol: coin.binanceSymbol,
        price: livePrice?.price,
        priceChangePercent24h: livePrice?.priceChangePercent24h,
        isRegistryCoin: true,
      });
    }

    // 2. Search from live store prices (coins not in registry)
    if (output.length < MAX_RESULTS) {
      const allPrices = Object.values(prices);
      for (const price of allPrices) {
        if (output.length >= MAX_RESULTS) break;
        if (seen.has(price.symbol)) continue;

        const symbolMatch = price.symbol.toLowerCase().includes(q);
        const binanceMatch = price.binanceSymbol.toLowerCase().includes(q);

        if (symbolMatch || binanceMatch) {
          seen.add(price.symbol);
          const registryCoin = getCoinBySymbol(price.symbol);

          output.push({
            symbol: price.symbol,
            name: registryCoin?.name ?? price.symbol,
            binanceSymbol: price.binanceSymbol,
            price: price.price,
            priceChangePercent24h: price.priceChangePercent24h,
            isRegistryCoin: !!registryCoin,
          });
        }
      }
    }

    // 3. Search from validSymbols (coins known from exchangeInfo but not yet priced)
    if (output.length < MAX_RESULTS && validSymbols.size > 0) {
      for (const binanceSymbol of validSymbols) {
        if (output.length >= MAX_RESULTS) break;

        // Derive internal symbol from binanceSymbol (e.g. "BTCUSDT" -> "BTC")
        const symbol = binanceSymbol.replace(/USDT$/, '');
        if (seen.has(symbol)) continue;

        const symbolMatch = symbol.toLowerCase().includes(q);
        const binanceMatch = binanceSymbol.toLowerCase().includes(q);

        if (symbolMatch || binanceMatch) {
          seen.add(symbol);
          const registryCoin = getCoinBySymbol(symbol);

          output.push({
            symbol,
            name: registryCoin?.name ?? symbol,
            binanceSymbol,
            price: undefined,
            priceChangePercent24h: undefined,
            isRegistryCoin: !!registryCoin,
          });
        }
      }
    }

    return output;
  }, [debouncedQuery, prices, validSymbols]);

  /** Navigate to coin detail page. */
  const selectResult = useCallback(
    (result: SearchResult) => {
      setQuery('');
      setIsOpen(false);
      setActiveIndex(-1);
      router.push(`/coin/${result.symbol.toLowerCase()}`);
    },
    [router]
  );

  /** Handle keyboard navigation */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'Escape') {
        setQuery('');
        setIsOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          selectResult(results[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  /** Open dropdown when query has content and input is focused. */
  useEffect(() => {
    if (debouncedQuery.trim().length > 0) {
      setIsOpen(true);
      setActiveIndex(-1);
    } else {
      setIsOpen(false);
    }
  }, [debouncedQuery]);

  /** Close dropdown on outside click */
  useEffect(() => {
    /**
     * Menjalankan logic handle click outside.
     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
     */
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  /** Scroll active item into view */
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => debouncedQuery.trim() && setIsOpen(true)}
          placeholder="Search coin..."
          className={cn(
            'h-9 w-full rounded-lg border border-border-subtle bg-bg-surface-raised pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted',
            'transition-colors focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-focus-ring/30'
          )}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="search-results"
          aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
          aria-label="Search cryptocurrency by name or symbol"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-dropdown mt-1 overflow-hidden rounded-lg border border-border-subtle bg-bg-surface-raised shadow-elev-2">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-text-muted">
              No coins found for &ldquo;{debouncedQuery}&rdquo;
            </div>
          ) : (
            <ul
              ref={listRef}
              id="search-results"
              role="listbox"
              className="max-h-80 overflow-y-auto py-1"
            >
              {results.map((result, index) => (
                <li
                  key={result.binanceSymbol}
                  id={`search-result-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => selectResult(result)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                    index === activeIndex
                      ? 'bg-bg-surface-soft text-text-primary'
                      : 'text-text-secondary hover:bg-bg-surface-soft'
                  )}
                >
                  {/* Coin icon placeholder */}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-surface text-xs font-bold text-accent-primary">
                    {result.symbol.slice(0, 2)}
                  </span>

                  {/* Name + Symbol */}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-text-primary">{result.name}</span>
                    <span className="text-xs text-text-muted">{result.symbol}/USDT</span>
                  </div>

                  {/* Live Price + Change */}
                  {result.price != null ? (
                    <div className="flex flex-col items-end">
                      <span className="numeric text-xs font-medium text-text-primary">
                        {formatCurrency(result.price)}
                      </span>
                      {result.priceChangePercent24h != null && (
                        <PriceChangeBadge value={result.priceChangePercent24h} />
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] text-text-muted">—</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Compact price change indicator for search results. */
function PriceChangeBadge({ value }: { value: number }) {
  const isUp = value > 0;
  const isDown = value < 0;

  return (
    <span
      className={cn(
        'numeric inline-flex items-center gap-0.5 text-[10px] font-medium',
        isUp && 'text-market-up',
        isDown && 'text-market-down',
        !isUp && !isDown && 'text-market-neutral'
      )}
    >
      {isUp && <TrendingUp className="h-2.5 w-2.5" />}
      {isDown && <TrendingDown className="h-2.5 w-2.5" />}
      {!isUp && !isDown && <Minus className="h-2.5 w-2.5" />}
      {formatPercentage(value)}
    </span>
  );
}
