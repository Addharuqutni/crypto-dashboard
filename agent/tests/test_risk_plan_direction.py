"""Risk-plan levels must follow the SIGNAL direction, never `bias`.

`ACTION_SIGNALS` maps BUY WATCH -> LONG and SELL WATCH -> SHORT, but the old
`calculate_risk_plan` picked the SL/TP side from `bias`. A BUY WATCH printed
inside a bearish bias therefore produced stop_loss > entry > take_profit.
These tests lock the invariant for every (bias x signal direction) pair.
"""

from __future__ import annotations

import pandas as pd
import pytest

from src.analyzer import analyze, calculate_risk_plan
from src.config import load_strategy_config

ROWS = 30
BASE_HIGH = 105.0
BASE_LOW = 95.0
BASE_CLOSE = 100.0

EMA_STACK = {
    "BULLISH": (105.0, 102.0, 99.0),   # ema_fast > ema_mid > ema_slow
    "BEARISH": (95.0, 98.0, 101.0),    # ema_fast < ema_mid < ema_slow
}
DM_STACK = {"BULLISH": (25.0, 10.0), "BEARISH": (10.0, 25.0)}  # dmp, dmn

# (low, high, close) of the newest candle. Must sit outside the flat base range
# (95..105) so detect_liquidity_sweep can classify it.
SWEEP_CANDLE = {
    "SELL_SIDE_LIQUIDITY_SWEEP": (90.0, 104.0, 100.5),
    "BUY_SIDE_LIQUIDITY_SWEEP": (96.0, 110.0, 99.5),
    None: (BASE_LOW, BASE_HIGH, BASE_CLOSE),
}

# prev macd, prev macd_signal, latest macd, latest macd_signal
MACD = {
    "bullish": (0.5, 1.0, 1.5, 1.0),
    "bearish": (1.0, 0.5, 0.5, 1.0),
}


def _make_df(*, bias: str, sweep: str | None, cross: str) -> pd.DataFrame:
    start = pd.Timestamp("2024-01-01", tz="UTC")
    rows = [
        {
            "timestamp": start + pd.Timedelta(5 * index, unit="min"),
            "open": BASE_CLOSE,
            "high": BASE_HIGH,
            "low": BASE_LOW,
            "close": BASE_CLOSE,
            "volume": 1.0,
        }
        for index in range(ROWS)
    ]

    ema_fast, ema_mid, ema_slow = EMA_STACK[bias]
    dmp, dmn = DM_STACK[bias]
    prev_macd, prev_signal, last_macd, last_signal = MACD[cross]

    rows[-2].update(macd=prev_macd, macd_signal=prev_signal)
    rows[-1].update(macd=last_macd, macd_signal=last_signal)

    low, high, close = SWEEP_CANDLE[sweep]
    rows[-1].update(low=low, high=high, close=close, open=close)

    df = pd.DataFrame(rows)
    # Only the two newest rows drive the signal, but flat indicator values
    # elsewhere keep the frame self-consistent for the helper scans.
    df["ema_fast"] = ema_fast
    df["ema_mid"] = ema_mid
    df["ema_slow"] = ema_slow
    df["dmp"] = dmp
    df["dmn"] = dmn
    df["rsi"] = 55.0
    df["atr"] = 2.0
    df["adx"] = 30.0  # >= adx_trend_threshold -> TRENDING
    return df


def _analyze(**kwargs):
    return analyze("BTC/USDT", "5m", _make_df(**kwargs), load_strategy_config())


def _assert_long_plan(result) -> None:
    assert result.stop_loss is not None and result.take_profit is not None
    assert result.stop_loss < result.price < result.take_profit, (
        f"LONG must satisfy SL < entry < TP, got {result.stop_loss} / {result.price} / {result.take_profit}"
    )
    assert result.risk_reward > 0


def _assert_short_plan(result) -> None:
    assert result.stop_loss is not None and result.take_profit is not None
    assert result.take_profit < result.price < result.stop_loss, (
        f"SHORT must satisfy TP < entry < SL, got {result.take_profit} / {result.price} / {result.stop_loss}"
    )
    assert result.risk_reward > 0


def test_bias_bullish_with_bullish_continuation_is_a_long_plan():
    result = _analyze(bias="BULLISH", sweep=None, cross="bullish")

    assert result.signal == "BULLISH CONTINUATION"
    assert result.bias == "BULLISH"
    _assert_long_plan(result)


def test_bias_bearish_with_bearish_continuation_is_a_short_plan():
    result = _analyze(bias="BEARISH", sweep=None, cross="bearish")

    assert result.signal == "BEARISH CONTINUATION"
    assert result.bias == "BEARISH"
    _assert_short_plan(result)


def test_bias_bearish_with_buy_watch_still_builds_a_long_plan():
    """Regression: BUY WATCH used to print SHORT levels under a bearish bias."""
    result = _analyze(bias="BEARISH", sweep="SELL_SIDE_LIQUIDITY_SWEEP", cross="bullish")

    assert result.signal == "BUY WATCH"
    assert result.bias == "BEARISH"
    _assert_long_plan(result)


def test_bias_bullish_with_sell_watch_still_builds_a_short_plan():
    """Regression: SELL WATCH used to print LONG levels under a bullish bias."""
    result = _analyze(bias="BULLISH", sweep="BUY_SIDE_LIQUIDITY_SWEEP", cross="bearish")

    assert result.signal == "SELL WATCH"
    assert result.bias == "BULLISH"
    _assert_short_plan(result)


@pytest.mark.parametrize("direction", ["LONG", "SHORT"])
def test_calculate_risk_plan_holds_the_direction_invariant(direction):
    """Only `direction` shapes the plan - market bias is no longer an input."""
    price, support, resistance, atr = 100.0, 95.0, 105.0, 2.0

    stop_loss, take_profit, risk_reward = calculate_risk_plan(price, support, resistance, direction, atr)

    assert risk_reward > 0
    if direction == "LONG":
        assert stop_loss < price < take_profit
    else:
        assert take_profit < price < stop_loss


def test_calculate_risk_plan_returns_no_plan_when_structure_leaves_no_room():
    """A LONG at the window high has no upside structure: refuse rather than invent a target."""
    assert calculate_risk_plan(100.0, 95.0, 100.0, "LONG", 2.0) == (None, None, None)
    assert calculate_risk_plan(100.0, 100.0, 105.0, "SHORT", 2.0) == (None, None, None)


def test_calculate_risk_plan_returns_nothing_without_a_direction():
    assert calculate_risk_plan(100.0, 95.0, 105.0, None, 2.0) == (None, None, None)