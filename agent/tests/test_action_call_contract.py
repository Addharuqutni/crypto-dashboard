"""Contract tests for the action-call builder.

`build_action_call` is the gate between an analysis and a tradeable signal: it
decides whether a setup becomes a LONG/SHORT action at all. These tests pin the
rejection rules and the READY vs WAIT_CONFIRMATION status split.
"""

from __future__ import annotations

from src.action_call import ACTION_SIGNALS, action_call_to_dict, build_action_call, format_action_call
from src.analyzer import AnalysisResult


def _result(**overrides) -> AnalysisResult:
    base = dict(
        symbol="BTC/USDT",
        timeframe="5m",
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
        resistance=110.0,
        fibonacci={},
        order_block=None,
        liquidity_sweep=None,
        stop_loss=95.0,
        take_profit=110.0,
        risk_reward=2.0,
        reasons=[],
    )
    base.update(overrides)
    return AnalysisResult(**base)


# --- rejection rules ---------------------------------------------------------


def test_unmapped_signal_produces_no_action_call():
    """HOLD and unknown signals must never become a trade."""
    assert build_action_call(_result(signal="HOLD")) is None
    assert build_action_call(_result(signal="SOMETHING ELSE")) is None


def test_risk_reward_below_one_is_rejected():
    assert build_action_call(_result(risk_reward=0.99)) is None
    assert build_action_call(_result(risk_reward=0.0)) is None


def test_risk_reward_exactly_one_is_accepted():
    call = build_action_call(_result(risk_reward=1.0))

    assert call is not None
    assert call.risk_reward == 1.0


def test_missing_risk_reward_is_accepted():
    """`None` means 'not computed', which is weaker than 'below 1.0'."""
    call = build_action_call(_result(risk_reward=None))

    assert call is not None
    assert call.risk_reward is None


def test_missing_price_stop_or_target_is_rejected():
    assert build_action_call(_result(price=None)) is None
    assert build_action_call(_result(stop_loss=None)) is None
    assert build_action_call(_result(take_profit=None)) is None


# --- direction ---------------------------------------------------------------


def test_bullish_and_bearish_signals_map_to_long_and_short():
    long_call = build_action_call(_result(signal="BULLISH CONTINUATION"))
    short_call = build_action_call(_result(signal="SELL WATCH"))

    assert long_call.action == "LONG"
    assert short_call.action == "SHORT"


def test_every_mapped_signal_has_a_direction():
    for signal in ACTION_SIGNALS:
        assert build_action_call(_result(signal=signal)) is not None, signal


# --- status ------------------------------------------------------------------


def test_watch_signals_wait_for_confirmation():
    for signal in ("BUY WATCH", "SELL WATCH"):
        call = build_action_call(_result(signal=signal))
        assert call.status == "WAIT_CONFIRMATION", signal


def test_non_watch_signals_are_ready_immediately():
    for signal in ("BULLISH CONTINUATION", "BEARISH CONTINUATION", "BULLISH TREND FOLLOW"):
        call = build_action_call(_result(signal=signal))
        assert call.status == "READY", signal


# --- passthrough -------------------------------------------------------------


def test_realtime_price_is_carried_through_untouched():
    call = build_action_call(_result(), realtime_price=123.5)

    assert call.realtime_price == 123.5
    assert call.entry_price == 100.0


def test_action_call_to_dict_keeps_the_public_keys():
    payload = action_call_to_dict(_result(signal="BUY WATCH"))

    assert payload == {
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "action": "LONG",
        "signal": "BUY WATCH",
        "entry_price": 100.0,
        "realtime_price": None,
        "take_profit": 110.0,
        "stop_loss": 95.0,
        "risk_reward": 2.0,
        "status": "WAIT_CONFIRMATION",
    }


def test_serialisation_helpers_return_none_for_rejected_setups():
    assert action_call_to_dict(_result(signal="HOLD")) is None
    assert format_action_call(_result(signal="HOLD")) == "Action Call: None"


def test_format_action_call_renders_the_accepted_setup():
    text = format_action_call(_result())

    assert "Action: LONG" in text
    assert "Status: READY" in text
    assert "Stop Loss: 95.0" in text
