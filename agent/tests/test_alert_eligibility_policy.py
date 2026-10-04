"""Alert eligibility must honour the configured policy, not hardcoded limits.

_alert_eligibility previously hardcoded 75 / "B" / 1.5, so changing
SCREENER_MIN_CONFIDENCE / _GRADE / _RISK_REWARD had no effect on whether a
ranked row was marked alertEligible — evaluate_alerts() used the env values
while the per-row flag used the constants, and the two could disagree.
"""

from src.screener.engine import _alert_eligibility
from src.screener.policy import AlertPolicySettings


def _call(policy: AlertPolicySettings, **overrides):
    kwargs = dict(
        action="LONG",
        confidence=80.0,
        grade="A",
        risk_reward=2.0,
        data_health_ok=True,
        trade_permission="both",
        policy=policy,
    )
    kwargs.update(overrides)
    return _alert_eligibility(**kwargs)


def test_default_policy_matches_previous_behaviour():
    """Sanity: the default thresholds reproduce the old constants."""
    eligible, _ = _call(AlertPolicySettings())
    assert eligible is True

    blocked, reasons = _call(AlertPolicySettings(), confidence=70.0)
    assert blocked is False
    assert any("Confidence" in r for r in reasons)


def test_confidence_threshold_follows_policy():
    strict = AlertPolicySettings(min_confidence=90.0)
    blocked, reasons = _call(strict, confidence=80.0)
    assert blocked is False, "confidence 80 harus gagal saat min 90"
    assert any("min 90" in r for r in reasons)

    lenient = AlertPolicySettings(min_confidence=50.0)
    eligible, _ = _call(lenient, confidence=60.0)
    assert eligible is True, "confidence 60 harus lolos saat min 50"


def test_grade_threshold_follows_policy():
    blocked, reasons = _call(AlertPolicySettings(min_grade="A"), grade="B")
    assert blocked is False
    assert any("Grade B" in r and "min A" in r for r in reasons)

    eligible, _ = _call(AlertPolicySettings(min_grade="C"), grade="C")
    assert eligible is True


def test_risk_reward_threshold_follows_policy():
    blocked, reasons = _call(AlertPolicySettings(min_risk_reward=3.0), risk_reward=2.0)
    assert blocked is False
    assert any("min 3" in r for r in reasons)

    eligible, _ = _call(AlertPolicySettings(min_risk_reward=1.0), risk_reward=1.2)
    assert eligible is True


def test_data_health_and_permission_still_block():
    blocked, reasons = _call(AlertPolicySettings(), data_health_ok=False)
    assert blocked is False
    assert any("Data health" in r for r in reasons)

    blocked, reasons = _call(AlertPolicySettings(), trade_permission="no_trade")
    assert blocked is False
    assert any("Trade permission" in r for r in reasons)


def test_wait_action_is_never_eligible():
    blocked, reasons = _call(AlertPolicySettings(), action="WAIT")
    assert blocked is False
    assert any("WAIT" in r for r in reasons)
