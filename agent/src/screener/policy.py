from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AlertPolicySettings:
    enabled: bool = True
    min_confidence: float = 75.0
    min_grade: str = "B"
    min_risk_reward: float = 1.5
    cooldown_minutes: int = 10
    max_alerts_per_hour: int = 10


_GRADE_ORDER = {"A+": 0, "A": 0, "B": 1, "C": 2, "D": 3}


def evaluate_alerts(
    candidates: list[dict[str, Any]],
    *,
    settings: AlertPolicySettings,
    now_ms: int,
    recent_alerts: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    triggered = 0
    recent_triggered = _recent_count(recent_alerts, now_ms - 3_600_000)
    decisions: list[dict[str, Any]] = []
    for candidate in candidates:
        decision = dict(candidate)
        action = str(candidate.get("action", "WAIT")).upper()
        if action == "WAIT" or not settings.enabled:
            decision.update(status="skipped", reason="wait_or_alerts_disabled")
        elif not _quality_ok(candidate, settings):
            decision.update(status="suppressed_low_quality", reason="quality_threshold")
        elif _in_cooldown(candidate, recent_alerts, now_ms, settings.cooldown_minutes):
            decision.update(status="suppressed_cooldown", reason="cooldown")
        elif recent_triggered + triggered >= settings.max_alerts_per_hour:
            decision.update(status="suppressed_hourly_cap", reason="hourly_cap")
        else:
            decision.update(status="triggered", reason="policy_pass")
            triggered += 1
        decisions.append(decision)
    return decisions


def _quality_ok(candidate: dict[str, Any], settings: AlertPolicySettings) -> bool:
    try:
        return (
            float(candidate.get("confidence", 0)) >= settings.min_confidence
            and _GRADE_ORDER.get(str(candidate.get("grade", "D")), 99) <= _GRADE_ORDER[settings.min_grade]
            and float(candidate.get("riskReward", 0)) >= settings.min_risk_reward
        )
    except (TypeError, ValueError, KeyError):
        return False


def _in_cooldown(candidate: dict[str, Any], recent: list[dict[str, Any]], now_ms: int, minutes: int) -> bool:
    symbol = candidate.get("symbol")
    action = candidate.get("action")
    threshold = now_ms - minutes * 60_000
    return any(
        row.get("symbol") == symbol and row.get("action") == action and row.get("status") == "triggered"
        and _timestamp_ms(row) >= threshold for row in recent
    )


def _recent_count(recent: list[dict[str, Any]], threshold: int) -> int:
    return sum(1 for row in recent if row.get("status") == "triggered" and _timestamp_ms(row) >= threshold)


def _timestamp_ms(row: dict[str, Any]) -> int:
    value = row.get("createdAt", row.get("created_at", 0))
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number
