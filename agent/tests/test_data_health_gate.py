"""`_healthy_data` must report real candle data, not a hardcoded "all healthy".

The old implementation returned candleCount=250 / ageSec=0 / fresh=True for every
symbol, so `data_health_ok` in the screener engine was always True and stale or
truncated candles still produced alerts.
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.analyzer import analyze
from src.config import load_strategy_config
from src.signal_service import _healthy_data

NOW_MS = 1_700_000_000_000
MIN_CANDLES = 50


def _result(*, candle_count: int, last_close_ms: int | None, timeframe: str = "5m"):
    """Build a minimal AnalysisResult carrying only the fields health reads."""
    from src.analyzer import AnalysisResult

    base = dict(
        symbol="BTC/USDT",
        timeframe=timeframe,
        price=100.0,
        trend="UPTREND",
        regime="TRENDING",
        signal="BULLISH CONTINUATION",
        bias="BULLISH",
        rsi=55.0,
        macd=0.1,
        atr=1.0,
        adx=30.0,
        support=95.0,
        resistance=105.0,
        fibonacci={},
        order_block=None,
        liquidity_sweep=None,
        stop_loss=95.0,
        take_profit=105.0,
        risk_reward=2.0,
        reasons=[],
        candle_count=candle_count,
        last_candle_close_ms=last_close_ms,
    )
    return AnalysisResult(**base)


def _fresh(**overrides):
    return _result(candle_count=250, last_close_ms=NOW_MS - 60_000, **overrides)


def test_healthy_data_reports_real_candle_count_and_age():
    health = _healthy_data(_fresh(), now_ms=NOW_MS)

    assert health["setup"]["candleCount"] == 250
    assert health["setup"]["ageSec"] == 60
    assert health["setup"]["fresh"] is True
    assert health["setup"]["ok"] is True
    assert health["ok"] is True


def test_healthy_data_fails_closed_when_the_last_candle_is_stale():
    # 6 hours old on a 5m setup series: far beyond any sane freshness budget.
    health = _healthy_data(_result(candle_count=250, last_close_ms=NOW_MS - 6 * 3600_000), now_ms=NOW_MS)

    assert health["setup"]["ageSec"] == 6 * 3600
    assert health["setup"]["fresh"] is False
    assert health["setup"]["ok"] is False
    assert health["ok"] is False
    assert any("stale" in reason.lower() or "age" in reason.lower() for reason in health["reasons"])


def test_healthy_data_fails_closed_when_there_are_too_few_candles():
    health = _healthy_data(_result(candle_count=10, last_close_ms=NOW_MS - 30_000), now_ms=NOW_MS)

    assert health["setup"]["ok"] is False
    assert health["ok"] is False
    assert health["setup"]["reason"]


def test_healthy_data_fails_closed_when_the_candle_timestamp_is_missing():
    health = _healthy_data(_result(candle_count=250, last_close_ms=None), now_ms=NOW_MS)

    assert health["setup"]["ok"] is False
    assert health["ok"] is False


def test_healthy_data_applies_a_freshness_budget_per_timeframe():
    # Same 4h-old data: stale on 5m, still acceptable on 4h.
    stale_ms = NOW_MS - 4 * 3600_000

    short_tf = _healthy_data(_result(candle_count=250, last_close_ms=stale_ms, timeframe="5m"), now_ms=NOW_MS)
    macro_tf = _healthy_data(_result(candle_count=250, last_close_ms=stale_ms, timeframe="4h"), now_ms=NOW_MS)

    assert short_tf["ok"] is False
    assert macro_tf["ok"] is True


def test_healthy_data_caps_confidence_when_unhealthy():
    fresh = _healthy_data(_fresh(), now_ms=NOW_MS)
    stale = _healthy_data(_result(candle_count=250, last_close_ms=NOW_MS - 6 * 3600_000), now_ms=NOW_MS)

    assert fresh["confidenceCap"] == 100
    assert stale["confidenceCap"] < 100


def test_healthy_data_respects_explicit_threshold_overrides():
    result = _result(candle_count=250, last_close_ms=NOW_MS - 300_000)  # 5 minutes old

    assert _healthy_data(result, now_ms=NOW_MS)["ok"] is True
    assert _healthy_data(result, now_ms=NOW_MS, max_age_sec=60)["ok"] is False


def test_analyze_records_the_real_candle_count_and_close_time():
    """The health gate can only be real if the analysis carries the raw data."""
    rows = [
        {
            "timestamp": pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(5 * index, unit="min"),
            "open": 100.0,
            "high": 101.0,
            "low": 99.0,
            "close": 100.0,
            "volume": 1.0,
            "ema_fast": 105.0,
            "ema_mid": 102.0,
            "ema_slow": 99.0,
            "rsi": 55.0,
            "atr": 1.5,
            "adx": 30.0,
            "dmp": 25.0,
            "dmn": 10.0,
            "macd": 1.0,
            "macd_signal": 0.5,
        }
        for index in range(60)
    ]
    df = pd.DataFrame(rows)
    # Force the bullish MACD crossover on the final candle.
    df.loc[df.index[-1], ["macd", "macd_signal"]] = [1.5, 1.0]
    df.loc[df.index[-2], ["macd", "macd_signal"]] = [0.5, 1.0]

    result = analyze("BTC/USDT", "5m", df, load_strategy_config())

    assert result.candle_count == 60
    expected_close_ms = int(df["timestamp"].iloc[-1].timestamp() * 1000) + 5 * 60 * 1000
    assert result.last_candle_close_ms == expected_close_ms


@pytest.mark.parametrize("timeframe", ["5m", "15m", "30m", "1h", "4h"])
def test_healthy_data_supports_every_timeframe_the_engine_uses(timeframe):
    health = _healthy_data(_fresh(timeframe=timeframe), now_ms=NOW_MS)

    assert health["setup"]["ok"] is True
    assert health["setup"]["maxAgeSec"] > 0