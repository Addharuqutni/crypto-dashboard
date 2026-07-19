from src.screener.policy import AlertPolicySettings, evaluate_alerts


def candidate(symbol: str, score: float = 90.0) -> dict:
    return {
        "symbol": symbol,
        "action": "LONG",
        "confidence": score,
        "rankingScore": score,
        "grade": "A",
        "riskReward": 2.0,
        "entry": 100.0,
        "stopLoss": 95.0,
    }


def test_policy_applies_cooldown_and_hourly_cap_without_mutating_candidates():
    items = [candidate("BTC/USDT"), candidate("ETH/USDT"), candidate("SOL/USDT")]
    settings = AlertPolicySettings(
        enabled=True, min_confidence=75, min_grade="B", min_risk_reward=1.5,
        cooldown_minutes=60, max_alerts_per_hour=2,
    )
    recent = [{"symbol": "BTC/USDT", "action": "LONG", "status": "triggered", "createdAt": 9_500}]

    decisions = evaluate_alerts(items, settings=settings, now_ms=10_000, recent_alerts=recent)

    assert [item["status"] for item in decisions] == ["suppressed_cooldown", "triggered", "suppressed_hourly_cap"]
    assert "status" not in items[0]


def test_policy_rejects_wait_and_low_quality_candidates():
    settings = AlertPolicySettings(enabled=True, min_confidence=75, min_grade="B", min_risk_reward=1.5)
    wait = {**candidate("BTC/USDT"), "action": "WAIT"}
    weak = {**candidate("ETH/USDT"), "confidence": 50}

    decisions = evaluate_alerts([wait, weak], settings=settings, now_ms=10_000, recent_alerts=[])

    assert [item["status"] for item in decisions] == ["skipped", "suppressed_low_quality"]
