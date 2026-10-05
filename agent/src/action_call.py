from dataclasses import dataclass

from src.analyzer import ACTION_SIGNALS, AnalysisResult, signal_direction

__all__ = [
    "ACTION_SIGNALS",
    "ENTRY_ORDER_TYPE",
    "ENTRY_VALID_BARS",
    "ActionCall",
    "build_action_call",
    "format_action_call",
    "action_call_to_dict",
    "signal_direction",
]

# Option 1 of the walk-forward study: rest a post-only limit at the signal price
# instead of taking the market. Over 12,435 identical 5m entries, per-leg fee
# accounting puts the entry leg at 0.05% taker vs 0.02% maker per side, which
# moves the fee from 0.0404 R to 0.0248 R and net expectancy from -0.0312 R to
# -0.0156 R (t -6.24 -> -3.12).
#
# It does NOT make this strategy profitable. Break-even still needs fees at 37%
# of the current schedule, and the signal remains net-negative. Do not read the
# improvement as an edge.
#
# Why a resting limit is a fair model here: price traded back through the signal
# price within 1 bar 98.1% of the time, 3 bars 98.9%, 6 bars 99.3%, 12 bars
# 99.6%, 24 bars 99.7%. That measures "the level was touched" and is therefore an
# upper bound on a fill - queue position at the touch is not modelled, so a
# limit resting exactly at the last traded price may sit unfilled. ENTRY_VALID_BARS
# bounds that risk: cancel the order rather than let it fill into a stale setup.
#
# Binance USDⓈ-M spells post-only as `timeInForce=GTX`; ccxt spells it
# `postOnly=True`. Verify against the exchange docs before wiring real orders -
# this repo has no execution layer, so nothing here places anything.
ENTRY_ORDER_TYPE = "POST_ONLY_LIMIT"
ENTRY_VALID_BARS = 6


@dataclass(frozen=True)
class ActionCall:
    symbol: str
    timeframe: str
    action: str
    signal: str
    entry_price: float
    realtime_price: float | None
    take_profit: float
    stop_loss: float
    risk_reward: float | None
    status: str
    # How the entry must be placed to earn the fee the numbers above assume.
    # `entry_price` is already the limit price, so no second field is needed.
    entry_order_type: str


def build_action_call(result: AnalysisResult, realtime_price: float | None = None) -> ActionCall | None:
    action = signal_direction(result.signal)
    if not action:
        return None

    if result.price is None or result.take_profit is None or result.stop_loss is None:
        return None
    if result.risk_reward is not None and result.risk_reward < 1.0:
        return None

    return ActionCall(
        symbol=result.symbol,
        timeframe=result.timeframe,
        action=action,
        signal=result.signal,
        entry_price=result.price,
        realtime_price=realtime_price,
        take_profit=result.take_profit,
        stop_loss=result.stop_loss,
        risk_reward=result.risk_reward,
        status="WAIT_CONFIRMATION" if result.signal.endswith("WATCH") else "READY",
        entry_order_type=ENTRY_ORDER_TYPE,
    )


def format_action_call(result: AnalysisResult, realtime_price: float | None = None) -> str:
    action_call = build_action_call(result, realtime_price)
    if action_call is None:
        return "Action Call: None"

    return f"""
Action Call:
Symbol: {action_call.symbol}
Timeframe: {action_call.timeframe}
Action: {action_call.action}
Signal: {action_call.signal}
Status: {action_call.status}
Entry Price: {action_call.entry_price}
Entry Order: {action_call.entry_order_type} (limit at the entry price, cancel if unfilled after {ENTRY_VALID_BARS} bars)
Realtime Price: {action_call.realtime_price}
Take Profit: {action_call.take_profit}
Stop Loss: {action_call.stop_loss}
Risk/Reward: {action_call.risk_reward}
""".strip()


def action_call_to_dict(result: AnalysisResult, realtime_price: float | None = None) -> dict | None:
    action_call = build_action_call(result, realtime_price)
    if action_call is None:
        return None

    return {
        "symbol": action_call.symbol,
        "timeframe": action_call.timeframe,
        "action": action_call.action,
        "signal": action_call.signal,
        "status": action_call.status,
        "entry_price": action_call.entry_price,
        "entry_order_type": action_call.entry_order_type,
        "realtime_price": action_call.realtime_price,
        "take_profit": action_call.take_profit,
        "stop_loss": action_call.stop_loss,
        "risk_reward": action_call.risk_reward,
    }
