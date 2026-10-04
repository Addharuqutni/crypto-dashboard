"""fetch_ohlcv must survive transient exchange failures without retrying hard errors.

One dropped request used to silently remove a symbol from the screener for that
cycle. Transient faults (network blips, 429/418 rate limits, 5xx) retry with
exponential backoff; deterministic 4xx (bad symbol, auth) fail fast.
"""

from __future__ import annotations

import ccxt
import pandas as pd
import pytest

from src.data import MarketDataClient

ROWS = [[1_700_000_000_000, 100.0, 101.0, 99.0, 100.5, 10.0] for _ in range(3)]


class FakeExchange:
    """Minimal stand-in for ccxt.binance that scripts a sequence of outcomes."""

    id = "binance"
    timeframes = {"5m": "5m"}

    def __init__(self, outcomes):
        self._outcomes = list(outcomes)
        self.calls: list[dict] = []
        self.markets = {"BTC/USDT": {}}

    def fetch_ohlcv(self, symbol, timeframe=None, limit=None, **kwargs):
        self.calls.append({"symbol": symbol, "timeframe": timeframe, "limit": limit})
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    @property
    def call_count(self) -> int:
        return len(self.calls)


def _client(outcomes) -> tuple[MarketDataClient, FakeExchange]:
    exchange = FakeExchange(outcomes)
    client = MarketDataClient.__new__(MarketDataClient)  # skip load_markets()
    client.exchange = exchange
    return client, exchange


def _fetch(client, sleep=None):
    """Call fetch_ohlcv with backoff sleeps captured instead of actually slept."""
    return client.fetch_ohlcv("BTC/USDT", "5m", 250, sleep=sleep or (lambda _: None))


def test_fetch_ohlcv_returns_the_frame_on_the_first_try():
    client, exchange = _client([ROWS])

    df = _fetch(client)

    assert list(df.columns) == ["timestamp", "open", "high", "low", "close", "volume"]
    assert len(df) == 3
    assert exchange.call_count == 1


def test_fetch_ohlcv_retries_a_network_error_then_succeeds():
    client, exchange = _client([ccxt.NetworkError("connection reset"), ROWS])

    df = _fetch(client)

    assert len(df) == 3
    assert exchange.call_count == 2


def test_fetch_ohlcv_retries_a_rate_limit_then_succeeds():
    client, exchange = _client([ccxt.RateLimitExceeded("429"), ROWS])

    df = _fetch(client)

    assert len(df) == 3
    assert exchange.call_count == 2


def test_fetch_ohlcv_gives_up_after_max_attempts_and_reraises():
    client, exchange = _client([ccxt.NetworkError("down")] * 5)

    with pytest.raises(ccxt.NetworkError):
        _fetch(client)

    assert exchange.call_count == 3, "must stop after 3 attempts"


def test_fetch_ohlcv_does_not_retry_a_bad_symbol():
    client, exchange = _client([ccxt.BadSymbol("invalid symbol")] * 5)

    with pytest.raises(ccxt.BadSymbol):
        _fetch(client)

    assert exchange.call_count == 1, "4xx client errors are deterministic - fail fast"


def test_fetch_ohlcv_does_not_retry_an_authentication_error():
    client, exchange = _client([ccxt.AuthenticationError("bad key")] * 5)

    with pytest.raises(ccxt.AuthenticationError):
        _fetch(client)

    assert exchange.call_count == 1


def test_fetch_ohlcv_backs_off_exponentially():
    sleeps: list[float] = []
    client, _ = _client([ccxt.NetworkError("a"), ccxt.NetworkError("b"), ROWS])

    _fetch(client, sleep=sleeps.append)

    assert len(sleeps) == 2
    assert sleeps[1] > sleeps[0], "delay must grow between attempts"
    assert sleeps[0] > 0


def test_fetch_ohlcv_honours_retry_after_on_a_rate_limit():
    sleeps: list[float] = []
    error = ccxt.RateLimitExceeded("429 slow down")
    error.retry_after = 7
    client, _ = _client([error, ROWS])

    _fetch(client, sleep=sleeps.append)

    assert sleeps == [7.0], "server-provided Retry-After wins over local backoff"


def test_fetch_ohlcv_clamps_an_absurd_retry_after():
    sleeps: list[float] = []
    error = ccxt.RateLimitExceeded("429")
    error.retry_after = 10_000
    client, _ = _client([error, ROWS])

    _fetch(client, sleep=sleeps.append)

    assert sleeps and sleeps[0] <= 60, "a hostile Retry-After must not stall the screener"


def test_fetch_ohlcv_rejects_unknown_symbol_before_any_request():
    client, exchange = _client([ROWS] * 3)

    with pytest.raises(ValueError):
        client.fetch_ohlcv("NOPE/USDT", "5m", 250, sleep=lambda _: None)

    assert exchange.call_count == 0