#!/usr/bin/env python3
"""
Walk-forward backtest for the Python Action Call algorithm (MTF).

Symbols: BTC/USDT, ETH/USDT, SOL/USDT
Window: last 6 months (+ indicator warmup)
Entry TF: 5m | Confirm: 15m/30m | Trend: 1h/4h

Optimizations for 5m scan:
  - Higher TFs (15m/30m/1h/4h) pre-analyzed once per closed HTF bar (cached)
  - 5m only re-analyzed when HTF alignment is already true
  - Fees / funding / slippage NOT modelled
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import ccxt
import numpy as np
import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.action_call import build_action_call  # noqa: E402
from src.analyzer import analyze  # noqa: E402
from src.config import load_strategy_config  # noqa: E402
from src.indicators import add_indicators  # noqa: E402
from src.multi_timeframe import (  # noqa: E402
    CONFIRMATION_TIMEFRAMES,
    ENTRY_TIMEFRAME,
    TREND_TIMEFRAMES,
    _choose_entry,
    _mtf_reasons,
)

console = Console(force_terminal=False, legacy_windows=False)

SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
HTF = (*CONFIRMATION_TIMEFRAMES, *TREND_TIMEFRAMES)  # 15m, 30m, 1h, 4h
TIMEFRAMES = (ENTRY_TIMEFRAME, *HTF)
LOOKBACK_BARS = 250
MAX_HOLD = timedelta(days=7)
WARMUP = timedelta(days=60)
WINDOW = timedelta(days=180)
FETCH_LIMIT_PER_PAGE = 1000


@dataclass
class Trade:
    symbol: str
    action: str
    signal: str
    status: str
    entry_time: str
    entry_price: float
    take_profit: float
    stop_loss: float
    risk_reward: float | None
    exit_time: str | None = None
    exit_price: float | None = None
    label: str | None = None
    pnl_percent: float | None = None
    bars_held: int | None = None
    note: str | None = None


def fetch_ohlcv_range(
    exchange: ccxt.Exchange,
    symbol: str,
    timeframe: str,
    since: datetime,
    until: datetime,
) -> pd.DataFrame:
    since_ms = int(since.timestamp() * 1000)
    until_ms = int(until.timestamp() * 1000)
    rows: list[list[float]] = []
    cursor = since_ms
    empty_streak = 0

    while cursor < until_ms:
        batch = exchange.fetch_ohlcv(
            symbol,
            timeframe=timeframe,
            since=cursor,
            limit=FETCH_LIMIT_PER_PAGE,
        )
        if not batch:
            empty_streak += 1
            if empty_streak >= 3:
                break
            time.sleep(0.25)
            continue
        empty_streak = 0
        rows.extend(batch)
        last_ts = batch[-1][0]
        next_cursor = last_ts + 1
        if next_cursor <= cursor:
            break
        cursor = next_cursor
        if last_ts >= until_ms:
            break
        time.sleep(exchange.rateLimit / 1000)

    if not rows:
        raise ValueError(f"No OHLCV for {symbol} {timeframe}")

    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = df.drop_duplicates(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["open", "high", "low", "close", "volume"]).reset_index(drop=True)
    until_ts = pd.Timestamp(until)
    if until_ts.tzinfo is None:
        until_ts = until_ts.tz_localize("UTC")
    else:
        until_ts = until_ts.tz_convert("UTC")
    df = df[df["timestamp"] <= until_ts].reset_index(drop=True)
    return df


def _search_end(timestamps: np.ndarray, as_of_ns: int) -> int:
    """Return end-exclusive index of bars with timestamp <= as_of."""
    return int(np.searchsorted(timestamps, as_of_ns, side="right"))


def precompute_htf_analyses(
    symbol: str,
    enriched: dict[str, pd.DataFrame],
    config: dict,
) -> dict[str, list[Any]]:
    """Analyze every closed HTF bar once. Result[i] uses bars[0:i+1] (lookback)."""
    cache: dict[str, list[Any]] = {}
    for tf in HTF:
        df = enriched[tf]
        n = len(df)
        results: list[Any] = [None] * n
        # Start only once we have enough bars for indicators + lookback
        start_i = max(LOOKBACK_BARS - 1, 50)
        for i in range(start_i, n):
            window = df.iloc[max(0, i + 1 - LOOKBACK_BARS) : i + 1]
            if len(window) < 50:
                continue
            try:
                results[i] = analyze(symbol, tf, window, config)
            except Exception:
                results[i] = None
        cache[tf] = results
        console.print(f"  precomputed {tf}: {sum(1 for r in results if r is not None)} analyses")
    return cache


def htf_snapshot_at(
    htf_cache: dict[str, list[Any]],
    enriched: dict[str, pd.DataFrame],
    as_of: pd.Timestamp,
) -> dict[str, Any] | None:
    """Return latest closed HTF analysis for each TF at as_of."""
    as_of_ns = as_of.value
    out: dict[str, Any] = {}
    for tf in HTF:
        df = enriched[tf]
        ts = df["timestamp"].values.astype("datetime64[ns]").astype(np.int64)
        end = _search_end(ts, as_of_ns)
        if end <= 0:
            return None
        idx = end - 1
        result = htf_cache[tf][idx] if idx < len(htf_cache[tf]) else None
        if result is None:
            return None
        out[tf] = result
    return out


def try_signal_at(
    symbol: str,
    entry_df: pd.DataFrame,
    entry_ts: np.ndarray,
    htf_cache: dict[str, list[Any]],
    enriched: dict[str, pd.DataFrame],
    config: dict,
    as_of: pd.Timestamp,
) -> Any | None:
    """Fast MTF check: HTF from cache, 5m analyzed only if HTF aligned."""
    htf = htf_snapshot_at(htf_cache, enriched, as_of)
    if htf is None:
        return None

    trend_results = [htf[tf] for tf in TREND_TIMEFRAMES]
    trend_biases = {r.bias for r in trend_results}
    trend_aligned = len(trend_biases) == 1 and "NEUTRAL" not in trend_biases
    if not trend_aligned:
        return None
    trend_bias = next(iter(trend_biases))

    confirmation_results = [htf[tf] for tf in CONFIRMATION_TIMEFRAMES]
    confirmation_aligned = (
        all(r.bias == trend_bias for r in confirmation_results)
        and all(r.regime in {"TRENDING", "TRANSITION"} for r in confirmation_results)
    )
    if not confirmation_aligned:
        return None

    # Only now analyze the 5m entry window
    as_of_ns = as_of.value
    end = _search_end(entry_ts, as_of_ns)
    if end < 50:
        return None
    start = max(0, end - LOOKBACK_BARS)
    window = entry_df.iloc[start:end]
    try:
        entry = analyze(symbol, ENTRY_TIMEFRAME, window, config)
    except Exception:
        return None

    chosen = _choose_entry(entry, trend_bias, True)
    if chosen is None:
        return None

    signal = "MTF BULLISH ACTION CALL" if trend_bias == "BULLISH" else "MTF BEARISH ACTION CALL"
    return replace(
        chosen,
        signal=signal,
        bias=trend_bias,
        trend="UPTREND" if trend_bias == "BULLISH" else "DOWNTREND",
        reasons=[
            *_mtf_reasons(trend_results, confirmation_results, True, True),
            "Entry selected from 5m",
            *chosen.reasons,
        ],
    )


def simulate_exit(
    entry_price: float,
    action: str,
    take_profit: float,
    stop_loss: float,
    future: pd.DataFrame,
    max_hold: timedelta,
) -> dict[str, Any]:
    if future.empty:
        return {
            "label": "OPEN",
            "exit_price": None,
            "exit_time": None,
            "pnl_percent": None,
            "bars_held": 0,
            "note": "no future bars",
        }

    entry_ts = future.iloc[0]["timestamp"] - pd.Timedelta(minutes=5)
    deadline = entry_ts + max_hold

    for i, candle in future.iterrows():
        ts = candle["timestamp"]
        high = float(candle["high"])
        low = float(candle["low"])

        if action == "LONG":
            hit_tp = high >= take_profit
            hit_sl = low <= stop_loss
        else:
            hit_tp = low <= take_profit
            hit_sl = high >= stop_loss

        if hit_tp and hit_sl:
            return {
                "label": "LOSS",
                "exit_price": stop_loss,
                "exit_time": ts.isoformat(),
                "pnl_percent": _pnl(action, entry_price, stop_loss),
                "bars_held": int(i) + 1,
                "note": "same-candle TP+SL -> LOSS",
            }
        if hit_tp:
            return {
                "label": "WIN",
                "exit_price": take_profit,
                "exit_time": ts.isoformat(),
                "pnl_percent": _pnl(action, entry_price, take_profit),
                "bars_held": int(i) + 1,
                "note": None,
            }
        if hit_sl:
            return {
                "label": "LOSS",
                "exit_price": stop_loss,
                "exit_time": ts.isoformat(),
                "pnl_percent": _pnl(action, entry_price, stop_loss),
                "bars_held": int(i) + 1,
                "note": None,
            }
        if ts >= deadline:
            close = float(candle["close"])
            return {
                "label": "EXPIRED",
                "exit_price": close,
                "exit_time": ts.isoformat(),
                "pnl_percent": _pnl(action, entry_price, close),
                "bars_held": int(i) + 1,
                "note": f"max hold {max_hold.days}d",
            }

    last = future.iloc[-1]
    return {
        "label": "OPEN",
        "exit_price": float(last["close"]),
        "exit_time": last["timestamp"].isoformat(),
        "pnl_percent": _pnl(action, entry_price, float(last["close"])),
        "bars_held": len(future),
        "note": "end of data",
    }


def _pnl(action: str, entry: float, exit_price: float) -> float:
    if action == "LONG":
        return round((exit_price - entry) / entry * 100, 4)
    return round((entry - exit_price) / entry * 100, 4)


def backtest_symbol(
    exchange: ccxt.Exchange,
    symbol: str,
    config: dict,
    start: datetime,
    end: datetime,
    scan_step_bars: int,
) -> list[Trade]:
    fetch_from = start - WARMUP
    console.print(f"[cyan]{symbol}[/cyan] fetching {', '.join(TIMEFRAMES)} ...")

    raw: dict[str, pd.DataFrame] = {}
    for tf in TIMEFRAMES:
        raw[tf] = fetch_ohlcv_range(exchange, symbol, tf, fetch_from, end)
        console.print(f"  {tf}: {len(raw[tf])} bars")

    enriched = {tf: add_indicators(df, config) for tf, df in raw.items()}
    entry_df = enriched[ENTRY_TIMEFRAME]
    entry_ts = entry_df["timestamp"].values.astype("datetime64[ns]").astype(np.int64)

    console.print(f"  precomputing HTF analyses for {symbol} ...")
    htf_cache = precompute_htf_analyses(symbol, enriched, config)

    window_mask = (entry_df["timestamp"] >= pd.Timestamp(start)) & (
        entry_df["timestamp"] <= pd.Timestamp(end)
    )
    candidates = entry_df.loc[window_mask].reset_index(drop=True)
    if candidates.empty:
        console.print(f"[yellow]{symbol}: no bars in window[/yellow]")
        return []

    scan_indices = list(range(0, len(candidates), scan_step_bars))
    console.print(
        f"  scanning {len(scan_indices)} checkpoints "
        f"(every {scan_step_bars * 5}m) over {len(candidates)} 5m bars"
    )

    trades: list[Trade] = []
    open_until: pd.Timestamp | None = None
    signals_checked = 0

    for n, idx in enumerate(scan_indices):
        bar = candidates.iloc[idx]
        as_of = bar["timestamp"]

        if open_until is not None and as_of <= open_until:
            continue

        result = try_signal_at(symbol, entry_df, entry_ts, htf_cache, enriched, config, as_of)
        if result is None:
            continue

        signals_checked += 1
        action_call = build_action_call(result)
        if action_call is None or action_call.status != "READY":
            continue

        entry_price = float(action_call.entry_price)
        future = entry_df[entry_df["timestamp"] > as_of].reset_index(drop=True)
        outcome = simulate_exit(
            entry_price=entry_price,
            action=action_call.action,
            take_profit=float(action_call.take_profit),
            stop_loss=float(action_call.stop_loss),
            future=future,
            max_hold=MAX_HOLD,
        )

        trade = Trade(
            symbol=symbol,
            action=action_call.action,
            signal=action_call.signal,
            status=action_call.status,
            entry_time=as_of.isoformat(),
            entry_price=entry_price,
            take_profit=float(action_call.take_profit),
            stop_loss=float(action_call.stop_loss),
            risk_reward=action_call.risk_reward,
            exit_time=outcome["exit_time"],
            exit_price=outcome["exit_price"],
            label=outcome["label"],
            pnl_percent=outcome["pnl_percent"],
            bars_held=outcome["bars_held"],
            note=outcome["note"],
        )
        trades.append(trade)

        if outcome["exit_time"]:
            open_until = pd.Timestamp(outcome["exit_time"])
        else:
            open_until = as_of + MAX_HOLD

        if (n + 1) % 5000 == 0:
            console.print(f"  progress {n + 1}/{len(scan_indices)} | trades={len(trades)}")

    console.print(
        f"[green]{symbol}: {len(trades)} trades "
        f"(htf-aligned checks that reached 5m: {signals_checked})[/green]"
    )
    return trades


def summarize(trades: list[Trade]) -> dict[str, Any]:
    if not trades:
        return {"trades": 0}

    closed = [t for t in trades if t.label in {"WIN", "LOSS", "EXPIRED"}]
    wins = [t for t in closed if t.label == "WIN"]
    losses = [t for t in closed if t.label == "LOSS"]
    expired = [t for t in closed if t.label == "EXPIRED"]
    opens = [t for t in trades if t.label == "OPEN"]
    longs = [t for t in trades if t.action == "LONG"]
    shorts = [t for t in trades if t.action == "SHORT"]

    pnls = [t.pnl_percent for t in closed if t.pnl_percent is not None]
    win_pnls = [t.pnl_percent for t in wins if t.pnl_percent is not None]
    loss_pnls = [t.pnl_percent for t in losses if t.pnl_percent is not None]
    bars = [t.bars_held for t in closed if t.bars_held is not None]
    rrs = [t.risk_reward for t in trades if t.risk_reward is not None]

    total_pnl = round(sum(pnls), 4) if pnls else 0.0
    avg_pnl = round(sum(pnls) / len(pnls), 4) if pnls else None
    win_rate = round(len(wins) / len(closed) * 100, 2) if closed else None
    avg_win = round(sum(win_pnls) / len(win_pnls), 4) if win_pnls else None
    avg_loss = round(sum(loss_pnls) / len(loss_pnls), 4) if loss_pnls else None

    gross_win = sum(win_pnls) if win_pnls else 0.0
    gross_loss = abs(sum(loss_pnls)) if loss_pnls else 0.0
    profit_factor = round(gross_win / gross_loss, 3) if gross_loss > 0 else None

    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    for t in closed:
        if t.pnl_percent is None:
            continue
        equity += t.pnl_percent
        peak = max(peak, equity)
        max_dd = max(max_dd, peak - equity)

    expectancy = None
    if win_rate is not None and avg_win is not None and avg_loss is not None:
        wr = win_rate / 100
        expectancy = round(wr * avg_win + (1 - wr) * avg_loss, 4)

    return {
        "trades": len(trades),
        "closed": len(closed),
        "wins": len(wins),
        "losses": len(losses),
        "expired": len(expired),
        "open": len(opens),
        "longs": len(longs),
        "shorts": len(shorts),
        "win_rate_pct": win_rate,
        "total_pnl_pct": total_pnl,
        "avg_pnl_pct": avg_pnl,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "expectancy_pct": expectancy,
        "profit_factor": profit_factor,
        "max_drawdown_pct": round(max_dd, 4),
        "avg_bars_held": round(sum(bars) / len(bars), 1) if bars else None,
        "avg_rr": round(sum(rrs) / len(rrs), 2) if rrs else None,
        "best_trade_pct": round(max(pnls), 4) if pnls else None,
        "worst_trade_pct": round(min(pnls), 4) if pnls else None,
    }


def print_summary(title: str, stats: dict[str, Any]) -> None:
    table = Table(title=title, show_header=True, header_style="bold")
    table.add_column("Metric")
    table.add_column("Value", justify="right")
    for key, value in stats.items():
        table.add_row(key, "-" if value is None else str(value))
    console.print(table)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backtest Python Action Call MTF")
    parser.add_argument(
        "--step-bars",
        type=int,
        default=1,
        help="Evaluate every N closed 5m bars (default: 1 = every 5m)",
    )
    parser.add_argument(
        "--tag",
        type=str,
        default="",
        help="Optional filename tag, e.g. 5m or 1h",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    scan_step_bars = max(1, args.step_bars)
    tag = args.tag or f"step{scan_step_bars}"

    end = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    start = end - WINDOW
    config = load_strategy_config()

    console.print(
        Panel(
            f"Action Call MTF Backtest\n"
            f"Symbols: {', '.join(SYMBOLS)}\n"
            f"Window: {start.date()} -> {end.date()} (6 months)\n"
            f"Warmup: {WARMUP.days}d | Max hold: {MAX_HOLD.days}d\n"
            f"Scan step: every {scan_step_bars * 5} minutes on {ENTRY_TIMEFRAME}\n"
            f"MTF: entry={ENTRY_TIMEFRAME}, confirm={CONFIRMATION_TIMEFRAMES}, trend={TREND_TIMEFRAMES}\n"
            f"Fees/funding/slippage: NOT modelled",
            title="Backtest",
            border_style="blue",
        )
    )

    exchange = ccxt.binance({"enableRateLimit": True, "timeout": 30000})
    exchange.load_markets()

    all_trades: list[Trade] = []
    per_symbol: dict[str, list[Trade]] = {}

    for symbol in SYMBOLS:
        try:
            trades = backtest_symbol(exchange, symbol, config, start, end, scan_step_bars)
        except Exception as error:
            console.print(f"[red]Failed {symbol}: {error}[/red]")
            import traceback

            traceback.print_exc()
            continue
        per_symbol[symbol] = trades
        all_trades.extend(trades)

    if not all_trades:
        console.print("[red]No trades generated.[/red]")
        return 1

    out_dir = PROJECT_ROOT / "datasets" / "backtests"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = end.strftime("%Y%m%d_%H%M")
    trades_path = out_dir / f"action_call_6m_{tag}_{stamp}.jsonl"
    summary_path = out_dir / f"action_call_6m_{tag}_{stamp}_summary.json"

    with trades_path.open("w", encoding="utf-8") as fh:
        for t in all_trades:
            fh.write(json.dumps(asdict(t), ensure_ascii=False) + "\n")

    report: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "symbols": SYMBOLS,
        "algorithm": "MTF action call (5m/15m/30m/1h/4h) + build_action_call filters",
        "assumptions": {
            "entry": "signal bar close",
            "scan_step_minutes": scan_step_bars * 5,
            "one_position_per_symbol": True,
            "same_candle_tp_sl": "LOSS",
            "max_hold_days": MAX_HOLD.days,
            "min_rr_filter": 1.0,
            "watch_signals": "excluded (WAIT_CONFIRMATION skipped)",
            "ai_review": False,
            "fees_funding_slippage": "not modelled",
        },
        "overall": summarize(all_trades),
        "per_symbol": {s: summarize(ts) for s, ts in per_symbol.items()},
    }
    summary_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print_summary(f"OVERALL - BTC/ETH/SOL 6m (step {scan_step_bars * 5}m)", report["overall"])
    for symbol, stats in report["per_symbol"].items():
        print_summary(symbol, stats)

    sample = Table(title="Last 15 trades", show_header=True, header_style="bold")
    for col in ("symbol", "action", "entry_time", "entry", "tp", "sl", "label", "pnl%"):
        sample.add_column(col)
    for t in all_trades[-15:]:
        sample.add_row(
            t.symbol,
            t.action,
            t.entry_time[:16],
            f"{t.entry_price:.4f}",
            f"{t.take_profit:.4f}",
            f"{t.stop_loss:.4f}",
            t.label or "?",
            "-" if t.pnl_percent is None else f"{t.pnl_percent:+.3f}",
        )
    console.print(sample)

    console.print(f"\n[green]Saved trades -> {trades_path}[/green]")
    console.print(f"[green]Saved summary -> {summary_path}[/green]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
