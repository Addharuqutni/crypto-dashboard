'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Candle, ChartTimeframe } from '@/types/chart';
import { getCoinBySymbol } from '@/lib/registry/coin-registry';

/**
 * Real-time kline stream for a single (symbol, timeframe).
 *
 * Subscribes to Binance USDⓈ-M Futures
 *   wss://fstream.binance.com/ws/{symbol}@kline_{interval}
 * and patches the existing TanStack Query cache for
 *   ['candles-raw', symbol, timeframe]
 * directly. The candlestick chart's effect 2 detects last-bar mutation and
 * calls `series.update()` instead of `setData()`, so the chart animates
 * smoothly with no full-redraw blink.
 *
 * Robustness rules:
 *   - Generation counter blocks stray callbacks from stale connections,
 *     preventing the StrictMode double-mount reconnect storm.
 *   - Handlers are detached before close so a delayed `onclose` from a
 *     dead socket cannot trigger an unwanted reconnect.
 *   - Stale watchdog forces reconnect if no message arrives within 15s.
 *   - `visibilitychange` and `online` events trigger an immediate resync.
 *   - On every (re)connect, the React Query cache is invalidated so REST
 *     refills the gap if WS dropped any ticks.
 *   - Cache writes are throttled to ~250ms; closed bars flush immediately.
 *   - Hook degrades silently — if WS fails entirely, the existing 60s REST
 *     polling still keeps the chart correct.
 */

const BINANCE_WS_BASE = 'wss://fstream.binance.com/ws';

const WRITE_THROTTLE_MS = 250;
const STALE_WATCHDOG_MS = 15_000;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10_000;
const RECONNECT_JITTER_MAX = 400;

/**
 * Maximum candles kept in the cache after live appends.
 *
 * Matches `MAX_INDICATOR_CANDLES` in the coin detail page so live appending
 * never starves indicators of context. Bounded so the buffer doesn't grow
 * unbounded for users who leave the page open for hours.
 */
const MAX_HISTORY = 1000;

/**
 * Wait this long after a successful open before declaring the connection
 * “stable” and resetting the retry counter. Prevents tight reconnect loops
 * when a provider cycles between brief opens and immediate drops.
 */
const RETRY_RESET_GRACE_MS = 5000;

/** Map our `ChartTimeframe` to the Binance kline interval string. */
const KLINE_INTERVAL_MAP: Record<ChartTimeframe, string> = {
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1h',
  '4H': '4h',
  '24H': '1d',
  '7D': '1w',
  '30D': '1M',
};

interface BinanceKlineEvent {
  e: 'kline';
  E: number;
  s: string;
  k: {
    t: number;
    T: number;
    s: string;
    i: string;
    f: number;
    L: number;
    o: string;
    c: string;
    h: string;
    l: string;
    v: string;
    n: number;
    x: boolean;
    q: string;
    V: string;
    Q: string;
    B: string;
  };
}

interface UseBinanceKlineWebSocketArgs {
  /** Internal symbol (e.g. "BTC"). */
  symbol: string;
  timeframe: ChartTimeframe;
  /** When false, the hook stays disconnected. */
  enabled?: boolean;
}

/**
 * Subscribe to Binance Futures kline stream and patch the React Query cache
 * for the matching `['candles-raw', symbol, timeframe]` query in place.
 */
export function useBinanceKlineWebSocket({
  symbol,
  timeframe,
  enabled = true,
}: UseBinanceKlineWebSocketArgs): void {
  const queryClient = useQueryClient();

  // Generation token: every effect run gets a fresh number. All async callbacks
  // capture the token at creation time and bail out when it goes stale.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled || !symbol) return;

    const generation = ++generationRef.current;
    /**
     * Mengecek apakah kondisi is stale terpenuhi.
     * Mengembalikan boolean agar aturan validasi tetap eksplisit dan mudah dibaca.
     */
    const isStale = () => generationRef.current !== generation;

    const coin = getCoinBySymbol(symbol);
    const binanceSymbol = (coin?.binanceSymbol ?? `${symbol}USDT`).toLowerCase();
    const interval = KLINE_INTERVAL_MAP[timeframe];
    if (!interval) return;

    const queryKey = ['candles-raw', symbol, timeframe] as const;
    const url = `${BINANCE_WS_BASE}/${binanceSymbol}@kline_${interval}`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const stableTimers: ReturnType<typeof setTimeout>[] = [];
    let pending: Candle | null = null;
    let lastWriteAt = 0;
    let retryCount = 0;
    let openedAtLeastOnce = false;

    /**

     * Menjalankan logic clear timer.

     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

     */

    const clearTimer = (t: ReturnType<typeof setTimeout> | null) => {
      if (t) clearTimeout(t);
    };

    /** Apply the most recent pending candle to the React Query cache. */
    const applyPending = () => {
      if (isStale()) return;
      const next = pending;
      if (!next) return;
      pending = null;
      lastWriteAt = Date.now();

      queryClient.setQueryData<Candle[] | undefined>(queryKey, (existing) => {
        if (!existing || existing.length === 0) return existing;

        const lastIdx = existing.length - 1;
        const last = existing[lastIdx]!;

        if (next.openTime === last.openTime) {
          // In-progress candle — replace last bar in place.
          const updated = existing.slice();
          updated[lastIdx] = next;
          return updated;
        }
        if (next.openTime > last.openTime) {
          // New interval opened — append. Trim oldest if buffer grows.
          const appended = [...existing, next];
          return appended.length > MAX_HISTORY ? appended.slice(-MAX_HISTORY) : appended;
        }
        // Out-of-order or stale event — ignore.
        return existing;
      });
    };

    /** Throttled cache write. */
    const scheduleApply = () => {
      if (isStale()) return;
      const elapsed = Date.now() - lastWriteAt;
      if (elapsed >= WRITE_THROTTLE_MS) {
        applyPending();
        return;
      }
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        applyPending();
      }, WRITE_THROTTLE_MS - elapsed);
    };

    /** Reset the stale watchdog. Forces reconnect if no message in 15s. */
    const armWatchdog = () => {
      clearTimer(staleTimer);
      staleTimer = setTimeout(() => {
        if (isStale()) return;
        // No message for too long — assume stalled connection and reconnect.
        forceReconnect();
      }, STALE_WATCHDOG_MS);
    };

    /** Detach all handlers and close the socket safely. */
    const teardownSocket = () => {
      const dying = ws;
      ws = null;
      if (!dying) return;
      // Detach BEFORE close so a delayed onclose cannot trigger reconnect.
      dying.onopen = null;
      dying.onmessage = null;
      dying.onerror = null;
      dying.onclose = null;
      try {
        dying.close();
      } catch {
        // ignore
      }
    };

    /** Capped exponential backoff with jitter. */
    const scheduleReconnect = () => {
      if (isStale()) return;
      clearTimer(reconnectTimer);
      const base = Math.min(
        INITIAL_RECONNECT_DELAY * Math.pow(2, retryCount),
        MAX_RECONNECT_DELAY
      );
      const jitter = Math.random() * RECONNECT_JITTER_MAX;
      retryCount += 1;
      reconnectTimer = setTimeout(() => {
        if (!isStale()) connect();
      }, base + jitter);
    };

    /** Hard reconnect — close current socket and reconnect immediately. */
    const forceReconnect = () => {
      if (isStale()) return;
      teardownSocket();
      // Note: we do NOT reset retryCount here. If onopen succeeds and the
      // connection stabilises, the grace timer in `connect` will reset it.
      // Resetting eagerly here would bypass backoff in flap loops.
      connect();
    };

    /**

     * Menjalankan logic connect.

     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.

     */

    const connect = () => {
      if (isStale()) return;
      teardownSocket();

      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      const myWs = ws;

      myWs.onopen = () => {
        if (isStale() || ws !== myWs) return;
        armWatchdog();
        // Only reset retry counter once we've stayed open for the grace
        // period; protects against flapping providers that briefly accept
        // a connection then drop it.
        const stableTimer = setTimeout(() => {
          if (isStale() || ws !== myWs) return;
          retryCount = 0;
        }, RETRY_RESET_GRACE_MS);
        // Track for cleanup on disconnect / teardown.
        stableTimers.push(stableTimer);
        // On every successful (re)connect, invalidate the matching query so
        // REST refills any gap WS may have missed during downtime.
        if (openedAtLeastOnce) {
          queryClient.invalidateQueries({ queryKey, exact: true });
        }
        openedAtLeastOnce = true;
      };

      myWs.onmessage = (event) => {
        if (isStale() || ws !== myWs) return;
        armWatchdog();

        let raw: BinanceKlineEvent;
        try {
          raw = JSON.parse(event.data as string) as BinanceKlineEvent;
        } catch {
          return;
        }
        if (!raw || raw.e !== 'kline' || !raw.k) return;

        const k = raw.k;
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const close = parseFloat(k.c);
        const volume = parseFloat(k.v);
        if (
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close) ||
          !Number.isFinite(volume)
        ) {
          return;
        }

        pending = {
          symbol,
          binanceSymbol: raw.s,
          openTime: k.t,
          open,
          high,
          low,
          close,
          volume,
          closeTime: k.T,
        };

        if (k.x) applyPending();
        else scheduleApply();
      };

      myWs.onerror = () => {
        // Close handler will run reconnection.
      };

      myWs.onclose = () => {
        if (isStale() || ws !== myWs) return;
        ws = null;
        scheduleReconnect();
      };
    };

    /** Resume on tab return / network online. */
    const handleResume = () => {
      if (isStale()) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      // Force a fresh connection on resume to recover from silent stalls.
      forceReconnect();
    };
    /**
     * Menjalankan logic handle online.
     * Dipakai untuk memisahkan tanggung jawab fungsi ini dari bagian aplikasi lain.
     */
    const handleOnline = () => {
      if (isStale()) return;
      forceReconnect();
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
    }

    connect();

    return () => {
      // Bumping the generation invalidates every captured callback.
      generationRef.current += 1;
      clearTimer(reconnectTimer);
      clearTimer(staleTimer);
      clearTimer(flushTimer);
      // Cancel any pending stability timers so they can't reset retryCount
      // after teardown.
      for (const t of stableTimers) clearTimeout(t);
      stableTimers.length = 0;
      reconnectTimer = null;
      staleTimer = null;
      flushTimer = null;
      pending = null;
      teardownSocket();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
      }
    };
  }, [symbol, timeframe, enabled, queryClient]);
}
