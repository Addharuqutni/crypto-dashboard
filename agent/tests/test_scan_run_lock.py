"""`/api/v1/scan` must take the same RunLock as `/api/v1/screener/run`.

Without it, two concurrent scans both read-modify-write the same JSON store
(`AtomicJsonStore.append_history`) and one update is lost.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException

from src.screener.lock import RunLock
from src.web import api_screener_run, api_v1_scan


def test_scan_rejects_a_second_concurrent_run_with_409(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    lock_path = tmp_path / "screener.lock"

    with RunLock(lock_path):  # a cycle is already in flight
        with patch("src.web.run_screener") as mock_run:
            with pytest.raises(HTTPException) as exc_info:
                api_v1_scan({"symbols": ["BTC/USDT"]})

    assert exc_info.value.status_code == 409
    assert "already active" in str(exc_info.value.detail)
    mock_run.assert_not_called()


def test_scan_holds_the_lock_while_the_screener_runs(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    lock_path = tmp_path / "screener.lock"
    observed: dict[str, bool] = {}

    def fake_run(symbols=None):
        observed["locked"] = lock_path.exists()
        return {"completedAt": 1, "results": []}

    with patch("src.web.run_screener", side_effect=fake_run):
        response = api_v1_scan({"symbols": ["BTC/USDT"]})

    assert observed["locked"] is True, "run_screener must execute under the lock"
    assert response == {"ok": True, "latest": {"completedAt": 1, "results": []}}
    assert not lock_path.exists(), "lock must be released after the run"


def test_scan_releases_the_lock_when_the_screener_fails(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    lock_path = tmp_path / "screener.lock"

    with patch("src.web.run_screener", side_effect=RuntimeError("boom")):
        with pytest.raises(HTTPException) as exc_info:
            api_v1_scan({"symbols": ["BTC/USDT"]})

    assert exc_info.value.status_code == 502
    assert not lock_path.exists(), "a failed run must not leave a stale lock"


def test_scan_and_screener_run_share_one_lock_file(tmp_path, monkeypatch):
    """The two endpoints must contend for the same lock, not separate ones."""
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))
    lock_path = tmp_path / "screener.lock"

    with RunLock(lock_path):
        with patch("src.web.run_screener") as mock_run:
            with pytest.raises(HTTPException) as scan_exc:
                api_v1_scan({"symbols": ["BTC/USDT"]})
            with pytest.raises(HTTPException) as run_exc:
                api_screener_run({"symbols": ["BTC/USDT"]})

    assert scan_exc.value.status_code == 409
    assert run_exc.value.status_code == 409
    mock_run.assert_not_called()


def test_scan_still_rejects_a_non_list_symbols_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("SCREENER_STORAGE_DIR", str(tmp_path))

    with patch("src.web.run_screener") as mock_run:
        with pytest.raises(HTTPException) as exc_info:
            api_v1_scan({"symbols": "BTC/USDT"})

    assert exc_info.value.status_code == 400
    mock_run.assert_not_called()
    assert not (tmp_path / "screener.lock").exists(), "validation must happen before the lock is taken"