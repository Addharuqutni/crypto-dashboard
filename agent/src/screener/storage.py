from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


# Append-only files are rewritten in full on every screener cycle, so without a
# cap they grow for the life of the deployment. Oldest rows are dropped.
#
# WHY this has a side effect worth knowing: `action-calls.json` is not just a log,
# it is also the alert-cooldown source read by `evaluate_alerts`
# (see src/screener/policy.py). Once a triggered alert ages out of this file it
# stops blocking its symbol, so the effective cooldown window is bounded by
# SCREENER_ACTION_CALL_MAX_ROWS as well as by SCREENER_ALERT_COOLDOWN_MINUTES.
# With the 5000 default that is not reachable in practice, but lowering the cap
# weakens cooldown silently. Tests in test_storage_retention.py pin this down.
DEFAULT_MAX_ROWS = 5000


class AtomicJsonStore:
    DEFAULT_MAX_ROWS = DEFAULT_MAX_ROWS

    def __init__(
        self,
        root: Path,
        *,
        history_max_rows: int | None = None,
        action_call_max_rows: int | None = None,
    ):
        self.root = root
        self.history_max_rows = self.DEFAULT_MAX_ROWS if history_max_rows is None else int(history_max_rows)
        self.action_call_max_rows = self.DEFAULT_MAX_ROWS if action_call_max_rows is None else int(action_call_max_rows)
        self.root.mkdir(parents=True, exist_ok=True)

    def _read_list(self, name: str) -> list[dict[str, Any]]:
        path = self.root / name
        if not path.exists():
            return []
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return []
        return value if isinstance(value, list) else []

    def _write_json(self, name: str, value: Any) -> None:
        target = self.root / name
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        os.replace(temporary, target)

    def read_latest(self) -> dict[str, Any] | None:
        path = self.root / "latest.json"
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    def write_latest(self, value: dict[str, Any]) -> None:
        self._write_json("latest.json", value)

    def read_history(self) -> list[dict[str, Any]]:
        return self._read_list("history.json")

    def append_history(self, value: dict[str, Any]) -> None:
        self._write_json("history.json", self._retain([*self.read_history(), value], self.history_max_rows))

    def read_action_calls(self) -> list[dict[str, Any]]:
        return self._read_list("action-calls.json")

    def append_action_call(self, value: dict[str, Any]) -> None:
        self._write_json(
            "action-calls.json",
            self._retain([*self.read_action_calls(), value], self.action_call_max_rows),
        )

    @staticmethod
    def _retain(rows: list[dict[str, Any]], max_rows: int) -> list[dict[str, Any]]:
        """Keep the newest `max_rows` in their original order (oldest first)."""
        if max_rows <= 0:
            return rows
        return rows[-max_rows:]
