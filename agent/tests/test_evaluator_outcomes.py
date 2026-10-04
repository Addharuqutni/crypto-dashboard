"""Outcome evaluation for pending action calls.

Ambiguity rule under test: when one candle's range contains BOTH the take-profit
and the stop-loss, intrabar ordering is unknowable from OHLC data. The engine
takes the conservative choice and books the trade as a LOSS at the stop, so a
backtest can never be flattered by an optimistic intrabar fill.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pandas as pd
import pytest

from src.evaluator import evaluate_pending_action_calls, evaluate_row_against_candles

ENTRY_TIME = "2024-01-01T00:00:00+00:00"


def _candles(*rows: tuple[str, float, float, float]) -> pd.DataFrame:
    """Build an OHLC frame from (iso_timestamp, high, low, close) tuples."""
    return pd.DataFrame(
        [
            {
                "timestamp": pd.Timestamp(ts),
                "open": close,
                "high": high,
                "low": low,
                "close": close,
                "volume": 1.0,
            }
            for ts, high, low, close in rows
        ]
    )


def _row(**overrides) -> dict[str, Any]:
    base: dict[str, Any] = {
        "created_at": ENTRY_TIME,
        "symbol": "BTC/USDT",
        "timeframe": "5m",
        "action": "LONG",
        "entry_price": 100.0,
        "take_profit": 110.0,
        "stop_loss": 90.0,
        "risk_reward": 2.0,
    }
    base.update(overrides)
    return base


def _write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")


@pytest.fixture(autouse=True)
def _no_database(monkeypatch: pytest.MonkeyPatch):
    """Keep the postgres mirror off so tests never touch a real database."""
    monkeypatch.setenv("DATABASE_ENABLED", "false")
    monkeypatch.delenv("DATABASE_URL", raising=False)


# --- ordering rules ----------------------------------------------------------


def test_long_take_profit_hit_first_is_a_win():
    candles = _candles(
        ("2024-01-01T00:05:00+00:00", 101.0, 99.0, 100.5),   # nothing hit
        ("2024-01-01T00:10:00+00:00", 112.0, 101.0, 111.0),  # TP hit, low above SL
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "WIN"
    assert outcome["outcome_status"] == "CLOSED"
    assert outcome["outcome_price"] == 110.0
    assert outcome["pnl_percent"] == 10.0
    assert outcome["outcome_at"] == "2024-01-01T00:10:00+00:00"


def test_long_stop_loss_hit_first_is_a_loss():
    candles = _candles(
        ("2024-01-01T00:05:00+00:00", 101.0, 99.0, 100.5),
        ("2024-01-01T00:10:00+00:00", 105.0, 88.0, 92.0),     # SL hit, high below TP
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "LOSS"
    assert outcome["outcome_price"] == 90.0
    assert outcome["pnl_percent"] == -10.0


def test_both_levels_in_one_candle_resolves_conservatively_to_a_loss():
    """Ambiguous intrabar ordering must never be booked as a win."""
    candles = _candles(
        ("2024-01-01T00:05:00+00:00", 115.0, 85.0, 100.0),  # range swallows both levels
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "LOSS", "TP and SL in one candle must resolve to LOSS"
    assert outcome["outcome_price"] == 90.0, "filled at the stop, not the target"
    assert outcome["pnl_percent"] == -10.0
    assert "konservatif" in outcome["evaluation_note"]


def test_short_take_profit_hit_first_is_a_win():
    row = _row(action="SHORT", entry_price=100.0, take_profit=90.0, stop_loss=110.0)
    candles = _candles(("2024-01-01T00:05:00+00:00", 101.0, 85.0, 90.0))

    outcome = evaluate_row_against_candles(row, candles)

    assert outcome["label"] == "WIN"
    assert outcome["outcome_price"] == 90.0
    assert outcome["pnl_percent"] == 10.0


def test_short_stop_loss_hit_first_is_a_loss():
    row = _row(action="SHORT", entry_price=100.0, take_profit=90.0, stop_loss=110.0)
    candles = _candles(("2024-01-01T00:05:00+00:00", 115.0, 99.0, 112.0))

    outcome = evaluate_row_against_candles(row, candles)

    assert outcome["label"] == "LOSS"
    assert outcome["outcome_price"] == 110.0
    assert outcome["pnl_percent"] == -10.0


def test_short_both_levels_in_one_candle_also_resolves_to_a_loss():
    row = _row(action="SHORT", entry_price=100.0, take_profit=90.0, stop_loss=110.0)
    candles = _candles(("2024-01-01T00:05:00+00:00", 115.0, 85.0, 100.0))

    outcome = evaluate_row_against_candles(row, candles)

    assert outcome["label"] == "LOSS"
    assert outcome["outcome_price"] == 110.0


def test_first_touching_candle_wins_when_levels_are_hit_in_separate_bars():
    """A TP bar that arrives before any SL bar closes the trade as a win."""
    candles = _candles(
        ("2024-01-01T00:05:00+00:00", 112.0, 95.0, 111.0),  # TP
        ("2024-01-01T00:10:00+00:00", 105.0, 80.0, 85.0),   # SL, arrives later - ignored
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "WIN"
    assert outcome["outcome_at"] == "2024-01-01T00:05:00+00:00"


# --- still open --------------------------------------------------------------


def test_a_setup_that_neither_level_reached_stays_pending():
    candles = _candles(
        ("2024-01-01T00:05:00+00:00", 105.0, 95.0, 104.0),
        ("2024-01-01T00:10:00+00:00", 106.0, 99.0, 105.0),
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "OPEN"
    assert outcome["outcome_status"] == "OPEN"
    assert outcome["outcome_price"] == 105.0
    assert outcome["pnl_percent"] == 5.0
    assert "outcome_note" not in outcome


def test_candles_at_or_before_entry_are_ignored():
    """The entry bar itself must not be able to resolve the trade."""
    candles = _candles(
        ("2024-01-01T00:00:00+00:00", 115.0, 85.0, 100.0),  # the entry bar: both levels
        ("2024-01-01T00:05:00+00:00", 104.0, 99.0, 103.0),   # after entry, nothing hit
    )

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "OPEN", "the entry bar must not count as a future candle"


def test_no_future_candles_at_all_stays_open_with_no_price():
    candles = _candles(("2024-01-01T00:00:00+00:00", 101.0, 99.0, 100.0))

    outcome = evaluate_row_against_candles(_row(), candles)

    assert outcome["label"] == "OPEN"
    assert outcome["outcome_price"] is None
    assert outcome["pnl_percent"] is None


# --- orchestration -----------------------------------------------------------


def test_evaluate_pending_action_calls_aggregates_outcomes(tmp_path, monkeypatch):
    """End-to-end over a JSONL file, with only the exchange call mocked."""
    monkeypatch.setenv("DATABASE_ENABLED", "false")
    jsonl = tmp_path / "action_calls.jsonl"
    csv_path = tmp_path / "action_calls.csv"
    _write_jsonl(
        jsonl,
        [
            _row(symbol="WIN/USDT", action="LONG", take_profit=110.0, stop_loss=90.0),
            _row(symbol="AMBIG/USDT", action="LONG", take_profit=110.0, stop_loss=90.0),
            _row(symbol="PENDING/USDT", action="LONG", take_profit=110.0, stop_loss=90.0),
        ],
    )

    def fake_fetch(self, symbol, timeframe, limit=250):
        if symbol == "WIN/USDT":
            return _candles(("2024-01-01T00:05:00+00:00", 112.0, 99.0, 111.0))
        if symbol == "AMBIG/USDT":
            return _candles(("2024-01-01T00:05:00+00:00", 115.0, 85.0, 100.0))
        return _candles(("2024-01-01T00:05:00+00:00", 104.0, 99.0, 103.0))

    with patch("src.evaluator.MarketDataClient") as client:
        client.return_value.fetch_ohlcv.side_effect = lambda *a, **k: fake_fetch(None, *a, **k)
        stats = evaluate_pending_action_calls(
            "binance",
            "5m",
            jsonl_path=jsonl,
            csv_path=csv_path,
        )

    assert stats["total"] == 3
    assert stats["win"] == 1
    assert stats["loss"] == 1
    assert stats["open"] == 1
    assert stats["errors"] == 0

    rows = [json.loads(line) for line in jsonl.read_text(encoding="utf-8").splitlines() if line]
    by_symbol = {row["symbol"]: row for row in rows}
    assert by_symbol["WIN/USDT"]["label"] == "WIN"
    assert by_symbol["AMBIG/USDT"]["label"] == "LOSS"
    assert by_symbol["AMBIG/USDT"]["outcome_price"] == 90.0
    assert by_symbol["PENDING/USDT"]["label"] == "OPEN"
    assert csv_path.exists(), "the CSV mirror must still be written"


def test_a_failing_symbol_is_counted_as_an_error_without_failing_the_batch(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_ENABLED", "false")
    jsonl = tmp_path / "action_calls.jsonl"
    _write_jsonl(
        jsonl,
        [_row(symbol="BAD/USDT"), _row(symbol="GOOD/USDT")],
    )

    def fake_fetch(self, symbol, timeframe, limit=250):
        if symbol == "BAD/USDT":
            raise RuntimeError("exchange down")
        return _candles(("2024-01-01T00:05:00+00:00", 112.0, 99.0, 111.0))

    with patch("src.evaluator.MarketDataClient") as client:
        client.return_value.fetch_ohlcv.side_effect = lambda *a, **k: fake_fetch(None, *a, **k)
        stats = evaluate_pending_action_calls(
            "binance",
            "5m",
            jsonl_path=jsonl,
            csv_path=tmp_path / "out.csv",
        )

    assert stats["errors"] == 1
    assert stats["win"] == 1

    rows = [json.loads(line) for line in jsonl.read_text(encoding="utf-8").splitlines() if line]
    by_symbol = {row["symbol"]: row for row in rows}
    assert "exchange down" in by_symbol["BAD/USDT"]["evaluation_error"]


def test_empty_dataset_short_circuits_without_touching_the_exchange(tmp_path):
    stats = evaluate_pending_action_calls(
        "binance",
        "5m",
        jsonl_path=tmp_path / "missing.jsonl",
        csv_path=tmp_path / "out.csv",
    )

    assert stats == {"total": 0, "pending": 0, "win": 0, "loss": 0, "open": 0, "expired": 0, "errors": 0}
