from __future__ import annotations

import threading
import time

import ccxt
import pandas as pd

_CLIENT_CACHE: dict[str, "MarketDataClient"] = {}
_CLIENT_LOCK = threading.Lock()

# One dropped request used to silently drop a symbol from the screener cycle.
# Transient faults retry with exponential backoff; deterministic client errors
# (BadSymbol, AuthenticationError) raise immediately - retrying cannot help.
RETRY_MAX_ATTEMPTS = 3
RETRY_BASE_DELAY_SEC = 0.5
RETRY_MAX_DELAY_SEC = 30.0
RETRY_MAX_HONORED_AFTER_SEC = 60.0

# NetworkError covers DNS/reset/timeout; RateLimitExceeded is its subclass and
# carries Binance's Retry-After hint.
_RETRYABLE_ERRORS = (ccxt.NetworkError, ccxt.RateLimitExceeded)


def _retry_after_seconds(error: BaseException) -> float | None:
    """Read a server-provided Retry-After hint, if the transport exposed one."""
    for attribute in ("retry_after", "retryAfter"):
        raw = getattr(error, attribute, None)
        if raw is None:
            continue
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if value >= 0:
            return min(value, RETRY_MAX_HONORED_AFTER_SEC)
    return None


def _fetch_with_retry(fetch, *, sleep=time.sleep):
    """Call `fetch`, retrying transient exchange errors with exponential backoff.

    Stops after RETRY_MAX_ATTEMPTS and re-raises the last error unchanged, so
    callers see the original ccxt exception type.
    """
    delay = RETRY_BASE_DELAY_SEC
    for attempt in range(1, RETRY_MAX_ATTEMPTS + 1):
        try:
            return fetch()
        except _RETRYABLE_ERRORS as error:
            if attempt >= RETRY_MAX_ATTEMPTS:
                raise
            wait = _retry_after_seconds(error)
            if wait is None:
                wait = delay
                delay = min(delay * 2, RETRY_MAX_DELAY_SEC)
            sleep(wait)


def get_market_data_client(exchange_name: str = "binance") -> "MarketDataClient":
    """Return a cached MarketDataClient to avoid repeated load_markets()."""
    with _CLIENT_LOCK:
        if exchange_name not in _CLIENT_CACHE:
            _CLIENT_CACHE[exchange_name] = MarketDataClient(exchange_name)
        return _CLIENT_CACHE[exchange_name]


class MarketDataClient:
    """Thin ccxt wrapper with retry and a request gate.

    WHY the gate: `run_screener` evaluates symbols on a thread pool, and every
    worker shares the one cached instance returned by `get_market_data_client`.
    ccxt's own rate limiter is not thread-safe - `fetch2` calls `throttle()`
    (which only reads `lastRestRequestTimestamp`) and assigns that timestamp
    *after* the call, so N concurrent threads all read the same stale value and
    sail through without waiting. Measured: 3 threads, 3 bypasses. Holding this
    lock across each request restores the interval ccxt intends and serialises
    the shared mutable state on the exchange object (`lastRestRequestTimestamp`,
    `last_request_*`, the session). Concurrency still pays off because the
    screener spends most of its wall-clock in indicator math, not in this lock.
    """

    def __init__(self, exchange_name: str = "binance"):
        if not hasattr(ccxt, exchange_name):
            raise ValueError(f"Exchange tidak didukung: {exchange_name}")
        exchange_class = getattr(ccxt, exchange_name)
        self.exchange = exchange_class({"enableRateLimit": True, "timeout": 30000})
        self.exchange.load_markets()
        self._request_lock = threading.Lock()

    def fetch_ticker_price(self, symbol: str) -> float:
        if symbol not in self.exchange.markets:
            raise ValueError(f"Symbol tidak tersedia di {self.exchange.id}: {symbol}")
        with self._request_lock:
            ticker = self.exchange.fetch_ticker(symbol)
        price = self._extract_price(ticker)
        if price is None:
            raise ValueError(f"Realtime price tidak tersedia untuk {symbol}")
        return price

    def fetch_ticker_prices(self, symbols: list[str]) -> dict[str, float]:
        """Bulk fetch realtime prices using fetch_tickers when supported."""
        if not symbols:
            return {}

        unique_symbols = sorted({symbol for symbol in symbols if symbol in self.exchange.markets})
        if not unique_symbols:
            return {}

        prices: dict[str, float] = {}
        if self.exchange.has.get("fetchTickers"):
            try:
                with self._request_lock:
                    tickers = self.exchange.fetch_tickers(unique_symbols)
                for symbol, ticker in tickers.items():
                    price = self._extract_price(ticker)
                    if price is not None:
                        prices[symbol] = price
                if prices:
                    return prices
            except Exception:
                prices = {}

        for symbol in unique_symbols:
            try:
                prices[symbol] = self.fetch_ticker_price(symbol)
            except Exception:
                continue
        return prices

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 250, *, sleep=time.sleep) -> pd.DataFrame:
        if symbol not in self.exchange.markets:
            raise ValueError(f"Symbol tidak tersedia di {self.exchange.id}: {symbol}")

        if timeframe not in self.exchange.timeframes:
            valid_timeframes = ", ".join(self.exchange.timeframes.keys())
            raise ValueError(f"Timeframe tidak tersedia di {self.exchange.id}: {timeframe}. Pilihan: {valid_timeframes}")

        rows = _fetch_with_retry(
            lambda: self._fetch_ohlcv_gated(symbol, timeframe, limit),
            sleep=sleep,
        )
        if not rows:
            raise ValueError(f"Data OHLCV kosong untuk {symbol} {timeframe}")

        df = pd.DataFrame(
            rows,
            columns=["timestamp", "open", "high", "low", "close", "volume"],
        )
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)

        numeric_columns = ["open", "high", "low", "close", "volume"]
        df[numeric_columns] = df[numeric_columns].apply(pd.to_numeric, errors="coerce")
        df = df.dropna(subset=numeric_columns).reset_index(drop=True)
        if df.empty:
            raise ValueError(f"Data OHLCV tidak valid untuk {symbol} {timeframe}")
        return df

    def _fetch_ohlcv_gated(self, symbol: str, timeframe: str, limit: int) -> list[list[float]]:
        """One request under the gate.

        Deliberately NOT held across the retry backoff in `_fetch_with_retry`:
        a sleeping thread would otherwise block every other symbol behind a
        backoff it has no part in. Each attempt re-acquires the gate, so
        requests from different symbols still interleave.
        """
        with self._request_lock:
            return self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    @staticmethod
    def _extract_price(ticker: dict) -> float | None:
        for key in ("last", "close", "bid", "ask"):
            value = ticker.get(key)
            if value is not None:
                try:
                    return float(value)
                except (TypeError, ValueError):
                    continue
        return None
