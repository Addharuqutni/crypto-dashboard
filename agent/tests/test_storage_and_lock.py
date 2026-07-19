import json

import pytest

from src.screener.lock import RunAlreadyActive, RunLock
from src.screener.storage import AtomicJsonStore


def test_atomic_store_writes_latest_history_and_action_calls(tmp_path):
    store = AtomicJsonStore(tmp_path)
    latest = {"completedAt": 123, "results": []}

    store.write_latest(latest)
    store.append_history({"ts": 123, "status": "completed"})
    store.append_action_call({"id": "abc", "symbol": "BTC/USDT"})

    assert store.read_latest() == latest
    assert store.read_history() == [{"ts": 123, "status": "completed"}]
    assert store.read_action_calls() == [{"id": "abc", "symbol": "BTC/USDT"}]
    assert not list(tmp_path.glob("*.tmp"))


def test_run_lock_returns_409_semantics_when_held(tmp_path):
    first = RunLock(tmp_path / "screener.lock")
    second = RunLock(tmp_path / "screener.lock")

    with first:
        with pytest.raises(RunAlreadyActive):
            second.acquire()

    assert not (tmp_path / "screener.lock").exists()
