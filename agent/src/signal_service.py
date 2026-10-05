from __future__ import annotations

from dataclasses import asdict
from time import time
from typing import Any

from src.action_call import build_action_call
from src.analyzer import AnalysisResult, analyze
from src.config import load_settings, load_strategy_config
from src.data import get_market_data_client
from src.indicators import add_indicators
from src.multi_timeframe import analyze_multi_timeframe, is_multi_timeframe_enabled


def normalize_symbol(raw: str) -> str:
    """Accept BTC, BTCUSDT, BTC/USDT and return exchange symbol BTC/USDT."""
    value = (raw or "").strip().upper().replace("-", "/")
    if not value:
        raise ValueError("symbol is required")
    if "/" in value:
        return value
    if value.endswith("USDT"):
        base = value[: -len("USDT")]
        if not base:
            raise ValueError(f"invalid symbol: {raw}")
        return f"{base}/USDT"
    return f"{value}/USDT"


def base_asset(symbol: str) -> str:
    return symbol.split("/")[0]


def analyze_symbol_payload(
    symbol_raw: str,
    *,
    use_mtf: bool | None = None,
    fetch_limit: int | None = None,
    include_wait: bool = True,
) -> dict[str, Any]:
    """
    Run the canonical Python Action Call pipeline for one symbol.

    Returns a JSON-serializable payload consumed by the Next.js dashboard.
    """
    settings = load_settings()
    config = load_strategy_config()
    client = get_market_data_client(settings.exchange)
    symbol = normalize_symbol(symbol_raw)
    # SCREENER_CANDLE_LIMIT is the screener-facing knob; FETCH_LIMIT stays the
    # shared fallback so deployments that only set FETCH_LIMIT are unaffected.
    limit = fetch_limit or settings.screener_candle_limit or settings.fetch_limit
    mtf_enabled = is_multi_timeframe_enabled(config) if use_mtf is None else use_mtf

    if mtf_enabled:
        result = analyze_multi_timeframe(symbol, client, config, limit)
        analysis_mode = "mtf"
    else:
        raw_df = client.fetch_ohlcv(symbol, settings.timeframe, limit)
        df = add_indicators(raw_df, config)
        result = analyze(symbol, settings.timeframe, df, config)
        analysis_mode = "single"

    action_call = build_action_call(result)
    payload = {
        "ok": True,
        "source": "python_action_call",
        "analysisMode": analysis_mode,
        "symbol": symbol,
        "baseAsset": base_asset(symbol),
        "timeframe": result.timeframe,
        "analysis": _analysis_to_dict(result),
        "actionCall": asdict(action_call) if action_call is not None else None,
        "signal": _to_dashboard_signal(result, action_call),
    }

    if action_call is None and not include_wait:
        payload["ok"] = True
        payload["signal"] = None
    return payload


def list_latest_action_calls(limit: int = 100) -> list[dict[str, Any]]:
    from src.dataset import DEFAULT_JSONL_PATH
    from src.db import fetch_action_calls
    from src.evaluator import load_action_call_rows

    settings = load_settings()
    limit = max(1, min(limit, 1000))
    if settings.database_enabled and settings.database_url:
        rows = fetch_action_calls(settings.database_url, limit=limit, labelled_only=False)
    else:
        rows = sorted(
            load_action_call_rows(DEFAULT_JSONL_PATH),
            key=lambda row: str(row.get("created_at") or ""),
            reverse=True,
        )[:limit]

    return [_dataset_row_to_dashboard(row) for row in rows]


def analyze_symbol(symbol_raw: str, *, multi_timeframe: bool = True) -> dict[str, Any]:
    """HTTP-facing alias used by FastAPI /api/v1/analyze."""
    return analyze_symbol_payload(symbol_raw, use_mtf=multi_timeframe)


def scan_symbols(
    symbols: list[str] | None = None,
    *,
    multi_timeframe: bool = True,
) -> dict[str, Any]:
    """Scan one or more symbols. Falls back to config universe when None."""
    settings = load_settings()
    config = load_strategy_config()
    targets = symbols
    if not targets:
        targets = list(getattr(config, "symbols", None) or getattr(settings, "symbols", None) or [])
    if not targets:
        targets = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]

    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for raw in targets:
        try:
            results.append(analyze_symbol_payload(str(raw), use_mtf=multi_timeframe))
        except Exception as error:  # noqa: BLE001 — surface per-symbol failure
            errors.append({"symbol": str(raw), "error": str(error)})

    return {
        "ok": len(errors) == 0,
        "source": "python_action_call",
        "count": len(results),
        "results": results,
        "errors": errors,
    }


def _analysis_to_dict(result: AnalysisResult) -> dict[str, Any]:
    order_block = None
    if result.order_block is not None:
        order_block = {
            "low": result.order_block.low,
            "high": result.order_block.high,
            "kind": result.order_block.kind,
        }
    return {
        "symbol": result.symbol,
        "timeframe": result.timeframe,
        "price": result.price,
        "trend": result.trend,
        "regime": result.regime,
        "signal": result.signal,
        "bias": result.bias,
        "rsi": result.rsi,
        "macd": result.macd,
        "atr": result.atr,
        "adx": result.adx,
        "support": result.support,
        "resistance": result.resistance,
        "fibonacci": result.fibonacci,
        "orderBlock": order_block,
        "liquiditySweep": result.liquidity_sweep,
        "stopLoss": result.stop_loss,
        "takeProfit": result.take_profit,
        "riskReward": result.risk_reward,
        "reasons": list(result.reasons),
    }


def _to_dashboard_signal(result: AnalysisResult, action_call: Any) -> dict[str, Any]:
    """Map Python analysis/action-call into the dashboard ActionCallView shape."""
    if action_call is None:
        confidence = _confidence_from_analysis(result)
        wait_reason = _wait_reason(result)
        # Grade follows the same scale as the actionable path. It used to be a
        # hardcoded "D", which contradicted the confidence sitting next to it:
        # the UI showed "55 / D" for a row whose own scale puts 55 in the C band.
        grade = _grade_from_confidence(confidence, result.risk_reward)
        return {
            "action": "WAIT",
            "status": "HOLD",
            "signal": result.signal or "HOLD",
            "bias": result.bias or "NEUTRAL",
            "trend": result.trend or "SIDEWAYS",
            "timeframe": result.timeframe,
            "confidenceScore": confidence,
            "signalGrade": grade,
            "entryTrigger": "NO_TRIGGER",
            "regime": _map_regime(result.regime, result.bias),
            "entryZone": {"min": None, "max": None},
            "stopLoss": result.stop_loss,
            "takeProfits": {
                "tp1": result.take_profit,
                "tp2": None,
                "tp3": None,
            },
            "riskRewardRatio": result.risk_reward,
            "suggestedLeverage": {"min": 0, "max": 0},
            "riskLevel": "NO_TRADE",
            "invalidationReason": wait_reason,
            "summary": f"{result.signal}: stand aside until a READY action call forms.",
            "reasons": list(result.reasons),
            "warnings": [],
            "noTradeReasons": [wait_reason],
            "primaryNoTradeReason": wait_reason,
            "mtfConfirmation": _mtf_from_reasons(result),
            "positioning": {
                "fundingRate": None,
                "fundingBias": "UNAVAILABLE",
                "openInterestChangePercent": None,
                "openInterestBias": "UNAVAILABLE",
            },
            "liquiditySweep": {
                "type": (
                    "BULLISH_SWEEP"
                    if _sweep_side(result.liquidity_sweep) == "BULLISH"
                    else "BEARISH_SWEEP"
                    if _sweep_side(result.liquidity_sweep) == "BEARISH"
                    else "NONE"
                ),
                "sweptLevel": None,
                "confidence": 70 if result.liquidity_sweep else 0,
            },
            "scoreBreakdown": {
                "trendScore": 0,
                "momentumScore": 0,
                "volumeScore": 0,
                "structureScore": 0,
                "riskScore": 0,
                "finalScore": confidence,
            },
            "confidence": confidence,
            "grade": grade[0] if grade.startswith("A") else grade,
            "marketRegime": _map_market_regime_id(result.regime, result.bias),
            "tradePermission": "no_trade",
            "dataHealth": _healthy_data(result),
            "entryStatus": "not_triggered",
            "riskApproval": "not_applicable",
            "invalidation": wait_reason,
            "reason": list(result.reasons),
            "forecastAlignment": "unavailable",
            "forecastConfidenceAdjustment": 0,
            "forecastWarnings": [],
            "forecastUsedInDecision": False,
            "lateEntryBlocked": False,
            "lateEntryReason": None,
            "sourceEngine": "python_action_call",
            "pythonSignal": result.signal,
            "pythonStatus": None,
            "pythonBias": result.bias,
            "pythonTrend": result.trend,
        }

    confidence = _confidence_from_analysis(result)
    grade = _grade_from_confidence(confidence, action_call.risk_reward)
    entry = float(action_call.entry_price)
    return {
        "action": action_call.action,
        "status": action_call.status,
        "signal": action_call.signal,
        "bias": result.bias or "NEUTRAL",
        "trend": result.trend or "SIDEWAYS",
        "timeframe": result.timeframe,
        "confidenceScore": confidence,
        "signalGrade": grade,
        "entryTrigger": _map_entry_trigger(action_call.signal),
        "regime": _map_regime(result.regime, result.bias),
        "entryZone": {"min": entry, "max": entry},
        "entryOrderType": action_call.entry_order_type,
        "stopLoss": action_call.stop_loss,
        "takeProfits": {
            "tp1": action_call.take_profit,
            "tp2": None,
            "tp3": None,
        },
        "riskRewardRatio": action_call.risk_reward,
        "suggestedLeverage": _leverage_from_rr(action_call.risk_reward),
        "riskLevel": _risk_level_from_rr(action_call.risk_reward),
        "invalidationReason": f"Invalid if price closes beyond stop at {action_call.stop_loss}.",
        "summary": (
            f"{action_call.action} {action_call.status}: {action_call.signal} "
            f"(RR {action_call.risk_reward})"
        ),
        "reasons": list(result.reasons),
        "warnings": (
            ["WAIT_CONFIRMATION — watch for follow-through before entry"]
            if action_call.status == "WAIT_CONFIRMATION"
            else []
        ),
        "noTradeReasons": [],
        "primaryNoTradeReason": None,
        "mtfConfirmation": _mtf_from_reasons(result),
        "positioning": {
            "fundingRate": None,
            "fundingBias": "UNAVAILABLE",
            "openInterestChangePercent": None,
            "openInterestBias": "UNAVAILABLE",
        },
        "liquiditySweep": {
            "type": (
                "BULLISH_SWEEP"
                if _sweep_side(result.liquidity_sweep) == "BULLISH"
                else "BEARISH_SWEEP"
                if _sweep_side(result.liquidity_sweep) == "BEARISH"
                else "NONE"
            ),
            "sweptLevel": None,
            "confidence": 50 if result.liquidity_sweep else 0,
        },
        "scoreBreakdown": {
            "trendScore": confidence,
            "momentumScore": confidence,
            "volumeScore": 50,
            "structureScore": confidence,
            "riskScore": confidence,
            "finalScore": confidence,
        },
        "confidence": confidence,
        "grade": grade[0] if grade.startswith("A") else grade,
        "marketRegime": _map_market_regime_id(result.regime, result.bias),
        "tradePermission": "long_only" if action_call.action == "LONG" else "short_only",
        "dataHealth": _healthy_data(result),
        "entryStatus": "triggered" if action_call.status == "READY" else "not_triggered",
        "riskApproval": "pass",
        "invalidation": f"Invalid if price closes beyond stop at {action_call.stop_loss}.",
        "reason": list(result.reasons),
        "forecastAlignment": "unavailable",
        "forecastConfidenceAdjustment": 0,
        "forecastWarnings": [],
        "forecastUsedInDecision": False,
        "lateEntryBlocked": False,
        "lateEntryReason": None,
        "sourceEngine": "python_action_call",
        "pythonSignal": action_call.signal,
        "pythonStatus": action_call.status,
        "pythonBias": result.bias,
        "pythonTrend": result.trend,
    }


def _dataset_row_to_dashboard(row: dict[str, Any]) -> dict[str, Any]:
    action = str(row.get("action") or "WAIT").upper()
    if action not in {"LONG", "SHORT"}:
        action = "WAIT"
    entry = row.get("entry_price")
    confidence = 70 if action in {"LONG", "SHORT"} else 40
    grade = "B"
    return {
        "symbol": str(row.get("symbol") or ""),
        "baseAsset": base_asset(str(row.get("symbol") or "UNKNOWN/USDT")),
        "timeframe": str(row.get("timeframe") or "5m"),
        "evaluatedAt": row.get("created_at"),
        "action": action,
        "confidence": confidence,
        "grade": grade,
        "entry": entry,
        "entryOrderType": row.get("entry_order_type"),
        "stopLoss": row.get("stop_loss"),
        "takeProfits": [row.get("take_profit"), None, None],
        "riskReward": row.get("risk_reward"),
        "marketRegime": _map_market_regime_id(str(row.get("regime") or ""), str(row.get("bias") or "")),
        "tradePermission": (
            "long_only" if action == "LONG" else "short_only" if action == "SHORT" else "no_trade"
        ),
        "reasons": row.get("reasons") if isinstance(row.get("reasons"), list) else [],
        "noTradeReasons": [],
        "fundingRate": None,
        "openInterestChangePercent": None,
        "mtfAlignmentScore": 100 if action in {"LONG", "SHORT"} else 0,
        "warnings": [],
        "pythonSignal": row.get("signal"),
        "pythonStatus": row.get("status"),
        "label": row.get("label"),
        "outcomeStatus": row.get("outcome_status"),
        "pnlPercent": row.get("pnl_percent"),
        "createdAt": row.get("created_at"),
        "sourceEngine": "python_action_call",
    }


def _confidence_from_analysis(result: AnalysisResult) -> int:
    """Score setup quality 0-100, then cap it by the data-health budget.

    This used to take an `actionable` flag that clamped the score to 55 whenever
    no action call formed, and the WAIT branch hardcoded `signalGrade: "D"`. On
    the live universe that made all 99 rows read "confidence 55 / grade D",
    whether the market was dead flat or aligned across 1h/4h/15m/30m with ADX
    30+. The clamp protected nothing — `evaluate_alerts()` skips `action ==
    "WAIT"` before it looks at quality, so a WAIT row cannot alert on confidence
    alone — and it destroyed the only number a reader has for telling a live
    setup from a dead one.

    So the score is reported as computed, capped only by the data-health budget
    (`confidenceCap`), which is what that field always claimed to do.
    """
    score = 40
    if result.regime == "TRENDING":
        score += 20
    elif result.regime == "TRANSITION":
        score += 10
    if result.bias in {"BULLISH", "BEARISH"}:
        score += 10
    if result.adx is not None:
        if result.adx >= 25:
            score += 10
        elif result.adx >= 18:
            score += 5
    if result.risk_reward is not None:
        if result.risk_reward >= 2:
            score += 10
        elif result.risk_reward >= 1.2:
            score += 5
    if "MTF" in result.signal:
        score += 10

    return max(0, min(score, _data_health_confidence_cap(result)))


def _data_health_confidence_cap(result: AnalysisResult) -> int:
    """Highest confidence the feed quality permits.

    Kept in step with the `confidenceCap` field `_healthy_data()` reports: the
    drawer renders that value ("Confidence cap: 60%"), so if the two disagreed
    the UI would be stating a budget the engine never applied.
    """
    return 100 if _data_health_ok(result) else 60


def _data_health_ok(result: AnalysisResult) -> bool:
    """Whether the feed behind this result is good enough to trust at full weight."""
    health = _healthy_data(result)
    return bool(health["ok"])


def _grade_from_confidence(confidence: int, risk_reward: float | None) -> str:
    if confidence >= 85 and (risk_reward or 0) >= 1.8:
        return "A+"
    if confidence >= 75:
        return "A"
    if confidence >= 60:
        return "B"
    if confidence >= 45:
        return "C"
    return "D"


def _map_regime(regime: str, bias: str) -> str:
    if regime == "TRENDING" and bias == "BULLISH":
        return "BULLISH_TREND"
    if regime == "TRENDING" and bias == "BEARISH":
        return "BEARISH_TREND"
    if regime == "RANGING":
        return "RANGE"
    if regime == "TRANSITION":
        return "CHOP_HIGH_RISK"
    return "INSUFFICIENT_DATA"


def _map_market_regime_id(regime: str, bias: str) -> str:
    mapped = _map_regime(regime, bias)
    return {
        "BULLISH_TREND": "bullish_trend",
        "BEARISH_TREND": "bearish_trend",
        "RANGE": "range",
        "CHOP_HIGH_RISK": "choppy",
        "INSUFFICIENT_DATA": "unknown",
    }.get(mapped, "unknown")


def _map_entry_trigger(signal: str) -> str:
    upper = signal.upper()
    if "CONTINUATION" in upper or "TREND FOLLOW" in upper:
        return "TREND_CONTINUATION"
    if "WATCH" in upper:
        return "LIQUIDITY_SWEEP_REVERSAL"
    if "MTF" in upper:
        return "TREND_CONTINUATION"
    return "NO_TRIGGER"


def _sweep_side(value: str | None) -> str | None:
    if not value:
        return None
    if "SELL_SIDE" in value:
        return "SELL_SIDE"
    if "BUY_SIDE" in value:
        return "BUY_SIDE"
    return None


def _wait_reason(result: AnalysisResult) -> str:
    """Name the gate that actually blocked this setup.

    This used to return one generic sentence for every WAIT row. On the live
    universe that meant 99/99 rows carried "No READY multi-timeframe action
    call.", which tells a reader nothing: it is equally true of a flat market
    and of a fully trend-aligned setup whose 5m entry has not triggered yet.

    The specific causes are already recorded in `reasons`, so report the first
    one that names a gate. Ordered by how actionable it is to the reader: a
    rejected risk plan is the most concrete, a missing alignment the vaguest.
    """
    if result.risk_reward is not None and result.risk_reward < 1.0:
        return (
            f"Risk/reward too low ({result.risk_reward}): target is closer than the "
            "stop, so the setup does not pay for its risk."
        )
    for reason in result.reasons:
        if reason.startswith("Risk/reward below minimum"):
            return f"Risk plan below the configured minimum: {reason.split(': ', 1)[-1]}."
    if any("aligned with trend: False" in reason for reason in result.reasons):
        return "Confirmation timeframes (15m/30m) disagree with the 1h/4h trend."
    if any("Trend aligned: False" in reason for reason in result.reasons):
        return "1h and 4h trends disagree, so there is no directional bias to trade."
    if any("No aligned 5m entry setup" in reason for reason in result.reasons):
        return "Trend and confirmation agree, but no 5m entry trigger has fired yet."
    if result.signal == "HOLD":
        return "No entry condition met on the 5m timeframe."
    return f"Signal {result.signal} did not pass action-call filters."


def _mtf_from_reasons(result: AnalysisResult) -> dict[str, Any]:
    bias = result.bias if result.bias in {"BULLISH", "BEARISH"} else "NEUTRAL"
    conflicts: list[str] = []
    alignment = 100
    for reason in result.reasons:
        if "Trend aligned: False" in reason or "aligned with trend: False" in reason:
            alignment = 40
            conflicts.append(reason)
        if reason.startswith("Trend direction") or reason.startswith("Confirmation"):
            # keep informational only
            pass
    mapped_bias = bias if bias in {"BULLISH", "BEARISH", "NEUTRAL"} else "NEUTRAL"
    return {
        "macroBias": mapped_bias,
        "setupBias": mapped_bias,
        "triggerBias": mapped_bias,
        "alignmentScore": alignment,
        "conflicts": conflicts,
    }


def _leverage_from_rr(rr: float | None) -> dict[str, int]:
    if rr is None:
        return {"min": 0, "max": 0}
    if rr >= 2:
        return {"min": 2, "max": 3}
    if rr >= 1.2:
        return {"min": 1, "max": 2}
    return {"min": 1, "max": 1}


def _risk_level_from_rr(rr: float | None) -> str:
    if rr is None:
        return "NO_TRADE"
    if rr >= 2:
        return "LOW"
    if rr >= 1.2:
        return "MEDIUM"
    return "HIGH"


# Freshness budget per timeframe: how many bars may pass before the newest candle
# counts as stale. 3 bars tolerates a slow poll without hiding a dead feed.
DEFAULT_MIN_CANDLES = 50
FRESHNESS_BARS = 3

_TIMEFRAME_BARS_MS = {
    "1m": 60_000,
    "3m": 180_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


def _freshness_budget_sec(timeframe: str) -> int:
    bar_ms = _TIMEFRAME_BARS_MS.get(str(timeframe).lower())
    if bar_ms is None:
        return 3600
    return max(60, (bar_ms * FRESHNESS_BARS) // 1000)


def _timeframe_health(
    *,
    label: str,
    candle_count: int,
    last_close_ms: int | None,
    now_ms: int,
    min_candles: int,
    max_age_sec: int,
) -> dict[str, Any]:
    age_sec: int | None = None
    if last_close_ms is not None:
        age_sec = max(0, int((now_ms - last_close_ms) / 1000))

    reason: str | None = None
    if last_close_ms is None:
        fresh = False
        reason = "No candle timestamp available."
    elif candle_count < min_candles:
        fresh = False
        reason = f"Only {candle_count} candles (need {min_candles})."
    elif age_sec > max_age_sec:
        fresh = False
        reason = f"Stale candle: {age_sec}s old (max {max_age_sec}s)."
    else:
        fresh = True

    return {
        "available": candle_count > 0,
        "candleCount": candle_count,
        "minRequired": min_candles,
        "newestCloseTimeMs": last_close_ms,
        "ageSec": age_sec,
        "maxAgeSec": max_age_sec,
        "fresh": fresh,
        "ok": fresh,
        "sorted": True,
        "reason": reason,
        "label": label,
    }


def _healthy_data(
    result: AnalysisResult,
    *,
    now_ms: int | None = None,
    min_candles: int = DEFAULT_MIN_CANDLES,
    max_age_sec: int | None = None,
) -> dict[str, Any]:
    """Build the FuturesDataHealth block from the candles that were actually used.

    The Python engine analyses one series per symbol, so setup/macro/trigger all
    report that same measured series - a stale feed fails all three rather than
    passing on hardcoded placeholders.
    """
    now_ms = int(time() * 1000) if now_ms is None else int(now_ms)
    setup_tf = result.timeframe or "5m"
    budget = max_age_sec if max_age_sec is not None else _freshness_budget_sec(setup_tf)

    def block(label: str) -> dict[str, Any]:
        return _timeframe_health(
            label=label,
            candle_count=result.candle_count,
            last_close_ms=result.last_candle_close_ms,
            now_ms=now_ms,
            min_candles=min_candles,
            max_age_sec=budget,
        )

    setup = block(setup_tf)
    macro = block("4h")
    trigger = block("15m")

    symbol_valid = bool(result.symbol)
    ok = symbol_valid and setup["ok"] and macro["ok"] and trigger["ok"]
    reasons = [block_reason for block_reason in (setup["reason"], macro["reason"], trigger["reason"]) if block_reason]
    if not symbol_valid:
        reasons.append("Symbol missing or invalid.")

    return {
        "ok": ok,
        "reasons": reasons,
        "symbol": {
            "provided": symbol_valid,
            "valid": symbol_valid,
            "reason": None if symbol_valid else "Symbol missing or invalid.",
        },
        "setup": setup,
        "macro": macro,
        "trigger": trigger,
        "funding": {
            "available": False,
            "fresh": False,
            "ageSec": None,
            "maxAgeSec": None,
            "reason": "Funding not used by Python action-call engine.",
        },
        "openInterest": {
            "available": False,
            "fresh": False,
            "ageSec": None,
            "maxAgeSec": None,
            "reason": "Open interest not used by Python action-call engine.",
        },
        # Same budget `_confidence_from_analysis` enforces. One literal, so the
        # number rendered here cannot drift from the number applied.
        "confidenceCap": 100 if ok else 60,
    }
