"""Contract tests: Python screener snapshot must satisfy RankedScreenerResult UI shape.

The Next.js /screener page reads latest.results as RankedScreenerResult[].
Missing camelCase fields (marketRegime, baseAsset, freshness, etc.) crash the UI.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from src.screener.engine import _to_candidate, run_screener
from src.screener.policy import AlertPolicySettings


# Fields required by src/lib/application/screener/types.ts RankedScreenerResult
REQUIRED_RESULT_FIELDS = (
    "symbol",
    "baseAsset",
    "quoteAsset",
    "setupTimeframe",
    "triggerTimeframe",
    "macroTimeframe",
    "evaluatedAt",
    "candleCloseTime",
    "currentPrice",
    "dataHealth",
    "action",
    "confidence",
    "grade",
    "entry",
    "stopLoss",
    "takeProfits",
    "riskReward",
    "marketRegime",
    "tradePermission",
    "reasons",
    "noTradeReasons",
    "fundingRate",
    "openInterestChangePercent",
    "mtfAlignmentScore",
    "warnings",
    "freshness",
    "rank",
    "rankingScore",
    "rankReason",
    "alertEligible",
    "alertBlockReasons",
)

REQUIRED_DATA_HEALTH_FIELDS = (
    "ok",
    "symbol",
    "setup",
    "macro",
    "trigger",
    "funding",
    "openInterest",
    "reasons",
    "confidenceCap",
)

REQUIRED_FRESHNESS_FIELDS = (
    "setupCandleAgeSec",
    "macroCandleAgeSec",
    "triggerCandleAgeSec",
    "fundingAgeSec",
    "openInterestAgeSec",
)

REQUIRED_LATEST_FIELDS = (
    "completedAt",
    "health",
    "results",
    "timeframes",
    "universeSize",
)

REQUIRED_TIMEFRAME_FIELDS = ("setup", "trigger", "macro")

REQUIRED_HEALTH_FIELDS = (
    "status",
    "startedAt",
    "completedAt",
    "evaluatedSymbols",
    "failedSymbols",
    "errors",
)


def _assert_ranked_result_contract(row: dict[str, Any]) -> None:
    missing = [field for field in REQUIRED_RESULT_FIELDS if field not in row]
    assert not missing, f"RankedScreenerResult missing fields: {missing}"

    assert isinstance(row["baseAsset"], str) and row["baseAsset"]
    assert isinstance(row["quoteAsset"], str) and row["quoteAsset"]
    assert row["action"] in {"LONG", "SHORT", "WAIT"}
    assert isinstance(row["confidence"], (int, float))
    assert row["grade"] in {"A", "B", "C", "D"}
    assert isinstance(row["takeProfits"], list)
    assert isinstance(row["reasons"], list)
    assert isinstance(row["noTradeReasons"], list)
    assert isinstance(row["warnings"], list)
    assert isinstance(row["rankReason"], list)
    assert isinstance(row["alertBlockReasons"], list)
    assert isinstance(row["alertEligible"], bool)
    assert isinstance(row["rank"], int)
    assert isinstance(row["rankingScore"], (int, float))
    assert row["marketRegime"] in {
        "bullish_trend",
        "bearish_trend",
        "range",
        "choppy",
        "volatile",
        "unknown",
    }
    assert row["tradePermission"] in {"long_only", "short_only", "both", "no_trade"}

    # Policy status must stay off the UI result contract (alerts are separate).
    assert "status" not in row

    data_health = row["dataHealth"]
    assert isinstance(data_health, dict)
    missing_health = [field for field in REQUIRED_DATA_HEALTH_FIELDS if field not in data_health]
    assert not missing_health, f"dataHealth missing fields: {missing_health}"
    assert isinstance(data_health["ok"], bool)
    for tf_key in ("setup", "macro", "trigger"):
        tf = data_health[tf_key]
        for key in ("required", "candleCount", "minCandlesRequired", "lastCandleAgeSec", "maxAgeSec", "ok", "reason"):
            assert key in tf, f"dataHealth.{tf_key} missing {key}"
    for secondary in ("funding", "openInterest"):
        block = data_health[secondary]
        for key in ("available", "ageSec", "maxAgeSec", "ok"):
            assert key in block, f"dataHealth.{secondary} missing {key}"

    freshness = row["freshness"]
    assert isinstance(freshness, dict)
    missing_fresh = [field for field in REQUIRED_FRESHNESS_FIELDS if field not in freshness]
    assert not missing_fresh, f"freshness missing fields: {missing_fresh}"


def _signal_payload(
    *,
    symbol: str = "BTC/USDT",
    action: str = "LONG",
    confidence: int = 82,
    grade: str = "A",
    entry: float | None = 65000.0,
    stop_loss: float | None = 64000.0,
    take_profit: float | None = 67000.0,
    risk_reward: float | None = 2.0,
    market_regime: str = "bullish_trend",
    trade_permission: str = "long_only",
    price: float = 65000.0,
) -> dict[str, Any]:
    """Minimal analyze_symbol_payload-shaped response used by the engine."""
    return {
        "ok": True,
        "source": "python_action_call",
        "analysisMode": "mtf",
        "symbol": symbol,
        "baseAsset": symbol.split("/")[0],
        "timeframe": "1h",
        "analysis": {
            "symbol": symbol,
            "timeframe": "1h",
            "price": price,
            "trend": "UP",
            "regime": "TRENDING",
            "signal": "BULLISH CONTINUATION",
            "bias": "BULLISH",
            "reasons": ["trend aligned"],
        },
        "actionCall": {
            "action": action,
            "status": "READY",
            "entry_price": entry,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "risk_reward": risk_reward,
        }
        if action in {"LONG", "SHORT"}
        else None,
        "signal": {
            "action": action,
            "confidence": confidence,
            "confidenceScore": confidence,
            "grade": grade,
            "signalGrade": grade,
            "entryZone": {"min": entry, "max": entry},
            "stopLoss": stop_loss,
            "takeProfits": {"tp1": take_profit, "tp2": 69000.0, "tp3": None},
            "riskRewardRatio": risk_reward,
            "marketRegime": market_regime,
            "tradePermission": trade_permission,
            "reasons": ["trend aligned"],
            "noTradeReasons": [] if action != "WAIT" else ["No READY multi-timeframe action call."],
            "warnings": [],
            "mtfConfirmation": {
                "macroBias": "BULLISH",
                "setupBias": "BULLISH",
                "triggerBias": "BULLISH",
                "alignmentScore": 80,
                "conflicts": [],
            },
            "positioning": {
                "fundingRate": 0.0001,
                "fundingBias": "NEUTRAL",
                "openInterestChangePercent": 2.0,
                "openInterestBias": "NEUTRAL",
            },
            "dataHealth": {
                "ok": True,
                "reasons": [],
                "symbol": {"provided": True, "valid": True, "reason": None},
                # Intentionally mixed shape (Python signal_service currently uses
                # available/candleCount/minRequired/ageSec) — mapper must normalize.
                "setup": {
                    "available": True,
                    "candleCount": 100,
                    "minRequired": 50,
                    "newestCloseTimeMs": 1_700_000_000_000,
                    "ageSec": 60,
                    "maxAgeSec": 3600,
                    "fresh": True,
                    "sorted": True,
                    "reason": None,
                    "label": "1h",
                },
                "macro": {
                    "available": True,
                    "candleCount": 100,
                    "minRequired": 50,
                    "newestCloseTimeMs": 1_700_000_000_000,
                    "ageSec": 120,
                    "maxAgeSec": 14400,
                    "fresh": True,
                    "sorted": True,
                    "reason": None,
                    "label": "4h",
                },
                "trigger": {
                    "available": True,
                    "candleCount": 100,
                    "minRequired": 50,
                    "newestCloseTimeMs": 1_700_000_000_000,
                    "ageSec": 30,
                    "maxAgeSec": 1800,
                    "fresh": True,
                    "sorted": True,
                    "reason": None,
                    "label": "15m",
                },
                "funding": {
                    "available": True,
                    "fresh": True,
                    "ageSec": 300,
                    "maxAgeSec": 32400,
                    "reason": None,
                },
                "openInterest": {
                    "available": True,
                    "fresh": True,
                    "ageSec": 300,
                    "maxAgeSec": 900,
                    "reason": None,
                },
                "confidenceCap": 100,
            },
        },
    }


def test_to_candidate_emits_full_ranked_screener_result_contract():
    payload = _signal_payload()
    row = _to_candidate(payload, evaluated_at=1_700_000_060_000, rank=1)

    _assert_ranked_result_contract(row)

    assert row["symbol"] in {"BTCUSDT", "BTC/USDT"}
    assert row["baseAsset"] == "BTC"
    assert row["quoteAsset"] == "USDT"
    assert row["action"] == "LONG"
    assert row["confidence"] == 82
    assert row["grade"] == "A"
    assert row["entry"] == 65000.0
    assert row["stopLoss"] == 64000.0
    assert row["takeProfits"][0] == 67000.0
    assert row["riskReward"] == 2.0
    assert row["marketRegime"] == "bullish_trend"
    assert row["tradePermission"] == "long_only"
    assert row["fundingRate"] == 0.0001
    assert row["openInterestChangePercent"] == 2.0
    assert row["mtfAlignmentScore"] == 80
    assert row["rank"] == 1
    assert row["alertEligible"] is True
    assert row["evaluatedAt"] == 1_700_000_060_000
    assert row["currentPrice"] == 65000.0
    assert row["candleCloseTime"] is not None
    assert row["setupTimeframe"]
    assert row["triggerTimeframe"]
    assert row["macroTimeframe"]
    assert row["dataHealth"]["ok"] is True
    assert row["freshness"]["setupCandleAgeSec"] is not None


def test_to_candidate_wait_is_valid_and_not_alert_eligible():
    payload = _signal_payload(
        action="WAIT",
        confidence=40,
        grade="D",
        entry=None,
        stop_loss=None,
        take_profit=None,
        risk_reward=None,
        market_regime="range",
        trade_permission="no_trade",
    )
    # Force WAIT signal body.
    payload["signal"]["action"] = "WAIT"
    payload["signal"]["grade"] = "D"
    payload["signal"]["entryZone"] = {"min": None, "max": None}
    payload["signal"]["stopLoss"] = None
    payload["signal"]["takeProfits"] = {"tp1": None, "tp2": None, "tp3": None}
    payload["signal"]["riskRewardRatio"] = None
    payload["signal"]["tradePermission"] = "no_trade"
    payload["signal"]["noTradeReasons"] = ["No READY multi-timeframe action call."]
    payload["actionCall"] = None

    row = _to_candidate(payload, evaluated_at=1_700_000_060_000, rank=0)
    _assert_ranked_result_contract(row)
    assert row["action"] == "WAIT"
    assert row["alertEligible"] is False
    assert row["rank"] == 0
    assert row["tradePermission"] == "no_trade"
    assert row["noTradeReasons"]


def test_run_screener_snapshot_matches_ui_latest_contract(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    # Reload settings path via run_screener -> load_settings; env is enough.

    payload = _signal_payload()

    with patch("src.screener.engine.analyze_symbol_payload", return_value=payload):
        latest = run_screener(["BTC/USDT"])

    missing = [field for field in REQUIRED_LATEST_FIELDS if field not in latest]
    assert not missing, f"latest snapshot missing fields: {missing}"

    assert isinstance(latest["completedAt"], int)
    assert isinstance(latest["universeSize"], int)
    assert latest["universeSize"] == 1

    timeframes = latest["timeframes"]
    for key in REQUIRED_TIMEFRAME_FIELDS:
        assert key in timeframes and timeframes[key]

    health = latest["health"]
    missing_health = [field for field in REQUIRED_HEALTH_FIELDS if field not in health]
    assert not missing_health, f"health missing fields: {missing_health}"
    assert health["status"] in {
        "idle",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
    }
    assert health["evaluatedSymbols"] == 1
    assert health["failedSymbols"] == 0

    assert isinstance(latest["results"], list) and len(latest["results"]) == 1
    row = latest["results"][0]
    _assert_ranked_result_contract(row)

    # Alert policy decisions are separate from ranked UI rows.
    assert "status" not in row


def test_run_screener_keeps_policy_status_off_results(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    payload = _signal_payload(confidence=50, grade="C")  # may fail quality gates

    settings = AlertPolicySettings(
        enabled=True,
        min_confidence=75,
        min_grade="B",
        min_risk_reward=1.5,
        cooldown_minutes=10,
        max_alerts_per_hour=10,
    )

    with (
        patch("src.screener.engine.analyze_symbol_payload", return_value=payload),
        patch("src.screener.engine.load_settings") as mock_settings,
    ):
        # Provide a settings object with the fields run_screener needs.
        mock_settings.return_value.screener_storage_dir = str(tmp_path)
        mock_settings.return_value.symbols = ["BTC/USDT"]
        mock_settings.return_value.screener_max_alerts_per_hour = settings.max_alerts_per_hour
        mock_settings.return_value.screener_cooldown_minutes = settings.cooldown_minutes
        mock_settings.return_value.screener_min_confidence = settings.min_confidence
        mock_settings.return_value.screener_min_risk_reward = settings.min_risk_reward
        mock_settings.return_value.screener_min_grade = settings.min_grade

        latest = run_screener(["BTC/USDT"])

    row = latest["results"][0]
    _assert_ranked_result_contract(row)
    assert "status" not in row
