from __future__ import annotations

import signal
import time
from pathlib import Path

from src.config import load_settings

from .engine import run_screener
from .lock import RunAlreadyActive, RunLock

_running = True


def _stop(_signum: int, _frame: object) -> None:
    global _running
    _running = False


def main() -> None:
    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    while _running:
        settings = load_settings()
        lock = RunLock(Path(settings.screener_storage_dir) / "screener.lock")
        try:
            with lock:
                run_screener()
        except RunAlreadyActive:
            pass
        except Exception as error:  # noqa: BLE001 - worker must survive a failed cycle
            print(f"[python.screener] cycle failed: {error}", flush=True)

        interval_seconds = max(60, settings.screener_interval_minutes * 60)
        for _ in range(interval_seconds):
            if not _running:
                return
            time.sleep(1)


if __name__ == "__main__":
    main()
