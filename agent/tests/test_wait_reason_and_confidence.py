"""The WAIT path must say WHY, and must not flatten every setup to one number.

Two regressions motivated these tests, both measured on the live universe
(99 symbols):

1. `_wait_reason` returned a single generic sentence for every row, so all 99
   carried "No READY multi-timeframe action call." A flat market and a setup
   aligned across 1h/4h/15m/30m with ADX 30+ were indistinguishable to a reader.

2. `_confidence_from_analysis(actionable=False)` clamped the score to 55 and the
   WAIT branch hardcoded `signalGrade: "D"`. Every row therefore read
   "confidence 55 / grade D" — 99 of 99 — and the clamp protected nothing,
   because `evaluate_alerts()` skips `action == "WAIT"` before it consults
   quality at all.
"""

from __future__ import annotations

import time

import pytest

from src.analyzer import AnalysisResult
from src.signal_service import (
    _confidence_from_analysis,
    _data_health_confidence_cap,
    _grade_from_confidence,
    _wait_reason,
)

HEALTHY_CLOSE_MS = int(time.time() * 1000) - 60_000


def _result(**overrides) -> AnalysisResult:
    base = dict(
        symbol="BTC/USDT",
        timeframe="5m",
        price=100.0,
        trend="UPTREND",
        regime="TRENDING",
        signal="HOLD",
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
        stop_loss=None,
        take_profit=None,
        risk_reward=None,
        reasons=[],
        candle_count=300,
        last_candle_close_ms=HEALTHY_CLOSE_MS,
    )
    base.update(overrides)
    return AnalysisResult(**base)


class TestWaitReasonNamesTheGate:
    def test_reports_low_risk_reward_with_the_number(self):
        reason = _wait_reason(_result(signal="BULLISH TREND FOLLOW", risk_reward=0.24))

        assert "0.24" in reason
        assert "risk" in reason.lower()

    def test_reports_confirmation_disagreement(self):
        reason = _wait_reason(
            _result(
                reasons=[
                    "Trend aligned: True",
                    "Confirmation 15m/30m: 15m:NEUTRAL/RANGING, 30m:BULLISH/TRENDING",
                    "15m/30m aligned with trend: False",
                ]
            )
        )

        assert "15m/30m" in reason
        assert "disagree" in reason.lower()

    def test_reports_trend_disagreement(self):
        reason = _wait_reason(_result(reasons=["Trend aligned: False"]))

        assert "1h and 4h" in reason

    def test_reports_that_trend_is_aligned_but_entry_has_not_triggered(self):
        """The case that was invisible before: everything agrees, 5m has not fired."""
        reason = _wait_reason(
            _result(
                reasons=[
                    "Trend aligned: True",
                    "15m/30m aligned with trend: True",
                    "No aligned 5m entry setup",
                ]
            )
        )

        assert "5m entry trigger" in reason
        assert "agree" in reason.lower()

    def test_falls_back_to_a_generic_line_only_when_nothing_specific_applies(self):
        reason = _wait_reason(_result(reasons=[]))

        assert reason
        assert "No entry condition met" in reason

    def test_every_reason_is_non_empty(self):
        for reasons in ([], ["Trend aligned: False"], ["No aligned 5m entry setup"]):
            assert _wait_reason(_result(reasons=reasons)).strip()


class TestConfidenceIsNotCollapsed:
    def test_strong_aligned_setup_scores_above_the_old_55_clamp(self):
        """The old clamp made this indistinguishable from a dead market."""
        strong = _confidence_from_analysis(_result(regime="TRENDING", bias="BULLISH", adx=30, risk_reward=2.0))

        assert strong > 55, f"aligned setup scored {strong}, the collapsed value"

    def test_confidence_spreads_across_distinct_setups(self):
        flat = _confidence_from_analysis(_result(regime="RANGING", bias="NEUTRAL", adx=10))
        aligned = _confidence_from_analysis(_result(regime="TRENDING", bias="BULLISH", adx=30))

        assert aligned > flat, "a trend-aligned setup must outrank a flat one"

    def test_stale_feed_still_capped_by_data_health(self):
        stale = _result(candle_count=10)

        assert _confidence_from_analysis(stale) <= 60

    def test_cap_helper_agrees_with_the_reported_confidence_cap(self):
        """The drawer renders confidenceCap; it must be the budget actually applied."""
        from src.signal_service import _healthy_data

        healthy = _result()
        stale = _result(candle_count=10)

        assert _data_health_confidence_cap(healthy) == _healthy_data(healthy)["confidenceCap"]
        assert _data_health_confidence_cap(stale) == _healthy_data(stale)["confidenceCap"]

    def test_never_exceeds_one_hundred(self):
        best = _result(
            regime="TRENDING",
            bias="BULLISH",
            adx=40,
            risk_reward=5.0,
            signal="MTF BULLISH ACTION CALL",
        )

        assert _confidence_from_analysis(best) <= 100


class TestGradeMatchesConfidence:
    """The WAIT branch hardcoded "D", contradicting the confidence beside it."""

    @pytest.mark.parametrize("confidence", [40, 45, 55, 60, 75, 85])
    def test_grade_never_contradicts_its_own_scale(self, confidence):
        grade = _grade_from_confidence(confidence, None)
        expected = "D" if confidence < 45 else "C" if confidence < 60 else "B" if confidence < 75 else "A"

        assert grade == expected, f"confidence {confidence} graded {grade}"

    def test_a_wait_row_can_grade_above_d_when_its_setup_is_strong(self):
        """Regression: WAIT rows were pinned to D regardless of their score."""
        strong_wait = _result(regime="TRENDING", bias="BULLISH", adx=30)
        confidence = _confidence_from_analysis(strong_wait)

        assert _grade_from_confidence(confidence, None) != "D"

    def test_the_wait_payload_carries_the_computed_grade_not_a_hardcoded_d(self):
        """Exercise the real branch.

        The test above only checks `_grade_from_confidence` in isolation, so it
        passes even while `_to_dashboard_signal` hardcodes "D" in the WAIT
        payload. Verified with a negative control: reintroducing the hardcode
        left that test green. This one reads the payload the UI actually gets.
        """
        from src.signal_service import _to_dashboard_signal

        payload = _to_dashboard_signal(_result(regime="TRENDING", bias="BULLISH", adx=30), None)

        assert payload["action"] == "WAIT"
        assert payload["signalGrade"] != "D", (
            f"WAIT payload still pinned to D (confidence {payload['confidenceScore']})"
        )
        assert payload["signalGrade"] == _grade_from_confidence(payload["confidenceScore"], None)

    def test_the_wait_payload_confidence_matches_the_scorer(self):
        from src.signal_service import _to_dashboard_signal

        result = _result(regime="TRENDING", bias="BULLISH", adx=30)
        payload = _to_dashboard_signal(result, None)

        assert payload["confidenceScore"] == _confidence_from_analysis(result)

    def test_the_wait_payload_reports_the_specific_blocker(self):
        """The generic sentence must not come back for a row that names its gate."""
        from src.signal_service import _to_dashboard_signal

        result = _result(reasons=["Trend aligned: True", "No aligned 5m entry setup"])
        payload = _to_dashboard_signal(result, None)

        assert "5m entry trigger" in payload["primaryNoTradeReason"]
        assert payload["noTradeReasons"] == [payload["primaryNoTradeReason"]]
