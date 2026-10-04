"""`run_screener` must parallelise symbol evaluation without changing its output.

`SCREENER_MAX_CONCURRENT_SYMBOLS` was documented in four places but never read,
so every cycle walked the universe one symbol at a time. The hard requirement is
that the snapshot is byte-identical to a sequential run: ranking depends on the
order rows are produced in, so results are reassembled in `targets` order after
the futures drain.
"""

from __future__ import annotations

import threading
import time
from typing import Any
from unittest.mock import patch

import pytest

from src.config import load_settings
from src.screener.engine import _evaluate_symbols, run_screener
from src.screener.policy import AlertPolicySettings

SYMBOLS = ["AAA/USDT", "BBB/USDT", "CCC/USDT", "DDD/USDT", "EEE/USDT", "FFF/USDT"]

# Descending delays: later symbols finish first, so completion order cannot
# accidentally match submission order.
DELAYS = {"AAA/USDT": 0.09, "BBB/USDT": 0.07, "CCC/USDT": 0.05, "DDD/USDT": 0.03, "EEE/USDT": 0.02, "FFF/USDT": 0.01}


def _payload(symbol: str, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "ok": True,
        "symbol": symbol,
        "timeframe": "1h",
        "analysis": {"price": 100.0, "adx": 30.0, "regime": "TRENDING", "trend": "UP"},
        "actionCall": {
            "action": "LONG",
            "status": "READY",
            "entry_price": 100.0,
            "stop_loss": 95.0,
            "take_profit": 110.0,
            "risk_reward": 2.0,
        },
        "signal": {
            "action": "LONG",
            "confidence": 85,
            "grade": "A",
            "signalGrade": "A",
            "entryZone": {"min": 100.0, "max": 100.0},
            "stopLoss": 95.0,
            "takeProfits": {"tp1": 110.0, "tp2": None, "tp3": None},
            "riskRewardRatio": 2.0,
            "marketRegime": "bullish_trend",
            "tradePermission": "long_only",
            "mtfAlignmentScore": 90,
            "reasons": ["trend aligned"],
            "noTradeReasons": [],
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
    for key, value in overrides.items():
        base[key] = value
    return base


def _analyze(symbol: str) -> dict[str, Any]:
    """Slow, order-perturbing stand-in for analyze_symbol_payload."""
    time.sleep(DELAYS.get(symbol, 0.01))
    return _payload(symbol)


def _analyze_with_failure(failing: str) -> Any:
    def analyze(symbol: str) -> dict[str, Any]:
        time.sleep(DELAYS.get(symbol, 0.01))
        if symbol == failing:
            raise RuntimeError(f"boom {symbol}")
        return _payload(symbol)

    return analyze


def _policy() -> AlertPolicySettings:
    """Default policy; `_evaluate_symbols` only needs it to stamp alert eligibility."""
    return AlertPolicySettings()


def _run(tmp_path, name: str, concurrency: int, analyze=_analyze):
    storage = tmp_path / name
    storage.mkdir(parents=True, exist_ok=True)
    with patch.dict("os.environ", {"SCREENER_STORAGE_DIR": str(storage)}):
        settings = load_settings()
        settings = type(settings)(
            **{
                **settings.__dict__,
                "screener_max_concurrent_symbols": concurrency,
                "screener_storage_dir": str(storage),
            }
        )
        with (
            patch("src.screener.engine.load_settings", return_value=settings),
            patch("src.screener.engine.analyze_symbol_payload", side_effect=analyze),
        ):
            return run_screener(list(SYMBOLS))


def _normalise(snapshot: dict[str, Any]) -> dict[str, Any]:
    return {
        "results": [
            {key: value for key, value in row.items() if key not in {"evaluatedAt", "candleCloseTime"}}
            for row in snapshot["results"]
        ],
        "errors": snapshot["health"]["errors"],
        "evaluatedSymbols": snapshot["health"]["evaluatedSymbols"],
        "failedSymbols": snapshot["health"]["failedSymbols"],
        "status": snapshot["health"]["status"],
        "universeSize": snapshot["universeSize"],
    }


# --- equivalence -------------------------------------------------------------


def test_concurrency_one_matches_the_sequential_baseline(tmp_path):
    """max_workers=1 must be exactly the old one-symbol-at-a-time loop."""
    snapshot = _run(tmp_path, "c1", 1)

    assert [row["symbol"] for row in snapshot["results"]] == list(SYMBOLS)
    assert snapshot["health"]["errors"] == []
    assert snapshot["health"]["evaluatedSymbols"] == len(SYMBOLS)
    assert snapshot["health"]["status"] == "completed"


def test_parallel_results_are_identical_to_sequential(tmp_path):
    """The core requirement: same rows, same order, same ranks, same errors."""
    sequential = _normalise(_run(tmp_path, "seq", 1))
    parallel = _normalise(_run(tmp_path, "par", 6))

    assert parallel == sequential
    assert [row["rank"] for row in parallel["results"]] == list(range(1, len(SYMBOLS) + 1))


def test_result_order_follows_targets_not_completion_order(tmp_path):
    """Completion order is reversed by DELAYS; output order must not be."""
    snapshot = _run(tmp_path, "ordered", 6)

    assert [row["symbol"] for row in snapshot["results"]] == list(SYMBOLS)
    assert [row["symbol"] for row in snapshot["results"]] != sorted(
        (row["symbol"] for row in snapshot["results"]),
        key=lambda symbol: DELAYS[symbol],
    )


@pytest.mark.parametrize("concurrency", [2, 3, 6])
def test_every_concurrency_level_agrees_with_sequential(tmp_path, concurrency):
    sequential = _normalise(_run(tmp_path, f"seq{concurrency}", 1))

    assert _normalise(_run(tmp_path, f"par{concurrency}", concurrency)) == sequential


# --- resilience --------------------------------------------------------------


def test_one_failing_symbol_is_isolated_into_errors(tmp_path):
    snapshot = _run(tmp_path, "fail", 6, analyze=_analyze_with_failure("CCC/USDT"))

    assert [row["symbol"] for row in snapshot["results"]] == [
        symbol for symbol in SYMBOLS if symbol != "CCC/USDT"
    ]
    assert snapshot["health"]["errors"] == [{"symbol": "CCC/USDT", "message": "boom CCC/USDT"}]
    assert snapshot["health"]["evaluatedSymbols"] == len(SYMBOLS) - 1
    assert snapshot["health"]["failedSymbols"] == 1
    assert snapshot["health"]["status"] == "completed_with_errors"


def test_failure_ordering_is_deterministic_across_runs(tmp_path):
    first = _normalise(_run(tmp_path, "f1", 6, analyze=_analyze_with_failure("BBB/USDT")))
    second = _normalise(_run(tmp_path, "f2", 6, analyze=_analyze_with_failure("BBB/USDT")))

    assert first == second


def test_every_symbol_failing_still_produces_a_snapshot(tmp_path):
    def always_fail(symbol: str):
        raise RuntimeError("exchange down")

    snapshot = _run(tmp_path, "allfail", 4, analyze=always_fail)

    assert snapshot["results"] == []
    assert snapshot["health"]["failedSymbols"] == len(SYMBOLS)
    assert snapshot["health"]["status"] == "failed"
    assert len(snapshot["health"]["errors"]) == len(SYMBOLS)


def test_empty_target_list_is_a_no_op():
    """An empty universe must not spin up a pool or call the analyzer."""
    results, errors = _evaluate_symbols([], evaluated_at=0, max_workers=4, policy=_policy())

    assert results == []
    assert errors == []


def test_workers_really_do_run_concurrently(tmp_path):
    """Guard against a silent regression to sequential that still passes order tests."""
    barrier = threading.Barrier(3, timeout=5)
    active = 0
    peak = 0
    lock = threading.Lock()

    def counting_analyze(symbol: str):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        try:
            barrier.wait()
        except threading.BrokenBarrierError:
            pass
        finally:
            with lock:
                active -= 1
        return _payload(symbol)

    _run(tmp_path, "concurrent", 3, analyze=counting_analyze)

    assert peak == 3, "three workers should be in flight at once"


# --- configuration -----------------------------------------------------------


def test_concurrency_env_is_read_and_defaults_to_three(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("SCREENER_MAX_CONCURRENT_SYMBOLS", raising=False)
    assert load_settings().screener_max_concurrent_symbols == 3

    monkeypatch.setenv("SCREENER_MAX_CONCURRENT_SYMBOLS", "7")
    assert load_settings().screener_max_concurrent_symbols == 7


@pytest.mark.parametrize("value", ["0", "-1"])
def test_concurrency_env_rejects_values_below_one(monkeypatch: pytest.MonkeyPatch, value):
    monkeypatch.setenv("SCREENER_MAX_CONCURRENT_SYMBOLS", value)

    with pytest.raises(ValueError):
        load_settings()


def test_concurrency_env_rejects_more_than_sixteen(monkeypatch: pytest.MonkeyPatch):
    """Fail fast rather than silently clamping: a typo'd 64 must not look accepted."""
    monkeypatch.setenv("SCREENER_MAX_CONCURRENT_SYMBOLS", "64")

    with pytest.raises(ValueError):
        load_settings()

    monkeypatch.setenv("SCREENER_MAX_CONCURRENT_SYMBOLS", "16")
    assert load_settings().screener_max_concurrent_symbols == 16
