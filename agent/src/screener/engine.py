from __future__ import annotations

import math
from pathlib import Path
from time import time
from typing import Any

from src.binance_universe import resolve_screener_universe
from src.config import load_settings
from src.signal_service import analyze_symbol_payload

from .policy import AlertPolicySettings, evaluate_alerts
from .storage import AtomicJsonStore

DEFAULT_SETUP_TIMEFRAME = "30m"
DEFAULT_TRIGGER_TIMEFRAME = "15m"
DEFAULT_MACRO_TIMEFRAME = "4h"

_VALID_GRADES = {"A", "B", "C", "D"}
_VALID_REGIMES = {
    "bullish_trend",
    "bearish_trend",
    "range",
    "choppy",
    "volatile",
    "unknown",
}
_VALID_PERMISSIONS = {"long_only", "short_only", "both", "no_trade"}
_VALID_ACTIONS = {"LONG", "SHORT", "WAIT"}


def run_screener(symbols: list[str] | None = None) -> dict[str, Any]:
    """
    Run one screener cycle and persist a snapshot matching the Next.js
    RankedScreenerResult / ScreenerLatestRun UI contract.

    When `symbols` is None, the universe is resolved dynamically (default:
    top Binance USDⓈ-M futures by 24h quote volume). Explicit symbols from
    function args or API body always override the dynamic resolver.

    Alert-policy decisions are stored separately from `results` so the UI
    never sees transient `status` / `reason` fields on ranked rows.
    """
    settings = load_settings()
    store = AtomicJsonStore(Path(settings.screener_storage_dir))
    universe = resolve_screener_universe(settings, symbols_override=symbols)
    targets = list(universe.symbols)
    started_at = int(time() * 1000)
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for index, symbol in enumerate(targets, start=1):
        try:
            payload = analyze_symbol_payload(symbol)
            results.append(_to_candidate(payload, evaluated_at=started_at, rank=index))
        except Exception as error:  # noqa: BLE001 - keep cycle resilient
            errors.append({"symbol": str(symbol), "message": str(error)})

    results = _assign_ranks(results)

    completed_at = int(time() * 1000)
    policy_settings = AlertPolicySettings(
        enabled=True,
        min_confidence=settings.screener_min_confidence,
        min_grade=settings.screener_min_grade,
        min_risk_reward=settings.screener_min_risk_reward,
        cooldown_minutes=settings.screener_cooldown_minutes,
        max_alerts_per_hour=settings.screener_max_alerts_per_hour,
    )
    decisions = evaluate_alerts(
        results,
        settings=policy_settings,
        now_ms=completed_at,
        recent_alerts=store.read_action_calls(),
    )
    for decision in decisions:
        if decision.get("status") == "triggered":
            store.append_action_call(
                {
                    "symbol": decision.get("symbol"),
                    "action": decision.get("action"),
                    "status": "triggered",
                    "createdAt": completed_at,
                    "confidence": decision.get("confidence"),
                    "grade": decision.get("grade"),
                    "rankingScore": decision.get("rankingScore"),
                }
            )

    health_status = (
        "completed"
        if not errors
        else ("completed_with_errors" if results else "failed")
    )
    universe_meta = {
        "source": universe.source,
        "mode": universe.mode,
        "symbols": list(universe.symbols),
        "warning": universe.warning,
        "cacheHit": universe.cache_hit,
        "resolvedAt": universe.resolved_at,
        "count": len(targets),
    }
    health: dict[str, Any] = {
        "status": health_status,
        "startedAt": started_at,
        "completedAt": completed_at,
        "evaluatedSymbols": len(results),
        "failedSymbols": len(errors),
        "errors": errors,
        "universe": universe_meta,
        "universeSource": universe.source,
        "universeWarning": universe.warning,
    }
    if universe.warning:
        health["warnings"] = [str(universe.warning)]

    snapshot = {
        "completedAt": completed_at,
        "universeSize": len(targets),
        "universe": universe_meta,
        "timeframes": {
            "setup": DEFAULT_SETUP_TIMEFRAME,
            "trigger": DEFAULT_TRIGGER_TIMEFRAME,
            "macro": DEFAULT_MACRO_TIMEFRAME,
        },
        "health": health,
        "results": results,
        "alertDecisions": [
            {
                "symbol": d.get("symbol"),
                "action": d.get("action"),
                "status": d.get("status"),
                "reason": d.get("reason"),
            }
            for d in decisions
        ],
    }
    store.write_latest(snapshot)
    store.append_history(
        {
            "ts": completed_at,
            "status": health_status,
            "evaluatedSymbols": len(results),
            "failedSymbols": len(errors),
            "topSymbol": results[0]["symbol"] if results else None,
            "topAction": results[0]["action"] if results else None,
            "topScore": results[0]["rankingScore"] if results else None,
            "universeSource": universe_meta.get("source"),
            "universeWarning": universe_meta.get("warning"),
        }
    )
    return snapshot


def _to_candidate(
    payload: dict[str, Any],
    *,
    evaluated_at: int,
    rank: int = 0,
) -> dict[str, Any]:
    """Map a python signal_service payload into a flat RankedScreenerResult."""
    signal = payload.get("signal") if isinstance(payload.get("signal"), dict) else {}
    action_call = payload.get("actionCall") if isinstance(payload.get("actionCall"), dict) else None
    analysis = payload.get("analysis") if isinstance(payload.get("analysis"), dict) else {}

    symbol_raw = str(payload.get("symbol") or signal.get("symbol") or "")
    base = str(payload.get("baseAsset") or _base_asset(symbol_raw) or "UNKNOWN")
    quote = _quote_asset(symbol_raw)

    action = str(signal.get("action") or "WAIT").upper()
    if action not in _VALID_ACTIONS:
        action = "WAIT"

    confidence = _as_float(signal.get("confidence"), signal.get("confidenceScore"), default=0.0)
    confidence = max(0.0, min(100.0, confidence))
    grade = _normalize_grade(signal.get("grade") or signal.get("signalGrade") or "D")

    entry_zone = signal.get("entryZone") if isinstance(signal.get("entryZone"), dict) else {}
    entry = _first_number(
        entry_zone.get("min"),
        entry_zone.get("max"),
        action_call.get("entry_price") if action_call else None,
        analysis.get("price"),
    )
    stop_loss = _first_number(
        signal.get("stopLoss"),
        action_call.get("stop_loss") if action_call else None,
        analysis.get("stopLoss"),
    )

    take_profits = _extract_take_profits(signal, analysis)

    risk_reward = _as_optional_float(
        signal.get("riskRewardRatio"),
        signal.get("riskReward"),
        action_call.get("risk_reward") if action_call else None,
        analysis.get("riskReward"),
    )

    market_regime = _normalize_regime(
        signal.get("marketRegime") or signal.get("regime") or analysis.get("regime")
    )
    trade_permission = _normalize_permission(signal.get("tradePermission"), action=action)

    reasons = _as_str_list(signal.get("reasons") or signal.get("reason") or analysis.get("reasons"))
    no_trade_reasons = _as_str_list(signal.get("noTradeReasons"))
    if action == "WAIT" and not no_trade_reasons:
        primary = signal.get("primaryNoTradeReason") or signal.get("invalidationReason")
        if primary:
            no_trade_reasons = [str(primary)]

    positioning = signal.get("positioning") if isinstance(signal.get("positioning"), dict) else {}
    funding_rate = _as_optional_float(signal.get("fundingRate"), positioning.get("fundingRate"))
    oi_change = _as_optional_float(
        signal.get("openInterestChangePercent"),
        positioning.get("openInterestChangePercent"),
    )

    mtf = signal.get("mtfConfirmation") if isinstance(signal.get("mtfConfirmation"), dict) else {}
    mtf_alignment = _as_optional_float(signal.get("mtfAlignmentScore"), mtf.get("alignmentScore"))

    warnings = _as_str_list(signal.get("warnings"))
    data_health = _normalize_data_health(signal.get("dataHealth"), symbol=symbol_raw)
    current_price = _first_number(analysis.get("price"), signal.get("currentPrice"), entry)
    candle_close_time = _resolve_candle_close_time(
        signal,
        analysis,
        data_health,
        evaluated_at=evaluated_at,
    )
    freshness = _build_freshness(
        signal.get("freshness") if isinstance(signal.get("freshness"), dict) else None,
        data_health,
        evaluated_at=evaluated_at,
        candle_close_time=candle_close_time,
    )

    setup_tf = str(
        signal.get("setupTimeframe")
        or payload.get("timeframe")
        or analysis.get("timeframe")
        or DEFAULT_SETUP_TIMEFRAME
    )
    trigger_tf = str(signal.get("triggerTimeframe") or DEFAULT_TRIGGER_TIMEFRAME)
    macro_tf = str(signal.get("macroTimeframe") or DEFAULT_MACRO_TIMEFRAME)

    ranking_score = round(confidence, 2)
    alert_eligible, alert_block_reasons = _alert_eligibility(
        action=action,
        confidence=confidence,
        grade=grade,
        risk_reward=risk_reward,
        data_health_ok=bool(data_health.get("ok")),
        trade_permission=trade_permission,
    )
    rank_reason = (
        [f"Score: {ranking_score:.1f}"]
        if alert_eligible
        else ["Ineligible", *alert_block_reasons]
    )

    return {
        "symbol": symbol_raw,
        "baseAsset": base,
        "quoteAsset": quote,
        "marketCapRank": _as_optional_int(payload.get("marketCapRank"), signal.get("marketCapRank")),
        "setupTimeframe": setup_tf,
        "triggerTimeframe": trigger_tf,
        "macroTimeframe": macro_tf,
        "evaluatedAt": evaluated_at,
        "candleCloseTime": candle_close_time,
        "currentPrice": current_price,
        "dataHealth": data_health,
        "action": action,
        "confidence": confidence,
        "grade": grade,
        "entry": entry,
        "stopLoss": stop_loss,
        "takeProfits": take_profits,
        "riskReward": risk_reward,
        "marketRegime": market_regime,
        "tradePermission": trade_permission,
        "reasons": reasons,
        "noTradeReasons": no_trade_reasons,
        "fundingRate": funding_rate,
        "openInterestChangePercent": oi_change,
        "mtfAlignmentScore": mtf_alignment,
        "warnings": warnings,
        "freshness": freshness,
        "rank": rank if alert_eligible else 0,
        "rankingScore": ranking_score,
        "rankReason": rank_reason,
        "alertEligible": alert_eligible,
        "alertBlockReasons": alert_block_reasons,
    }


def _extract_take_profits(signal: dict[str, Any], analysis: dict[str, Any]) -> list[float | None]:
    raw = signal.get("takeProfits")
    if isinstance(raw, list):
        return [_as_optional_float(raw[i] if i < len(raw) else None) for i in range(3)]
    if isinstance(raw, dict):
        return [
            _as_optional_float(raw.get("tp1"), analysis.get("takeProfit")),
            _as_optional_float(raw.get("tp2")),
            _as_optional_float(raw.get("tp3")),
        ]
    return [
        _as_optional_float(analysis.get("takeProfit")),
        None,
        None,
    ]


def _assign_ranks(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    eligible = [r for r in results if r.get("alertEligible")]
    ineligible = [r for r in results if not r.get("alertEligible")]
    eligible.sort(
        key=lambda r: (
            -float(r.get("rankingScore") or 0),
            -float(r.get("confidence") or 0),
            int(r.get("marketCapRank") or 999),
        )
    )
    for index, row in enumerate(eligible, start=1):
        row["rank"] = index
    for row in ineligible:
        row["rank"] = 0
    return [*eligible, *ineligible]


def _alert_eligibility(
    *,
    action: str,
    confidence: float,
    grade: str,
    risk_reward: float | None,
    data_health_ok: bool,
    trade_permission: str,
) -> tuple[bool, list[str]]:
    blocks: list[str] = []
    if action == "WAIT":
        blocks.append("Action is WAIT")
    if confidence < 75:
        blocks.append(f"Confidence {confidence} < min 75")
    grade_order = {"A": 0, "B": 1, "C": 2, "D": 3}
    if grade_order.get(grade, 99) > grade_order["B"]:
        blocks.append(f"Grade {grade} below min B")
    if not data_health_ok:
        blocks.append("Data health is not OK")
    if risk_reward is not None and risk_reward < 1.5:
        blocks.append(f"R:R {risk_reward:.2f} < min 1.5")
    if action != "WAIT":
        if trade_permission == "no_trade":
            blocks.append(f"Trade permission {trade_permission} conflicts with {action}")
        elif action == "LONG" and trade_permission == "short_only":
            blocks.append(f"Trade permission {trade_permission} conflicts with {action}")
        elif action == "SHORT" and trade_permission == "long_only":
            blocks.append(f"Trade permission {trade_permission} conflicts with {action}")
    return (len(blocks) == 0, blocks)


def _normalize_grade(raw: Any) -> str:
    value = str(raw or "D").upper().strip()
    if value.startswith("A"):
        return "A"
    if value in _VALID_GRADES:
        return value
    return "D"


def _normalize_regime(raw: Any) -> str:
    if raw is None:
        return "unknown"
    value = str(raw).strip()
    lower = value.lower().replace(" ", "_")
    if lower in _VALID_REGIMES:
        return lower
    upper = value.upper()
    return {
        "BULLISH_TREND": "bullish_trend",
        "BEARISH_TREND": "bearish_trend",
        "RANGE": "range",
        "RANGING": "range",
        "CHOP_HIGH_RISK": "choppy",
        "CHOPPY": "choppy",
        "VOLATILE": "volatile",
        "TRENDING": "unknown",
        "TRANSITION": "choppy",
        "INSUFFICIENT_DATA": "unknown",
    }.get(upper, "unknown")


def _normalize_permission(raw: Any, *, action: str) -> str:
    if raw is not None:
        value = str(raw).strip().lower()
        if value in _VALID_PERMISSIONS:
            return value
    if action == "LONG":
        return "long_only"
    if action == "SHORT":
        return "short_only"
    return "no_trade"


def _normalize_data_health(raw: Any, *, symbol: str) -> dict[str, Any]:
    src = raw if isinstance(raw, dict) else {}
    symbol_info = src.get("symbol") if isinstance(src.get("symbol"), dict) else {}
    provided = bool(symbol_info.get("provided", bool(symbol)))
    valid = bool(symbol_info.get("valid", bool(symbol)))
    symbol_reason = symbol_info.get("reason")

    def tf(key: str, *, required: bool = True) -> dict[str, Any]:
        block = src.get(key) if isinstance(src.get(key), dict) else {}
        candle_count = int(block.get("candleCount") or 0)
        min_required = int(block.get("minCandlesRequired") or block.get("minRequired") or 50)
        age = block.get("lastCandleAgeSec")
        if age is None:
            age = block.get("ageSec")
        age_val = None if age is None else int(age)
        max_age = int(block.get("maxAgeSec") or 3600)
        reason = block.get("reason")
        ok_flag = block.get("ok")
        if ok_flag is None:
            fresh = block.get("fresh")
            count_ok = candle_count >= min_required if candle_count else True
            age_ok = age_val is None or age_val <= max_age
            if fresh is not None:
                ok_flag = bool(fresh) and count_ok
            else:
                ok_flag = count_ok and age_ok
            if not ok_flag and reason is None:
                reason = "timeframe unhealthy"
        return {
            "required": bool(block.get("required", required)),
            "candleCount": candle_count,
            "minCandlesRequired": min_required,
            "lastCandleAgeSec": age_val,
            "maxAgeSec": max_age,
            "ok": bool(ok_flag),
            "reason": reason,
        }

    def aux(key: str, default_max_age: int) -> dict[str, Any]:
        block = src.get(key) if isinstance(src.get(key), dict) else {}
        available = bool(block.get("available", False))
        age = block.get("ageSec")
        age_val = None if age is None else int(age)
        max_age = int(block.get("maxAgeSec") or default_max_age)
        ok_flag = block.get("ok")
        if ok_flag is None:
            ok_flag = True if not available else (age_val is None or age_val <= max_age)
        return {
            "available": available,
            "ageSec": age_val,
            "maxAgeSec": max_age,
            "ok": bool(ok_flag),
        }

    setup = tf("setup")
    macro = tf("macro")
    trigger = tf("trigger")
    funding = aux("funding", 9 * 3600)
    open_interest = aux("openInterest", 15 * 60)
    reasons = _as_str_list(src.get("reasons"))
    ok = (
        bool(src.get("ok"))
        if "ok" in src
        else (provided and valid and setup["ok"] and macro["ok"] and trigger["ok"])
    )
    confidence_cap = int(src.get("confidenceCap") or (100 if ok else 60))

    return {
        "ok": ok,
        "symbol": {"provided": provided, "valid": valid, "reason": symbol_reason},
        "setup": setup,
        "macro": macro,
        "trigger": trigger,
        "funding": funding,
        "openInterest": open_interest,
        "reasons": reasons,
        "confidenceCap": confidence_cap,
    }


def _build_freshness(
    raw: dict[str, Any] | None,
    data_health: dict[str, Any],
    *,
    evaluated_at: int,
    candle_close_time: int | None,
) -> dict[str, Any]:
    if raw:
        return {
            "setupCandleAgeSec": _as_optional_int(raw.get("setupCandleAgeSec")),
            "macroCandleAgeSec": _as_optional_int(raw.get("macroCandleAgeSec")),
            "triggerCandleAgeSec": _as_optional_int(raw.get("triggerCandleAgeSec")),
            "fundingAgeSec": _as_optional_int(raw.get("fundingAgeSec")),
            "openInterestAgeSec": _as_optional_int(raw.get("openInterestAgeSec")),
        }

    setup_age = data_health.get("setup", {}).get("lastCandleAgeSec")
    if setup_age is None and candle_close_time is not None:
        setup_age = max(0, int((evaluated_at - candle_close_time) / 1000))

    return {
        "setupCandleAgeSec": setup_age,
        "macroCandleAgeSec": data_health.get("macro", {}).get("lastCandleAgeSec"),
        "triggerCandleAgeSec": data_health.get("trigger", {}).get("lastCandleAgeSec"),
        "fundingAgeSec": data_health.get("funding", {}).get("ageSec"),
        "openInterestAgeSec": data_health.get("openInterest", {}).get("ageSec"),
    }


def _resolve_candle_close_time(
    signal: dict[str, Any],
    analysis: dict[str, Any],
    data_health: dict[str, Any],
    *,
    evaluated_at: int,
) -> int | None:
    setup = data_health.get("setup") if isinstance(data_health.get("setup"), dict) else {}
    for key in ("newestCloseTimeMs", "lastCandleCloseTimeMs"):
        value = setup.get(key)
        if isinstance(value, (int, float)) and math.isfinite(float(value)):
            return int(value)

    for source in (signal, analysis):
        for key in ("candleCloseTime", "closeTime", "newestCloseTimeMs"):
            value = source.get(key)
            if isinstance(value, (int, float)) and math.isfinite(float(value)):
                return int(value)

    age = setup.get("lastCandleAgeSec")
    if age is None:
        age = setup.get("ageSec")
    if isinstance(age, (int, float)) and math.isfinite(float(age)):
        return int(evaluated_at - max(0, float(age)) * 1000)

    return None


def _base_asset(symbol: str) -> str:
    value = (symbol or "").upper().replace("-", "/")
    if "/" in value:
        return value.split("/", 1)[0]
    if value.endswith("USDT") and len(value) > 4:
        return value[:-4]
    return value or "UNKNOWN"


def _quote_asset(symbol: str) -> str:
    value = (symbol or "").upper().replace("-", "/")
    if "/" in value:
        parts = value.split("/", 1)
        return parts[1] or "USDT"
    if value.endswith("USDT"):
        return "USDT"
    return "USDT"


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None and str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _as_float(*values: Any, default: float = 0.0) -> float:
    for value in values:
        if value is None or value == "":
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def _as_optional_float(*values: Any) -> float | None:
    for value in values:
        if value is None or value == "":
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _as_optional_int(*values: Any) -> int | None:
    for value in values:
        if value is None or value == "":
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _first_number(*values: Any) -> float | None:
    return _as_optional_float(*values)
