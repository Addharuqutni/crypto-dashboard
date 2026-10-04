"""rankingScore must reflect setup quality, not confidence alone.

`ranking_score = round(confidence, 2)` made the secondary sort keys in
`_assign_ranks` unreachable: two candidates with identical confidence always
tied, so risk/reward, regime and ADX never influenced the ordering.
"""

from __future__ import annotations

import math

from src.screener.engine import _assign_ranks, _to_candidate


def _payload(
    *,
    symbol: str = "BTC/USDT",
    confidence: int = 85,
    risk_reward: float | None = 2.0,
    regime: str = "bullish_trend",
    adx: float | None = 30.0,
    alignment: int = 90,
    action: str = "LONG",
    permission: str = "long_only",
    grade: str = "A",
):
    return {
        "ok": True,
        "symbol": symbol,
        "analysis": {"price": 100.0, "adx": adx, "regime": "TRENDING"},
        "actionCall": {
            "action": action,
            "entry_price": 100.0,
            "stop_loss": 95.0,
            "take_profit": 110.0,
            "risk_reward": risk_reward,
        },
        "signal": {
            "action": action,
            "confidence": confidence,
            "confidenceScore": confidence,
            "grade": grade,
            "signalGrade": grade,
            "entryZone": {"min": 100.0, "max": 100.0},
            "stopLoss": 95.0,
            "takeProfits": {"tp1": 110.0, "tp2": None, "tp3": None},
            "riskRewardRatio": risk_reward,
            "marketRegime": regime,
            "tradePermission": permission,
            "mtfAlignmentScore": alignment,
            "reasons": [],
            "noTradeReasons": [] if action != "WAIT" else ["no setup"],
            "warnings": [],
            "dataHealth": {
                "ok": True,
                "reasons": [],
                "symbol": {"provided": True, "valid": True, "reason": None},
                "setup": {"candleCount": 250, "minRequired": 50, "ageSec": 60, "maxAgeSec": 3600, "fresh": True},
                "macro": {"candleCount": 250, "minRequired": 50, "ageSec": 120, "maxAgeSec": 14400, "fresh": True},
                "trigger": {"candleCount": 250, "minRequired": 50, "ageSec": 30, "maxAgeSec": 1800, "fresh": True},
            },
        },
    }


def _candidate(**kwargs):
    kwargs.setdefault("symbol", "BTC/USDT")
    row = _to_candidate(_payload(**kwargs), evaluated_at=1_700_000_060_000, rank=1)
    return row


def test_equal_confidence_different_risk_reward_ranks_differently():
    """The core regression: same confidence used to mean an identical score."""
    good_rr = _candidate(symbol="AAA/USDT", risk_reward=3.0)
    poor_rr = _candidate(symbol="BBB/USDT", risk_reward=1.5)

    assert good_rr["confidence"] == poor_rr["confidence"]
    assert good_rr["rankingScore"] > poor_rr["rankingScore"]

    ranked = _assign_ranks([poor_rr, good_rr])
    assert ranked[0]["symbol"] == "AAA/USDT"
    assert ranked[0]["rank"] == 1
    assert ranked[1]["symbol"] == "BBB/USDT"
    assert ranked[1]["rank"] == 2


def test_equal_confidence_different_regime_ranks_differently():
    trending = _candidate(symbol="AAA/USDT", regime="bullish_trend")
    ranging = _candidate(symbol="BBB/USDT", regime="range")

    assert trending["confidence"] == ranging["confidence"]
    assert trending["rankingScore"] > ranging["rankingScore"]


def test_equal_confidence_different_adx_ranks_differently():
    strong = _candidate(symbol="AAA/USDT", adx=45.0)
    weak = _candidate(symbol="BBB/USDT", adx=12.0)

    assert strong["confidence"] == weak["confidence"]
    assert strong["rankingScore"] > weak["rankingScore"]


def test_equal_confidence_different_alignment_ranks_differently():
    aligned = _candidate(symbol="AAA/USDT", alignment=95)
    conflicted = _candidate(symbol="BBB/USDT", alignment=40)

    assert aligned["confidence"] == conflicted["confidence"]
    assert aligned["rankingScore"] > conflicted["rankingScore"]


def test_ranking_is_deterministic_and_input_order_independent():
    rows = [
        _candidate(symbol="CCC/USDT", risk_reward=2.0),
        _candidate(symbol="AAA/USDT", risk_reward=3.0),
        _candidate(symbol="BBB/USDT", risk_reward=1.5),
    ]

    forward = [row["symbol"] for row in _assign_ranks(list(rows))]
    reverse = [row["symbol"] for row in _assign_ranks(list(reversed(rows)))]

    assert forward == ["AAA/USDT", "CCC/USDT", "BBB/USDT"]
    assert forward == reverse


def test_identical_setups_tie_broken_deterministically():
    rows = [_candidate(symbol=symbol, risk_reward=2.0) for symbol in ("ZZZ/USDT", "AAA/USDT", "MMM/USDT")]

    ranked = _assign_ranks(rows)

    assert [row["symbol"] for row in ranked] == ["AAA/USDT", "MMM/USDT", "ZZZ/USDT"]


def test_ranking_score_stays_in_range_and_exposes_its_breakdown():
    row = _candidate(confidence=100, risk_reward=5.0, adx=60.0, alignment=100, regime="bullish_trend")

    assert 0.0 <= row["rankingScore"] <= 100.0
    assert isinstance(row["rankingScore"], float)
    breakdown = row["rankingBreakdown"]
    assert set(breakdown) == {"confidence", "riskReward", "trendStrength", "regime", "alignment"}
    assert abs(row["rankingScore"] - sum(breakdown.values())) < 0.01


def test_unknown_regime_is_not_rewarded_over_a_real_trend():
    unknown = _candidate(symbol="AAA/USDT", regime="unknown")
    trending = _candidate(symbol="BBB/USDT", regime="bullish_trend")

    assert trending["rankingScore"] > unknown["rankingScore"]


def test_missing_risk_reward_scores_below_a_defined_plan():
    missing = _candidate(symbol="AAA/USDT", risk_reward=None)
    defined = _candidate(symbol="BBB/USDT", risk_reward=2.0)

    assert defined["rankingScore"] > missing["rankingScore"]


def test_alert_ineligible_rows_still_rank_zero_and_keep_their_score():
    row = _candidate(action="WAIT", permission="no_trade", confidence=30, grade="D", risk_reward=None)

    ranked = _assign_ranks([row])

    assert ranked[0]["rank"] == 0
    assert ranked[0]["rankingScore"] > 0, "score is still computed for transparency"


def test_non_finite_inputs_never_produce_a_nan_score():
    """The UI calls rankingScore.toFixed(1); NaN would render as 'NaN'."""
    row = _candidate(symbol="AAA/USDT", confidence=float("nan"), risk_reward=float("inf"), adx=float("nan"))

    assert math.isfinite(row["rankingScore"])
    assert all(math.isfinite(v) for v in row["rankingBreakdown"].values())
    assert 0.0 <= row["rankingScore"] <= 100.0