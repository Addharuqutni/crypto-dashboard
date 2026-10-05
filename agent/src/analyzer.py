from dataclasses import dataclass
import pandas as pd


@dataclass
class Zone:
    low: float
    high: float
    kind: str


@dataclass
class AnalysisResult:
    symbol: str
    timeframe: str
    price: float
    trend: str
    regime: str
    signal: str
    bias: str
    rsi: float
    macd: float
    atr: float
    adx: float
    support: float
    resistance: float
    fibonacci: dict[str, float]
    order_block: Zone | None
    liquidity_sweep: str | None
    stop_loss: float | None
    take_profit: float | None
    risk_reward: float | None
    reasons: list[str]
    # Real feed stats, consumed by the data-health gate. Defaults keep older
    # callers (tests, scripts) working; production always sets them.
    candle_count: int = 0
    last_candle_close_ms: int | None = None


def round_float(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def detect_support_resistance(df: pd.DataFrame, lookback: int) -> tuple[float, float]:
    recent = df.tail(lookback)
    return float(recent["low"].min()), float(recent["high"].max())


def detect_fibonacci(df: pd.DataFrame, lookback: int) -> dict[str, float]:
    recent = df.tail(lookback)
    swing_low = float(recent["low"].min())
    swing_high = float(recent["high"].max())
    diff = swing_high - swing_low

    return {
        "0.0": swing_high,
        "0.236": swing_high - diff * 0.236,
        "0.382": swing_high - diff * 0.382,
        "0.5": swing_high - diff * 0.5,
        "0.618": swing_high - diff * 0.618,
        "0.786": swing_high - diff * 0.786,
        "1.0": swing_low,
    }


def detect_trend_and_regime(latest: pd.Series, rules: dict) -> tuple[str, str, str]:
    ema_bullish = latest["ema_fast"] > latest["ema_mid"] > latest["ema_slow"]
    ema_bearish = latest["ema_fast"] < latest["ema_mid"] < latest["ema_slow"]
    adx = latest["adx"]
    dmp = latest["dmp"]
    dmn = latest["dmn"]

    if ema_bullish and dmp > dmn:
        trend = "UPTREND"
        bias = "BULLISH"
    elif ema_bearish and dmn > dmp:
        trend = "DOWNTREND"
        bias = "BEARISH"
    else:
        trend = "SIDEWAYS"
        bias = "NEUTRAL"

    if adx >= rules["adx_trend_threshold"]:
        regime = "TRENDING"
    elif adx <= rules["adx_range_threshold"]:
        regime = "RANGING"
    else:
        regime = "TRANSITION"

    return trend, regime, bias


def detect_order_block(df: pd.DataFrame, lookback: int) -> Zone | None:
    recent = df.tail(lookback).reset_index(drop=True)
    avg_body = (recent["close"] - recent["open"]).abs().mean()

    for idx in range(len(recent) - 3, 2, -1):
        candle = recent.iloc[idx]
        next_candle = recent.iloc[idx + 1]
        body = abs(candle["close"] - candle["open"])
        displacement = abs(next_candle["close"] - next_candle["open"])

        if body == 0 or displacement < avg_body * 1.8:
            continue

        bearish_candle_before_bullish_impulse = candle["close"] < candle["open"] and next_candle["close"] > next_candle["open"]
        bullish_candle_before_bearish_impulse = candle["close"] > candle["open"] and next_candle["close"] < next_candle["open"]

        if bearish_candle_before_bullish_impulse:
            return Zone(low=float(candle["low"]), high=float(candle["high"]), kind="BULLISH_ORDER_BLOCK")
        if bullish_candle_before_bearish_impulse:
            return Zone(low=float(candle["low"]), high=float(candle["high"]), kind="BEARISH_ORDER_BLOCK")

    return None


def detect_liquidity_sweep(df: pd.DataFrame, lookback: int) -> str | None:
    if len(df) < lookback + 2:
        return None

    previous = df.iloc[-lookback - 1:-1]
    latest = df.iloc[-1]
    previous_high = previous["high"].max()
    previous_low = previous["low"].min()

    swept_high_rejected = latest["high"] > previous_high and latest["close"] < previous_high
    swept_low_reclaimed = latest["low"] < previous_low and latest["close"] > previous_low

    if swept_high_rejected:
        return "BUY_SIDE_LIQUIDITY_SWEEP"
    if swept_low_reclaimed:
        return "SELL_SIDE_LIQUIDITY_SWEEP"
    return None


ACTION_SIGNALS = {
    "BUY WATCH": "LONG",
    "BULLISH CONTINUATION": "LONG",
    "BULLISH TREND FOLLOW": "LONG",
    "MTF BULLISH ACTION CALL": "LONG",
    "SELL WATCH": "SHORT",
    "BEARISH CONTINUATION": "SHORT",
    "BEARISH TREND FOLLOW": "SHORT",
    "MTF BEARISH ACTION CALL": "SHORT",
}

ATR_STOP_MULTIPLIER = 1.5


def signal_direction(signal: str) -> str | None:
    """Map a signal to its trade direction. `HOLD` and unknown signals -> None."""
    return ACTION_SIGNALS.get(signal)


def calculate_risk_plan(
    price: float,
    support: float,
    resistance: float,
    direction: str | None,
    atr: float,
) -> tuple[float | None, float | None, float | None]:
    """Build SL/TP for a trade direction.

    The side of the market (`bias`) is deliberately NOT an input: a BUY WATCH can
    fire inside a bearish bias, and anchoring the levels to `bias` printed an
    inverted plan (SL above entry, TP below it) for a LONG. Deriving the side from
    `direction` keeps these invariants for every signal:

        LONG  -> stop_loss < price < take_profit
        SHORT -> take_profit < price < stop_loss

    ponytail: structure levels leave no room when price sits on the far side of
    support/resistance (e.g. a LONG at the window high). That returns no plan
    rather than inventing a target; add an ATR-derived fallback if such setups
    should still trade.

    --- Why the stop looks wrong but is left alone ---

    `min`/`max` here select the FARTHER of {structure level, price -/+ 1.5 ATR}:

        LONG  min(support, price - 1.5*ATR)  -> picks the lower  = wider stop
        SHORT max(resistance, price + 1.5*ATR) -> picks the higher = wider stop

    That reads like a sign error, and it does guarantee risk >= 1.5 ATR: measured
    over 216 live setups the ATR term never once bound, because a 120-bar extreme
    is essentially always further away. Reward/risk therefore lands near 0.24 and
    only ~4% of signals clear min_risk_reward — which is why the screener has
    produced zero actionable rows across seven consecutive runs.

    Swapping to the tighter stop is the obvious fix and it is a trap. Measured
    walk-forward on the same data, stop vs structure target, ties resolving to the
    stop:

        current (wide stop)    9 trades   avg R +0.54
        capped at 1.5 ATR    112 trades   avg R -0.13
        capped at 1.0 ATR    157 trades   avg R -0.16
        capped at 0.75 ATR   178 trades   avg R -0.13

    A grid over stop x target (ATR-projected targets at 2x/3x/4x) put every
    capped variant between -12R and -31R. The wide stop is not a bug producing
    bad numbers; it is the only variant with positive expectancy, because it
    keeps the stop outside the noise that a 5m entry sits in.

    So: leave the levels alone. The real gap is upstream — a 5m trigger is too
    noisy for a 1.5-ATR stop and too late for a 120-bar structure target. The
    honest fix is a different entry timeframe or an explicit re-entry rule, not
    a tighter stop. Do not "fix" this function without re-running the walk-forward.
    """
    if direction == "LONG":
        stop_loss = min(support, price - atr * ATR_STOP_MULTIPLIER)
        take_profit = resistance
        risk = price - stop_loss
        reward = take_profit - price
    elif direction == "SHORT":
        stop_loss = max(resistance, price + atr * ATR_STOP_MULTIPLIER)
        take_profit = support
        risk = stop_loss - price
        reward = price - take_profit
    else:
        return None, None, None

    if risk <= 0 or reward <= 0:
        return None, None, None

    return stop_loss, take_profit, round(reward / risk, 2)


def _last_candle_close_ms(df: pd.DataFrame, timeframe: str) -> int | None:
    """Epoch ms when the newest candle closed.

    Binance stamps each kline with its OPEN time, so the close is one bar later.
    ponytail: fixed mapping for the timeframes this engine uses; swap for
    ccxt.Exchange.parse_timeframe() if Binance lists a bar size outside this set.
    """
    if "timestamp" not in df.columns or df.empty:
        return None
    bar_seconds = _TIMEFRAME_SECONDS.get(str(timeframe).lower())
    if bar_seconds is None:
        return None
    last = df["timestamp"].iloc[-1]
    if pd.isna(last):
        return None
    return int(pd.Timestamp(last).timestamp() * 1000) + bar_seconds * 1000


_TIMEFRAME_SECONDS = {"1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400}


def analyze(symbol: str, timeframe: str, df: pd.DataFrame, config: dict) -> AnalysisResult:
    if len(df) < 2:
        raise ValueError("Analisis membutuhkan minimal 2 candle dengan indikator lengkap")

    rules = config["rules"]
    structure = config["structure"]
    latest = df.iloc[-1]
    previous = df.iloc[-2]
    price = float(latest["close"])
    reasons: list[str] = []

    trend, regime, bias = detect_trend_and_regime(latest, rules)
    support, resistance = detect_support_resistance(df, structure["sr_lookback"])
    fibonacci = detect_fibonacci(df, structure["fibonacci_lookback"])
    order_block = detect_order_block(df, structure["order_block_lookback"])
    liquidity_sweep = detect_liquidity_sweep(df, structure["liquidity_sweep_lookback"])

    macd_bullish_cross = previous["macd"] < previous["macd_signal"] and latest["macd"] > latest["macd_signal"]
    macd_bearish_cross = previous["macd"] > previous["macd_signal"] and latest["macd"] < latest["macd_signal"]

    if latest["rsi"] <= rules["rsi_oversold"]:
        reasons.append("RSI oversold")
    elif latest["rsi"] >= rules["rsi_overbought"]:
        reasons.append("RSI overbought")

    if macd_bullish_cross:
        reasons.append("MACD bullish crossover")
    elif macd_bearish_cross:
        reasons.append("MACD bearish crossover")

    if liquidity_sweep:
        reasons.append(liquidity_sweep)

    if order_block:
        in_ob = order_block.low <= price <= order_block.high
        reasons.append(f"Detected {order_block.kind}" + ("; price inside zone" if in_ob else ""))

    nearest_fib = min(fibonacci.items(), key=lambda item: abs(price - item[1]))
    reasons.append(f"Nearest Fibonacci: {nearest_fib[0]} at {round(nearest_fib[1], 4)}")

    signal = "HOLD"
    if bias == "BULLISH" and regime == "TRENDING" and macd_bullish_cross:
        signal = "BULLISH CONTINUATION"
    elif bias == "BEARISH" and regime == "TRENDING" and macd_bearish_cross:
        signal = "BEARISH CONTINUATION"
    elif liquidity_sweep == "SELL_SIDE_LIQUIDITY_SWEEP" and macd_bullish_cross:
        signal = "BUY WATCH"
    elif liquidity_sweep == "BUY_SIDE_LIQUIDITY_SWEEP" and macd_bearish_cross:
        signal = "SELL WATCH"
    elif rules.get("enable_trend_following_calls", True) and bias == "BULLISH" and regime in {"TRENDING", "TRANSITION"} and latest["macd"] > latest["macd_signal"] and latest["rsi"] < rules.get("rsi_overbought", 70):
        signal = "BULLISH TREND FOLLOW"
        reasons.append("Trend-following bullish setup")
    elif rules.get("enable_trend_following_calls", True) and bias == "BEARISH" and regime in {"TRENDING", "TRANSITION"} and latest["macd"] < latest["macd_signal"] and latest["rsi"] > rules.get("rsi_oversold", 30):
        signal = "BEARISH TREND FOLLOW"
        reasons.append("Trend-following bearish setup")

    stop_loss, take_profit, risk_reward = calculate_risk_plan(
        price,
        support,
        resistance,
        signal_direction(signal),
        float(latest["atr"]),
    )
    if risk_reward and risk_reward < rules["min_risk_reward"]:
        reasons.append(f"Risk/reward below minimum: {risk_reward} < {rules['min_risk_reward']}")

    return AnalysisResult(
        symbol=symbol,
        timeframe=timeframe,
        price=round_float(price),
        trend=trend,
        regime=regime,
        signal=signal,
        bias=bias,
        rsi=round_float(latest["rsi"], 2),
        macd=round_float(latest["macd"], 4),
        atr=round_float(latest["atr"], 4),
        adx=round_float(latest["adx"], 2),
        support=round_float(support),
        resistance=round_float(resistance),
        fibonacci={level: round_float(value) for level, value in fibonacci.items()},
        order_block=Zone(round_float(order_block.low), round_float(order_block.high), order_block.kind) if order_block else None,
        liquidity_sweep=liquidity_sweep,
        stop_loss=round_float(stop_loss),
        take_profit=round_float(take_profit),
        risk_reward=risk_reward,
        reasons=reasons,
        candle_count=len(df),
        last_candle_close_ms=_last_candle_close_ms(df, timeframe),
    )
