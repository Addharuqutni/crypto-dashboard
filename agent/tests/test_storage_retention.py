"""Append-only JSON stores must cap their row count.

`append_history` / `append_action_call` rewrote the whole file every cycle and
never trimmed, so the files grew without bound for the life of the deployment.
Retention keeps the newest rows and preserves their order; row schemas are
untouched.
"""

from __future__ import annotations

import pytest

from src.config import load_settings
from src.screener.storage import DEFAULT_MAX_ROWS, AtomicJsonStore


def _append(store: AtomicJsonStore, count: int, *, prefix: str = "row") -> list[str]:
    ids = [f"{prefix}-{index}" for index in range(count)]
    for value in ids:
        store.append_history({"id": value, "ts": int(value.rsplit("-", 1)[1])})
    return ids


def test_append_history_trims_to_the_limit_keeping_the_newest(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=5)

    ids = _append(store, 12)

    history = store.read_history()
    assert len(history) == 5, "row count must be capped at the limit"
    assert [row["id"] for row in history] == ids[-5:], "the newest rows must survive, in order"


def test_append_action_call_trims_to_the_limit_keeping_the_newest(tmp_path):
    store = AtomicJsonStore(tmp_path, action_call_max_rows=3)

    for index in range(7):
        store.append_action_call({"id": f"call-{index}", "action": "LONG"})

    calls = store.read_action_calls()
    assert len(calls) == 3
    assert [row["id"] for row in calls] == ["call-4", "call-5", "call-6"]


def test_rows_below_the_limit_are_all_kept(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=10)

    ids = _append(store, 4)

    assert [row["id"] for row in store.read_history()] == ids


def test_a_single_row_beyond_the_limit_is_pruned_immediately(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=3)

    _append(store, 4)

    assert [row["id"] for row in store.read_history()] == ["row-1", "row-2", "row-3"]


def test_limits_are_independent_per_store(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=2, action_call_max_rows=4)

    _append(store, 6)
    for index in range(5):
        store.append_action_call({"id": f"call-{index}"})

    assert len(store.read_history()) == 2
    assert len(store.read_action_calls()) == 4


def test_row_schema_is_preserved_through_trimming(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=2)
    store.append_history({"ts": 1, "status": "completed", "topSymbol": "BTC/USDT", "topScore": 91.5})
    store.append_history({"ts": 2, "status": "failed", "topSymbol": None, "topScore": None})
    store.append_history({"ts": 3, "status": "completed", "topSymbol": "ETH/USDT", "topScore": 80.0})

    rows = store.read_history()

    assert rows == [
        {"ts": 2, "status": "failed", "topSymbol": None, "topScore": None},
        {"ts": 3, "status": "completed", "topSymbol": "ETH/USDT", "topScore": 80.0},
    ]


def test_retention_is_bounded_by_default(tmp_path):
    """A store built without explicit limits must still not grow forever."""
    store = AtomicJsonStore(tmp_path)

    assert store.history_max_rows == DEFAULT_MAX_ROWS
    assert store.action_call_max_rows == DEFAULT_MAX_ROWS


def test_limits_can_be_overridden_per_instance(tmp_path):
    store = AtomicJsonStore(tmp_path, history_max_rows=DEFAULT_MAX_ROWS + 10)

    assert store.history_max_rows == DEFAULT_MAX_ROWS + 10


@pytest.mark.parametrize(
    ("env_var", "settings_field"),
    [
        ("SCREENER_HISTORY_MAX_ROWS", "screener_history_max_rows"),
        ("SCREENER_ACTION_CALL_MAX_ROWS", "screener_action_call_max_rows"),
    ],
)
def test_retention_limits_are_configurable_via_env(monkeypatch: pytest.MonkeyPatch, env_var, settings_field):
    monkeypatch.setenv(env_var, "42")

    assert getattr(load_settings(), settings_field) == 42


@pytest.mark.parametrize("env_var", ["SCREENER_HISTORY_MAX_ROWS", "SCREENER_ACTION_CALL_MAX_ROWS"])
def test_retention_limit_defaults_to_5000(monkeypatch: pytest.MonkeyPatch, env_var):
    monkeypatch.delenv(env_var, raising=False)

    settings = load_settings()

    assert settings.screener_history_max_rows == 5000
    assert settings.screener_action_call_max_rows == 5000
    assert DEFAULT_MAX_ROWS == 5000
