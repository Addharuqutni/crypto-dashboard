from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


class AtomicJsonStore:
    def __init__(self, root: Path):
        self.root = root
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
        self._write_json("history.json", [*self.read_history(), value])

    def read_action_calls(self) -> list[dict[str, Any]]:
        return self._read_list("action-calls.json")

    def append_action_call(self, value: dict[str, Any]) -> None:
        self._write_json("action-calls.json", [*self.read_action_calls(), value])
