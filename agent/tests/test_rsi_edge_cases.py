"""RSI must stay defined on one-sided windows.

A purely rising series drives avg_loss to 0; a purely falling one drives
avg_gain to 0. The original implementation turned both into NaN via
`avg_loss.replace(0, np.nan)`, and `add_indicators` then called dropna(),
discarding the whole frame — so the engine failed on the most directional
input it could receive, with a misleading "raise FETCH_LIMIT" error.
"""

import numpy as np
import pandas as pd
import pytest

from src.indicators import _rsi


def test_rsi_is_100_on_pure_uptrend():
    close = pd.Series(np.arange(100, 220, dtype=float))
    rsi = _rsi(close, 14)
    tail = rsi.iloc[14:]
    assert tail.notna().all(), "RSI harus terdefinisi setelah periode pemanasan"
    assert tail.iloc[-1] == pytest.approx(100.0)


def test_rsi_is_0_on_pure_downtrend():
    close = pd.Series(np.arange(220, 100, -1, dtype=float))
    rsi = _rsi(close, 14)
    tail = rsi.iloc[14:]
    assert tail.notna().all()
    assert tail.iloc[-1] == pytest.approx(0.0)


def test_rsi_is_50_on_flat_series():
    close = pd.Series([100.0] * 120)
    rsi = _rsi(close, 14)
    tail = rsi.iloc[14:]
    assert tail.notna().all()
    assert tail.iloc[-1] == pytest.approx(50.0)


def test_rsi_stays_in_bounds_on_mixed_series():
    rng = np.random.default_rng(seed=7)
    close = pd.Series(100 + rng.normal(0, 1, 200).cumsum())
    rsi = _rsi(close, 14).dropna()
    assert not rsi.empty
    assert rsi.between(0.0, 100.0).all()


def test_uptrend_survives_add_indicators():
    """The whole pipeline must not discard a monotonic series."""
    from src.config import load_strategy_config
    from src.indicators import add_indicators

    # ema_slow is 200 in config.yaml, so the series must exceed it.
    n = 400
    base = np.arange(100, 100 + n, dtype=float)
    df = pd.DataFrame(
        {
            "open_time": np.arange(n),
            "open": base,
            "high": base + 1.0,
            "low": base - 1.0,
            "close": base,
            "volume": np.full(n, 10.0),
        }
    )
    enriched = add_indicators(df, load_strategy_config())
    assert len(enriched) >= 2, "tren naik monoton tidak boleh dianggap 'data kurang'"
    assert enriched["rsi"].notna().all()
    assert enriched["rsi"].iloc[-1] == pytest.approx(100.0)
