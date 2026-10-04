"""TTL=0 must mean "never cache", not "fall back to the 30 minute default".

`int(getattr(settings, "screener_universe_cache_ttl_minutes", None) or 30)` treated
a configured 0 as falsy, so an operator asking for no caching silently got a
30 minute cache - the opposite of the intent.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from src.binance_universe import clear_universe_cache, resolve_screener_universe


def _settings(**overrides: Any) -> SimpleNamespace:
    base: dict[str, Any] = {
        "symbols": ["BTC/USDT", "ETH/USDT"],
        "include_stablecoins": False,
        "screener_universe_mode": "top_futures_volume",
        "screener_max_symbols": 100,
        "screener_universe_cache_ttl_minutes": 30,
        "screener_symbols": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def _clear_cache():
    clear_universe_cache()
    yield
    clear_universe_cache()


def test_zero_ttl_refetches_instead_of_using_the_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    """Regression: TTL=0 used to become 30 and serve a stale universe."""
    fetch = MagicMock(return_value=["BTC/USDT:USDT", "ETH/USDT:USDT"])
    monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

    settings = _settings(screener_universe_cache_ttl_minutes=0)
    first = resolve_screener_universe(settings, now=1000.0)
    second = resolve_screener_universe(settings, now=1000.0)  # same instant

    assert first.cache_hit is False
    assert second.cache_hit is False, "TTL=0 must never report a cache hit"
    assert fetch.call_count == 2, "TTL=0 must hit the resolver on every cycle"


def test_positive_ttl_still_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    fetch = MagicMock(return_value=["BTC/USDT:USDT", "ETH/USDT:USDT"])
    monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

    settings = _settings(screener_universe_cache_ttl_minutes=30)
    resolve_screener_universe(settings, now=1000.0)
    second = resolve_screener_universe(settings, now=1000.0 + 60)

    assert second.cache_hit is True
    assert fetch.call_count == 1


def test_positive_ttl_expires_once_the_window_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    fetch = MagicMock(return_value=["BTC/USDT:USDT", "ETH/USDT:USDT"])
    monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

    settings = _settings(screener_universe_cache_ttl_minutes=30)
    resolve_screener_universe(settings, now=1000.0)
    after = resolve_screener_universe(settings, now=1000.0 + 31 * 60)

    assert after.cache_hit is False
    assert fetch.call_count == 2


def test_missing_ttl_attribute_still_defaults_to_thirty(monkeypatch: pytest.MonkeyPatch) -> None:
    """`None` (attribute absent) keeps the documented 30 minute default."""
    fetch = MagicMock(return_value=["BTC/USDT:USDT", "ETH/USDT:USDT"])
    monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

    settings = _settings()
    del settings.screener_universe_cache_ttl_minutes

    resolve_screener_universe(settings, now=1000.0)
    second = resolve_screener_universe(settings, now=1000.0 + 60)

    assert second.cache_hit is True
    assert fetch.call_count == 1
