from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import ccxt

STABLE_BASES = {
    "USDT",
    "USDC",
    "BUSD",
    "FDUSD",
    "TUSD",
    "DAI",
    "USDE",
    "USD1",
    "USDP",
    "PYUSD",
    "USDG",
    "USDD",
    "USDS",
}
LEVERAGED_SUFFIXES = ("UP", "DOWN", "BULL", "BEAR", "3L", "3S", "5L", "5S")
LEVERAGED_TOKEN_MARKERS = ("UP", "DOWN", "BULL", "BEAR")

# Module-level cache: (resolved_at_epoch_s, symbols, cache_key)
_UNIVERSE_CACHE: tuple[float, list[str], str] | None = None


@dataclass(frozen=True)
class UniverseResolution:
    """Resolved screener universe with source/warning metadata."""

    symbols: list[str]
    source: str
    mode: str
    warning: str | None = None
    cache_hit: bool = False
    resolved_at: float | None = None


def clear_universe_cache() -> None:
    """Drop the in-process universe cache (tests + manual refresh)."""
    global _UNIVERSE_CACHE
    _UNIVERSE_CACHE = None


def filter_and_rank_futures_markets(
    markets: dict[str, Any],
    tickers: dict[str, Any],
    *,
    limit: int = 100,
    quote: str = "USDT",
    include_stablecoins: bool = False,
) -> list[dict[str, Any]]:
    """
    Pure filter/sort for Binance USDⓈ-M active USDT linear perpetual/swap markets.

    Returns ranked rows: ``{"symbol", "base", "quote", "quoteVolume"}``.
    Ranking is by quoteVolume descending. Symbols are unique by base+quote.
    """
    if limit < 1:
        return []

    quote = (quote or "USDT").strip().upper() or "USDT"
    best_by_key: dict[str, dict[str, Any]] = {}

    for market_symbol, market in markets.items():
        if not _is_active_usdt_linear_perpetual(market, quote=quote, include_stablecoins=include_stablecoins):
            continue

        ticker = tickers.get(market_symbol) or tickers.get(str(market.get("symbol") or ""))
        volume = _quote_volume(ticker)
        if volume <= 0:
            continue

        symbol = str(market.get("symbol") or market_symbol)
        base = str(market.get("base") or "").upper()
        market_quote = str(market.get("quote") or quote).upper()
        dedupe_key = f"{base}/{market_quote}"
        row = {
            "symbol": symbol,
            "base": base,
            "quote": market_quote,
            "quoteVolume": volume,
        }

        existing = best_by_key.get(dedupe_key)
        if existing is None or volume > float(existing["quoteVolume"]):
            best_by_key[dedupe_key] = row

    ranked = sorted(best_by_key.values(), key=lambda item: float(item["quoteVolume"]), reverse=True)
    return ranked[:limit]


def filter_and_rank_usdt_perpetuals(
    markets: dict[str, Any],
    tickers: dict[str, Any],
    *,
    limit: int = 100,
    quote: str = "USDT",
    include_stablecoins: bool = False,
) -> list[str]:
    """Convenience wrapper returning only ranked symbols."""
    return [
        str(item["symbol"])
        for item in filter_and_rank_futures_markets(
            markets,
            tickers,
            limit=limit,
            quote=quote,
            include_stablecoins=include_stablecoins,
        )
    ]


def fetch_top_futures_volume_symbols(
    limit: int = 100,
    quote: str = "USDT",
    include_stablecoins: bool = False,
) -> list[str]:
    """
    Live resolver: top active Binance USDⓈ-M USDT linear perpetual/swap markets
    ranked by 24h futures quote volume via ccxt.binanceusdm.
    """
    exchange = ccxt.binanceusdm({"enableRateLimit": True, "timeout": 30000})
    markets = exchange.load_markets()
    tickers = exchange.fetch_tickers()
    return filter_and_rank_usdt_perpetuals(
        markets,
        tickers,
        limit=limit,
        quote=quote,
        include_stablecoins=include_stablecoins,
    )


def fetch_binance_top_usdt_symbols(
    limit: int = 100,
    quote: str = "USDT",
    include_stablecoins: bool = False,
    market_type: str = "spot",
) -> list[str]:
    """
    Legacy entrypoint used by main.py REST/WS scanners.

    - market_type in {future, swap, futures, usdm}: use USDⓈ-M futures resolver
    - otherwise: Binance spot top volume (previous behaviour)
    """
    normalized = (market_type or "spot").strip().lower()
    if normalized in {"future", "futures", "swap", "usdm", "binanceusdm"}:
        return fetch_top_futures_volume_symbols(
            limit=limit,
            quote=quote,
            include_stablecoins=include_stablecoins,
        )

    exchange = ccxt.binance({"enableRateLimit": True, "timeout": 30000})
    exchange.load_markets()
    tickers = exchange.fetch_tickers()
    candidates: list[tuple[str, float]] = []

    for symbol, ticker in tickers.items():
        market = exchange.markets.get(symbol)
        if not _is_valid_legacy_market(market, quote, include_stablecoins, "spot"):
            continue
        volume = _quote_volume(ticker)
        if volume <= 0:
            continue
        candidates.append((symbol, volume))

    candidates.sort(key=lambda item: item[1], reverse=True)
    return [symbol for symbol, _ in candidates[:limit]]


def resolve_screener_universe(
    settings: Any | None = None,
    *,
    symbols_override: list[str] | None = None,
    fetcher: Any | None = None,
    now: float | None = None,
) -> UniverseResolution:
    """
    Resolve the screener symbol universe with caching and safe fallbacks.

    Priority:
      1. Explicit function/API ``symbols_override``
      2. ``settings.screener_symbols`` / SCREENER_SYMBOLS env override
      3. Dynamic top_futures_volume (default), cached for TTL minutes
      4. On API failure/empty → ``settings.symbols`` with warning metadata
    """
    global _UNIVERSE_CACHE

    mode = str(getattr(settings, "screener_universe_mode", None) or "top_futures_volume").strip().lower()
    max_symbols = int(getattr(settings, "screener_max_symbols", None) or 100)
    ttl_minutes = int(getattr(settings, "screener_universe_cache_ttl_minutes", None) or 30)
    include_stablecoins = bool(getattr(settings, "include_stablecoins", False))
    fallback_symbols = list(getattr(settings, "symbols", None) or [])
    env_override = list(getattr(settings, "screener_symbols", None) or [])
    now_ts = float(now if now is not None else time.time())

    if symbols_override is not None:
        cleaned = _normalize_symbol_list(symbols_override, max_symbols)
        if cleaned:
            return UniverseResolution(
                symbols=cleaned,
                source="explicit_argument",
                mode=mode,
                warning=None,
                cache_hit=False,
                resolved_at=now_ts,
            )

    if env_override:
        cleaned = _normalize_symbol_list(env_override, max_symbols)
        if cleaned:
            return UniverseResolution(
                symbols=cleaned,
                source="explicit_override",
                mode=mode,
                warning=None,
                cache_hit=False,
                resolved_at=now_ts,
            )

    if mode not in {"top_futures_volume", "dynamic", "futures_volume"}:
        cleaned = _normalize_symbol_list(fallback_symbols, max_symbols)
        return UniverseResolution(
            symbols=cleaned,
            source="settings",
            mode=mode,
            warning=None,
            cache_hit=False,
            resolved_at=now_ts,
        )

    cache_key = f"{mode}|{max_symbols}|{include_stablecoins}|USDT"
    if _UNIVERSE_CACHE is not None:
        cached_at, cached_symbols, cached_key = _UNIVERSE_CACHE
        age_minutes = (now_ts - cached_at) / 60.0
        if cached_key == cache_key and age_minutes < ttl_minutes and cached_symbols:
            return UniverseResolution(
                symbols=list(cached_symbols),
                source="top_futures_volume",
                mode=mode,
                warning=None,
                cache_hit=True,
                resolved_at=cached_at,
            )

    # Tests and callers patch fetch_binance_top_usdt_symbols; market_type=swap
    # routes to the USDⓈ-M perpetual resolver.
    fetch_fn = fetcher or fetch_binance_top_usdt_symbols
    try:
        live_symbols = list(
            fetch_fn(
                limit=max_symbols,
                quote="USDT",
                include_stablecoins=include_stablecoins,
                market_type="swap",
            )
            or []
        )
    except Exception as error:  # noqa: BLE001 - fallback is intentional
        cleaned = _normalize_symbol_list(fallback_symbols, max_symbols)
        return UniverseResolution(
            symbols=cleaned,
            source="settings_fallback",
            mode=mode,
            warning=f"universe_api_failed: {error}",
            cache_hit=False,
            resolved_at=now_ts,
        )

    cleaned_live = _normalize_symbol_list(live_symbols, max_symbols)
    if not cleaned_live:
        cleaned = _normalize_symbol_list(fallback_symbols, max_symbols)
        return UniverseResolution(
            symbols=cleaned,
            source="settings_fallback",
            mode=mode,
            warning="universe_api_empty",
            cache_hit=False,
            resolved_at=now_ts,
        )

    _UNIVERSE_CACHE = (now_ts, list(cleaned_live), cache_key)
    return UniverseResolution(
        symbols=list(cleaned_live),
        source="top_futures_volume",
        mode=mode,
        warning=None,
        cache_hit=False,
        resolved_at=now_ts,
    )


def _is_active_usdt_linear_perpetual(
    market: dict[str, Any] | None,
    *,
    quote: str,
    include_stablecoins: bool,
) -> bool:
    if not market or not market.get("active", True):
        return False

    market_quote = str(market.get("quote") or "").upper()
    if market_quote != quote:
        return False

    # Active linear perpetual/swap only (exclude spot, delivery futures, inverse).
    is_swap = bool(market.get("swap"))
    is_linear = bool(market.get("linear"))
    market_type = str(market.get("type") or "").lower()
    if not ((is_swap or market_type == "swap") and is_linear):
        return False

    # Delivery dated futures are not perpetuals even when tagged oddly.
    if market.get("future") and not is_swap and market_type != "swap":
        return False

    base = str(market.get("base") or "").upper()
    if not base:
        return False
    if not include_stablecoins and base in STABLE_BASES:
        return False
    if _is_leveraged_token_base(base):
        return False
    return True


def _is_leveraged_token_base(base: str) -> bool:
    upper = base.upper()
    if upper.endswith(LEVERAGED_SUFFIXES):
        return True
    # Patterns like BTCUP, ETHDOWN, BTCBULL, ETHBEAR (common Binance LT naming).
    for marker in LEVERAGED_TOKEN_MARKERS:
        if upper.endswith(marker) and len(upper) > len(marker):
            return True
    return False


def _is_valid_legacy_market(
    market: dict[str, Any] | None,
    quote: str,
    include_stablecoins: bool,
    market_type: str,
) -> bool:
    if not market or not market.get("active", True):
        return False
    if market.get("quote") != quote:
        return False
    if market_type == "spot" and not market.get("spot"):
        return False
    if market_type in {"future", "swap"} and not (market.get("future") or market.get("swap")):
        return False

    base = str(market.get("base") or "").upper()
    if not include_stablecoins and base in STABLE_BASES:
        return False
    if _is_leveraged_token_base(base):
        return False
    return True


def _quote_volume(ticker: dict[str, Any] | None) -> float:
    if not ticker:
        return 0.0
    for key in ("quoteVolume", "baseVolume"):
        value = ticker.get(key)
        if value is None:
            continue
        try:
            volume = float(value)
        except (TypeError, ValueError):
            continue
        if volume > 0:
            return volume
    return 0.0


def _normalize_symbol_list(symbols: list[Any], limit: int) -> list[str]:
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in symbols:
        symbol = str(raw or "").strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        cleaned.append(symbol)
        if len(cleaned) >= limit:
            break
    return cleaned
