import type { LivePrice } from '@/types/market';
import type {
  BinanceMiniTickerEvent,
  BinanceRestTickerItem,
} from './binance-futures-types';

/**
 * Type guard: validates that a raw WebSocket payload is a valid mini ticker event.
 * Prevents malformed data from entering the store and crashing UI components.
 */
export function isMiniTickerEvent(value: unknown): value is BinanceMiniTickerEvent {
  if (!value || typeof value !== 'object') return false;

  const item = value as Partial<BinanceMiniTickerEvent>;

  return (
    item.e === '24hrMiniTicker' &&
    typeof item.E === 'number' &&
    typeof item.s === 'string' &&
    typeof item.c === 'string' &&
    typeof item.o === 'string'
  );
}

/**
 * Normalizes a Binance Futures WebSocket mini ticker event into internal LivePrice model.
 * Calculates 24h change percent from open/close prices.
 * Returns null for invalid numeric payloads.
 */
export function normalizeMiniTicker(event: BinanceMiniTickerEvent): LivePrice | null {
  const closePrice = Number(event.c);
  const openPrice = Number(event.o);

  if (!Number.isFinite(closePrice) || !Number.isFinite(openPrice)) {
    return null;
  }

  // Derive symbol from Binance pair by stripping USDT suffix
  const symbol = event.s.endsWith('USDT')
    ? event.s.slice(0, -4)
    : event.s;

  const priceChangePercent24h =
    openPrice > 0 ? ((closePrice - openPrice) / openPrice) * 100 : undefined;

  return {
    symbol,
    binanceSymbol: event.s,
    price: closePrice,
    priceChangePercent24h,
    eventTime: event.E,
    receivedAt: Date.now(),
    source: 'binance',
  };
}

/**
 * Normalizes a Binance Futures REST 24hr ticker item into internal LivePrice model.
 * Uses priceChangePercent provided directly by the Futures API.
 * Returns null for invalid numeric payloads.
 */
export function normalizeRestTicker(item: BinanceRestTickerItem): LivePrice | null {
  const closePrice = parseFloat(item.lastPrice);
  if (!Number.isFinite(closePrice)) return null;

  const priceChangePercent24h = parseFloat(item.priceChangePercent);

  // Derive symbol from Binance pair by stripping USDT suffix
  const symbol = item.symbol.endsWith('USDT')
    ? item.symbol.slice(0, -4)
    : item.symbol;

  return {
    symbol,
    binanceSymbol: item.symbol,
    price: closePrice,
    priceChangePercent24h: Number.isFinite(priceChangePercent24h)
      ? priceChangePercent24h
      : undefined,
    eventTime: item.closeTime,
    receivedAt: Date.now(),
    source: 'binance',
  };
}

/**
 * Batch normalizes an array of mini ticker events.
 * Filters out null results from invalid payloads.
 * Used for !miniTicker@arr stream which sends arrays.
 */
export function normalizeMiniTickerBatch(events: unknown[]): LivePrice[] {
  const results: LivePrice[] = [];

  for (const event of events) {
    if (isMiniTickerEvent(event)) {
      const normalized = normalizeMiniTicker(event);
      if (normalized) {
        results.push(normalized);
      }
    }
  }

  return results;
}
