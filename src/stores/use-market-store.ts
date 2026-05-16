import { create } from 'zustand';
import type { LivePrice, ConnectionStatus } from '@/types/market';

/** Status of the exchangeInfo symbol validation registry. */
export type ValidSymbolsStatus = 'idle' | 'loading' | 'ready' | 'failed';

interface MarketState {
  /** Map of symbol -> live price data (keyed by internal symbol e.g. "BTC") */
  prices: Record<string, LivePrice>;
  /** Map of binanceSymbol -> live price data (keyed by Binance pair e.g. "BTCUSDT") */
  pricesByBinanceSymbol: Record<string, LivePrice>;
  /** Set of valid Binance Futures perpetual USDT symbols from exchangeInfo */
  validSymbols: Set<string>;
  /** Status of validSymbols loading from exchangeInfo */
  validSymbolsStatus: ValidSymbolsStatus;
  /** WebSocket connection status */
  connectionStatus: ConnectionStatus;
  /** Timestamp of last received price update */
  lastUpdateAt: number | null;
  /** Total number of tracked symbols */
  trackedSymbolCount: number;

  /** Update a single price entry from WebSocket event */
  updatePrice: (price: LivePrice) => void;
  /** Batch update multiple prices — optimized for all-market stream */
  updatePrices: (prices: LivePrice[]) => void;
  /** Set connection status */
  setConnectionStatus: (status: ConnectionStatus) => void;
  /** Get price by Binance symbol (e.g. "BTCUSDT") */
  getPriceByBinanceSymbol: (binanceSymbol: string) => LivePrice | undefined;
  /** Set valid symbols from exchangeInfo — called once at app init */
  setValidSymbols: (symbols: Set<string>) => void;
  /** Set the loading status of validSymbols */
  setValidSymbolsStatus: (status: ValidSymbolsStatus) => void;
  /** Check if a binanceSymbol is a valid Futures perpetual pair */
  isValidSymbol: (binanceSymbol: string) => boolean;
}

/**
 * Market store — manages live price data and WebSocket connection status.
 * Optimized for high-frequency batch updates from Binance all-market stream.
 * Maintains dual index (by symbol and by binanceSymbol) for fast lookups.
 * Uses validSymbols set from exchangeInfo to filter only active perpetual pairs.
 */
export const useMarketStore = create<MarketState>((set, get) => ({
  prices: {},
  pricesByBinanceSymbol: {},
  validSymbols: new Set(),
  validSymbolsStatus: 'idle',
  connectionStatus: 'disconnected',
  lastUpdateAt: null,
  trackedSymbolCount: 0,

  updatePrice: (price) =>
    set((state) => {
      const isNewSymbol = !(price.symbol in state.prices);
      return {
        prices: { ...state.prices, [price.symbol]: price },
        pricesByBinanceSymbol: { ...state.pricesByBinanceSymbol, [price.binanceSymbol]: price },
        lastUpdateAt: price.receivedAt,
        // Increment only when seeing a new symbol — avoids O(n) Object.keys per tick.
        trackedSymbolCount: state.trackedSymbolCount + (isNewSymbol ? 1 : 0),
      };
    }),

  updatePrices: (prices) =>
    set((state) => {
      const updatedPrices = { ...state.prices };
      const updatedByBinance = { ...state.pricesByBinanceSymbol };
      let latestTime = state.lastUpdateAt ?? 0;
      let added = 0;

      for (const price of prices) {
        if (!(price.symbol in updatedPrices)) added++;
        updatedPrices[price.symbol] = price;
        updatedByBinance[price.binanceSymbol] = price;
        if (price.receivedAt > latestTime) {
          latestTime = price.receivedAt;
        }
      }

      return {
        prices: updatedPrices,
        pricesByBinanceSymbol: updatedByBinance,
        lastUpdateAt: latestTime,
        // Track new symbols incrementally; avoids O(n) Object.keys per batch
        // (a hot path with ~400 perpetuals updating ~4 ×/sec).
        trackedSymbolCount: state.trackedSymbolCount + added,
      };
    }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  getPriceByBinanceSymbol: (binanceSymbol) => get().pricesByBinanceSymbol[binanceSymbol],

  setValidSymbols: (symbols) => set({ validSymbols: symbols, validSymbolsStatus: 'ready' }),

  setValidSymbolsStatus: (status) => set({ validSymbolsStatus: status }),

  isValidSymbol: (binanceSymbol) => {
    const { validSymbols, validSymbolsStatus } = get();
    // If not loaded yet or failed, allow all (degraded mode — don't block data)
    if (validSymbolsStatus !== 'ready') return true;
    return validSymbols.has(binanceSymbol);
  },
}));
