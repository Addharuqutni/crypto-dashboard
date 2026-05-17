'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMarketStore } from '@/stores/use-market-store';
import { useWatchlistStore } from '@/stores/use-watchlist-store';
import { fetchAllTickerSnapshot, fetchFuturesSymbols } from '@/lib/binance/binance-futures-client';
import { normalizeMiniTickerBatch, normalizeMiniTicker, isMiniTickerEvent } from '@/lib/binance/binance-futures-normalizers';
import type { LivePrice } from '@/types/market';

/**
 * Binance USDⓈ-M Futures WebSocket stream base.
 * Uses perpetual contract pricing — higher liquidity and tighter spreads than spot.
 * @see https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams
 */
const BINANCE_WS_BASE = 'wss://fstream.binance.com/ws';

/** Max reconnect delay in ms (capped exponential backoff). */
const MAX_RECONNECT_DELAY = 10000;
/** Initial reconnect delay in ms. */
const INITIAL_RECONNECT_DELAY = 1000;
/** Jitter range added to reconnect delay to prevent thundering herd (ms). */
const RECONNECT_JITTER_MAX = 500;

/**
 * Proactive reconnect before Binance 24h disconnect.
 * Binance disconnects WebSocket after 24 hours.
 * We reconnect at 23h 50m to avoid unexpected drops.
 */
const MAX_CONNECTION_AGE_MS = 23 * 60 * 60 * 1000 + 50 * 60 * 1000;

/**
 * Stale watchdog timeout.
 * If no message received within this period, force reconnect.
 */
const STALE_WATCHDOG_TIMEOUT = 60_000;

/**
 * Batch update interval for all-market stream.
 * Collects incoming tickers and flushes to store periodically
 * to reduce re-renders when receiving hundreds of updates per second.
 */
const BATCH_FLUSH_INTERVAL = 100;

/**
 * REST snapshot resync interval.
 * WebSocket remains the primary realtime source; REST only fills gaps after
 * network/browser stalls without creating Binance REST rate-limit pressure.
 */
const SNAPSHOT_REFRESH_INTERVAL = 30_000;

/** Interval for checking whether an open socket has silently stopped delivering frames. */
const HEARTBEAT_CHECK_INTERVAL = 5_000;

/** Maximum age of the last received all-market frame before forcing reconnect. */
const MAX_SILENT_SOCKET_AGE_MS = 15_000;

/** Max retries for exchangeInfo before entering degraded mode. */
const EXCHANGE_INFO_MAX_RETRIES = 3;

/** Backoff base for exchangeInfo retries (ms). */
const EXCHANGE_INFO_RETRY_BASE = 2000;

/** Throttle interval for parse error warnings (ms). */
const PARSE_ERROR_LOG_INTERVAL = 30_000;

/**
 * Binance USDⓈ-M Futures WebSocket client hook.
 *
 * Subscribes to !miniTicker@arr (all market mini tickers) for broad coverage.
 * Handles:
 * - REST snapshot for initial price seeding
 * - All-market WebSocket stream for realtime updates
 * - Batch price updates to reduce re-renders
 * - Proactive 24h reconnect
 * - Stale message watchdog
 * - serverShutdown event handling
 * - Capped exponential backoff with jitter
 * - Retryable exchangeInfo loading with degraded mode fallback
 * - Throttled parse error observability
 */
export function useBinanceWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionAgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const batchFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const lastMessageAtRef = useRef(0);

  // Batch buffer for incoming ticker updates
  const batchBufferRef = useRef<Map<string, LivePrice>>(new Map());

  // Parse error throttle tracking
  const parseErrorCountRef = useRef(0);
  const lastParseErrorLogRef = useRef(0);

  // Refs for circular function dependencies (connect <-> reconnect <-> scheduleReconnect)
  const connectRef = useRef<() => void>(() => {});
  const reconnectRef = useRef<() => void>(() => {});
  const scheduleReconnectRef = useRef<() => void>(() => {});

  const updatePrices = useMarketStore((s) => s.updatePrices);
  const setConnectionStatus = useMarketStore((s) => s.setConnectionStatus);
  const setValidSymbols = useMarketStore((s) => s.setValidSymbols);
  const setValidSymbolsStatus = useMarketStore((s) => s.setValidSymbolsStatus);
  const isValidSymbol = useMarketStore((s) => s.isValidSymbol);
  const watchlistItems = useWatchlistStore((s) => s.items);

  /**
   * Flush accumulated batch buffer to the store.
   * Uses Map to deduplicate — only latest price per symbol is kept.
   */
  const flushBatch = useCallback(() => {
    const buffer = batchBufferRef.current;
    if (buffer.size === 0) return;

    const prices = Array.from(buffer.values());
    buffer.clear();

    if (mountedRef.current) {
      updatePrices(prices);
    }
  }, [updatePrices]);

  /**
   * Log parse errors with throttling to avoid console spam.
   * Accumulates count and logs summary every PARSE_ERROR_LOG_INTERVAL.
   */
  const logParseError = useCallback(() => {
    parseErrorCountRef.current += 1;
    const now = Date.now();

    if (now - lastParseErrorLogRef.current >= PARSE_ERROR_LOG_INTERVAL) {
      const count = parseErrorCountRef.current;
      console.warn(
        `[binance-ws] ${count} malformed message${count > 1 ? 's' : ''} in last ${PARSE_ERROR_LOG_INTERVAL / 1000}s`
      );
      parseErrorCountRef.current = 0;
      lastParseErrorLogRef.current = now;
    }
  }, []);

  /**
   * Reset the stale watchdog timer.
   * Called every time a message is received.
   */
  const resetStaleWatchdog = useCallback(() => {
    if (staleWatchdogRef.current) {
      clearTimeout(staleWatchdogRef.current);
    }

    staleWatchdogRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      console.warn('[binance-ws] No messages received for 60s. Reconnecting...');
      reconnectRef.current();
    }, STALE_WATCHDOG_TIMEOUT);
  }, []);

  /**
   * Schedule reconnection with capped exponential backoff + jitter.
   * Jitter prevents multiple clients from reconnecting simultaneously.
   */
  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const baseDelay = Math.min(
      INITIAL_RECONNECT_DELAY * Math.pow(2, retryCountRef.current),
      MAX_RECONNECT_DELAY
    );
    const jitter = Math.random() * RECONNECT_JITTER_MAX;
    const delay = baseDelay + jitter;

    retryCountRef.current += 1;
    setConnectionStatus('reconnecting');

    reconnectTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        connectRef.current();
      }
    }, delay);
  }, [setConnectionStatus]);

  /**
   * Connect to Binance Futures all-market mini ticker stream.
   * Uses !miniTicker@arr to receive updates for ALL perpetual USDT pairs.
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // All-market mini ticker stream — receives all Futures USDT pairs
    const url = `${BINANCE_WS_BASE}/!miniTicker@arr`;

    setConnectionStatus('reconnecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCountRef.current = 0;
        lastMessageAtRef.current = Date.now();
        setConnectionStatus('connected');

        // Schedule proactive reconnect before 24h limit
        if (connectionAgeTimeoutRef.current) {
          clearTimeout(connectionAgeTimeoutRef.current);
        }
        connectionAgeTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            console.info('[binance-ws] Proactive reconnect before 24h limit.');
            reconnectRef.current();
          }
        }, MAX_CONNECTION_AGE_MS);

        // Start stale watchdog
        resetStaleWatchdog();

        // Start batch flush interval
        if (batchFlushIntervalRef.current) {
          clearInterval(batchFlushIntervalRef.current);
        }
        batchFlushIntervalRef.current = setInterval(flushBatch, BATCH_FLUSH_INTERVAL);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        // Reset stale watchdog on every message and remember active delivery.
        lastMessageAtRef.current = Date.now();
        resetStaleWatchdog();

        try {
          const raw = JSON.parse(event.data as string);

          // Handle serverShutdown event
          if (raw && typeof raw === 'object' && raw.e === 'serverShutdown') {
            console.warn('[binance-ws] Server shutdown event received. Reconnecting...');
            reconnectRef.current();
            return;
          }

          // All-market stream sends an array of mini tickers
          if (Array.isArray(raw)) {
            const normalized = normalizeMiniTickerBatch(raw);
            for (const price of normalized) {
              // Only process valid perpetual USDT pairs from exchangeInfo
              if (isValidSymbol(price.binanceSymbol)) {
                batchBufferRef.current.set(price.binanceSymbol, price);
              }
            }
          } else if (isMiniTickerEvent(raw)) {
            // Single ticker (fallback for individual streams)
            const normalized = normalizeMiniTicker(raw);
            if (normalized && isValidSymbol(normalized.binanceSymbol)) {
              batchBufferRef.current.set(normalized.binanceSymbol, normalized);
            }
          }
        } catch {
          logParseError();
        }
      };

      ws.onerror = () => {
        // Error will trigger onclose, handle reconnect there
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
        setConnectionStatus('disconnected');
        scheduleReconnectRef.current();
      };
    } catch {
      setConnectionStatus('disconnected');
      scheduleReconnectRef.current();
    }
  }, [setConnectionStatus, flushBatch, resetStaleWatchdog, logParseError, isValidSymbol]);

  /**
   * Force reconnect — closes existing connection and opens a new one.
   */
  const reconnect = useCallback(() => {
    flushBatch();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connectRef.current();
  }, [flushBatch]);

  // Keep refs in sync with latest callback instances
  connectRef.current = connect;
  reconnectRef.current = reconnect;
  scheduleReconnectRef.current = scheduleReconnect;

  /**
   * Loads valid perpetual USDT symbols from Binance Futures exchangeInfo.
   * Retries with exponential backoff up to EXCHANGE_INFO_MAX_RETRIES times.
   * Sets explicit status so UI can show degraded mode on failure.
   */
  const loadValidSymbols = useCallback(async () => {
    setValidSymbolsStatus('loading');

    for (let attempt = 0; attempt < EXCHANGE_INFO_MAX_RETRIES; attempt++) {
      try {
        const symbols = await fetchFuturesSymbols();

        if (symbols.length > 0 && mountedRef.current) {
          const symbolSet = new Set(symbols.map((s) => s.symbol));
          setValidSymbols(symbolSet);
          return;
        }

        // Empty response — might be transient, retry
        if (attempt < EXCHANGE_INFO_MAX_RETRIES - 1) {
          await sleep(EXCHANGE_INFO_RETRY_BASE * Math.pow(2, attempt));
          continue;
        }
      } catch {
        if (attempt < EXCHANGE_INFO_MAX_RETRIES - 1) {
          await sleep(EXCHANGE_INFO_RETRY_BASE * Math.pow(2, attempt));
          continue;
        }
      }
    }

    // All retries exhausted — enter degraded mode
    if (mountedRef.current) {
      setValidSymbolsStatus('failed');
      console.warn(
        '[binance-ws] Failed to load exchangeInfo after retries. Running in degraded mode (all symbols accepted).'
      );
    }
  }, [setValidSymbols, setValidSymbolsStatus]);

  /**
   * Seeds the price store with a REST snapshot before WebSocket messages arrive.
   * Fetches ALL Futures tickers so the UI has data immediately on load.
   * Filters against validSymbols if loaded.
   */
  const seedInitialPrices = useCallback(async () => {
    try {
      const snapshot = await fetchAllTickerSnapshot();
      if (snapshot.length > 0 && mountedRef.current) {
        // Filter snapshot against valid symbols
        const filtered = snapshot.filter((p) => isValidSymbol(p.binanceSymbol));
        updatePrices(filtered);
      }
    } catch {
      // REST snapshot failure is non-critical — WebSocket will provide data
      console.warn('[binance-ws] REST snapshot failed. WebSocket will provide live data.');
    }
  }, [updatePrices, isValidSymbol]);

  /**
   * Refreshes REST snapshot and nudges the WebSocket after browser resume.
   * Production browsers can suspend timers/sockets in background tabs; this
   * prevents the dashboard from looking frozen until the user refreshes.
   */
  const refreshAfterResume = useCallback(() => {
    if (!mountedRef.current || isDocumentHidden()) return;

    void seedInitialPrices();

    const socket = wsRef.current;
    const isSocketOpen = socket?.readyState === WebSocket.OPEN;
    const silentFor = Date.now() - lastMessageAtRef.current;

    if (!isSocketOpen || silentFor > MAX_SILENT_SOCKET_AGE_MS) {
      reconnectRef.current();
    }
  }, [seedInitialPrices]);

  /** Initialize: load valid symbols, seed prices, connect WebSocket */
  useEffect(() => {
    mountedRef.current = true;

    // Load valid symbols first, then seed prices and connect
    void loadValidSymbols().then(() => {
      if (mountedRef.current) {
        void seedInitialPrices();
        connectRef.current();

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (!mountedRef.current || !isDocumentVisible()) return;
          const socket = wsRef.current;
          const silentFor = Date.now() - lastMessageAtRef.current;
          if (socket?.readyState === WebSocket.OPEN && silentFor > MAX_SILENT_SOCKET_AGE_MS) {
            console.warn('[binance-ws] Open socket is silent. Reconnecting...');
            reconnectRef.current();
          }
        }, HEARTBEAT_CHECK_INTERVAL);

        if (snapshotRefreshIntervalRef.current) {
          clearInterval(snapshotRefreshIntervalRef.current);
        }
        snapshotRefreshIntervalRef.current = setInterval(() => {
          if (mountedRef.current && isDocumentVisible()) {
            void seedInitialPrices();
          }
        }, SNAPSHOT_REFRESH_INTERVAL);
      }
    });

    window.addEventListener('online', refreshAfterResume);
    document.addEventListener('visibilitychange', refreshAfterResume);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('online', refreshAfterResume);
      document.removeEventListener('visibilitychange', refreshAfterResume);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (connectionAgeTimeoutRef.current) {
        clearTimeout(connectionAgeTimeoutRef.current);
      }
      if (staleWatchdogRef.current) {
        clearTimeout(staleWatchdogRef.current);
      }
      if (batchFlushIntervalRef.current) {
        clearInterval(batchFlushIntervalRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (snapshotRefreshIntervalRef.current) {
        clearInterval(snapshotRefreshIntervalRef.current);
      }
      flushBatch();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  // The market socket is intentionally mounted once. Mutable refs keep the
  // latest callbacks/configuration available without recreating the connection
  // on every store or callback identity change, which would cause reconnect
  // storms under React StrictMode and high-frequency ticker updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-seed when watchlist changes (to get snapshot for newly added coins)
  useEffect(() => {
    if (watchlistItems.length > 0) {
      void seedInitialPrices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistItems]);
}

/** Returns true when the browser tab is visible, and defaults to true outside the DOM. */
function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/** Returns true only when the browser explicitly reports a hidden tab. */
function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/** Simple sleep utility for backoff delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
