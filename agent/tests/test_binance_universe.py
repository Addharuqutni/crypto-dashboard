"""TDD tests for Binance USDⓈ-M top-futures-volume universe resolution."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from src.binance_universe import (
    STABLE_BASES,
    clear_universe_cache,
    filter_and_rank_futures_markets,
    resolve_screener_universe,
)


def _market(
    symbol: str,
    *,
    base: str | None = None,
    quote: str = "USDT",
    active: bool = True,
    swap: bool = True,
    future: bool = False,
    linear: bool = True,
    spot: bool = False,
    contract: bool = True,
    type_: str = "swap",
) -> dict[str, Any]:
    base_asset = base if base is not None else symbol.split("/")[0].replace(":USDT", "")
    return {
        "symbol": symbol,
        "base": base_asset,
        "quote": quote,
        "active": active,
        "swap": swap,
        "future": future,
        "linear": linear,
        "spot": spot,
        "contract": contract,
        "type": type_,
    }


def _ticker(symbol: str, quote_volume: float | None = None, base_volume: float | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"symbol": symbol}
    if quote_volume is not None:
        payload["quoteVolume"] = quote_volume
    if base_volume is not None:
        payload["baseVolume"] = base_volume
    return payload


class TestFilterAndRankFuturesMarkets:
    def test_keeps_active_usdt_linear_perpetuals_only(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "ETH/USDT:USDT": _market("ETH/USDT:USDT", base="ETH", active=False),
            "BNB/USDT": _market("BNB/USDT", base="BNB", swap=False, future=False, linear=False, spot=True, contract=False, type_="spot"),
            "SOL/BUSD:BUSD": _market("SOL/BUSD:BUSD", base="SOL", quote="BUSD"),
            "XRP/USDT:USDT": _market("XRP/USDT:USDT", base="XRP", linear=False),
            "ADA/USDT:USDT": _market("ADA/USDT:USDT", base="ADA"),
        }
        tickers = {
            "BTC/USDT:USDT": _ticker("BTC/USDT:USDT", 1000),
            "ETH/USDT:USDT": _ticker("ETH/USDT:USDT", 900),
            "BNB/USDT": _ticker("BNB/USDT", 800),
            "SOL/BUSD:BUSD": _ticker("SOL/BUSD:BUSD", 700),
            "XRP/USDT:USDT": _ticker("XRP/USDT:USDT", 600),
            "ADA/USDT:USDT": _ticker("ADA/USDT:USDT", 500),
        }

        ranked = filter_and_rank_futures_markets(markets, tickers, limit=10, include_stablecoins=False)
        symbols = [item["symbol"] for item in ranked]

        assert symbols == ["BTC/USDT:USDT", "ADA/USDT:USDT"]

    def test_ranks_by_quote_volume_descending_and_limits(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "ETH/USDT:USDT": _market("ETH/USDT:USDT", base="ETH"),
            "SOL/USDT:USDT": _market("SOL/USDT:USDT", base="SOL"),
            "XRP/USDT:USDT": _market("XRP/USDT:USDT", base="XRP"),
        }
        tickers = {
            "BTC/USDT:USDT": _ticker("BTC/USDT:USDT", 100),
            "ETH/USDT:USDT": _ticker("ETH/USDT:USDT", 400),
            "SOL/USDT:USDT": _ticker("SOL/USDT:USDT", 250),
            "XRP/USDT:USDT": _ticker("XRP/USDT:USDT", 300),
        }

        ranked = filter_and_rank_futures_markets(markets, tickers, limit=3, include_stablecoins=False)
        symbols = [item["symbol"] for item in ranked]
        volumes = [item["quoteVolume"] for item in ranked]

        assert symbols == ["ETH/USDT:USDT", "XRP/USDT:USDT", "SOL/USDT:USDT"]
        assert volumes == [400.0, 300.0, 250.0]
        assert len(ranked) == 3

    def test_excludes_stablecoin_bases_unless_enabled(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "USDC/USDT:USDT": _market("USDC/USDT:USDT", base="USDC"),
            "FDUSD/USDT:USDT": _market("FDUSD/USDT:USDT", base="FDUSD"),
        }
        tickers = {
            "BTC/USDT:USDT": _ticker("BTC/USDT:USDT", 100),
            "USDC/USDT:USDT": _ticker("USDC/USDT:USDT", 9999),
            "FDUSD/USDT:USDT": _ticker("FDUSD/USDT:USDT", 8888),
        }

        without = filter_and_rank_futures_markets(markets, tickers, limit=10, include_stablecoins=False)
        with_stables = filter_and_rank_futures_markets(markets, tickers, limit=10, include_stablecoins=True)

        assert [item["symbol"] for item in without] == ["BTC/USDT:USDT"]
        assert [item["symbol"] for item in with_stables] == [
            "USDC/USDT:USDT",
            "FDUSD/USDT:USDT",
            "BTC/USDT:USDT",
        ]
        assert "USDC" in STABLE_BASES

    def test_excludes_leveraged_token_patterns(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "BTCUP/USDT:USDT": _market("BTCUP/USDT:USDT", base="BTCUP"),
            "ETHDOWN/USDT:USDT": _market("ETHDOWN/USDT:USDT", base="ETHDOWN"),
            "SOLBULL/USDT:USDT": _market("SOLBULL/USDT:USDT", base="SOLBULL"),
            "XRPBEAR/USDT:USDT": _market("XRPBEAR/USDT:USDT", base="XRPBEAR"),
            "DOGE3L/USDT:USDT": _market("DOGE3L/USDT:USDT", base="DOGE3L"),
            "ADA3S/USDT:USDT": _market("ADA3S/USDT:USDT", base="ADA3S"),
            "LINK5L/USDT:USDT": _market("LINK5L/USDT:USDT", base="LINK5L"),
            "DOT5S/USDT:USDT": _market("DOT5S/USDT:USDT", base="DOT5S"),
        }
        tickers = {
            symbol: _ticker(symbol, 1000 - index)
            for index, symbol in enumerate(markets)
        }

        ranked = filter_and_rank_futures_markets(markets, tickers, limit=20, include_stablecoins=False)
        assert [item["symbol"] for item in ranked] == ["BTC/USDT:USDT"]

    def test_deduplicates_symbols_keeping_highest_volume(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "BTC/USDT": _market(
                "BTC/USDT",
                base="BTC",
                swap=True,
                future=False,
                linear=True,
                contract=True,
                type_="swap",
            ),
        }
        tickers = {
            "BTC/USDT:USDT": _ticker("BTC/USDT:USDT", 500),
            "BTC/USDT": _ticker("BTC/USDT", 900),
        }

        ranked = filter_and_rank_futures_markets(markets, tickers, limit=10, include_stablecoins=False)
        assert len(ranked) == 1
        assert ranked[0]["symbol"] in {"BTC/USDT:USDT", "BTC/USDT"}
        assert ranked[0]["quoteVolume"] == 900.0

    def test_skips_zero_or_missing_volume(self) -> None:
        markets = {
            "BTC/USDT:USDT": _market("BTC/USDT:USDT", base="BTC"),
            "ETH/USDT:USDT": _market("ETH/USDT:USDT", base="ETH"),
            "SOL/USDT:USDT": _market("SOL/USDT:USDT", base="SOL"),
        }
        tickers = {
            "BTC/USDT:USDT": _ticker("BTC/USDT:USDT", 0),
            "ETH/USDT:USDT": _ticker("ETH/USDT:USDT", quote_volume=None, base_volume=0),
            "SOL/USDT:USDT": _ticker("SOL/USDT:USDT", 120),
        }

        ranked = filter_and_rank_futures_markets(markets, tickers, limit=10, include_stablecoins=False)
        assert [item["symbol"] for item in ranked] == ["SOL/USDT:USDT"]


class TestResolveScreenerUniverse:
    def setup_method(self) -> None:
        clear_universe_cache()

    def teardown_method(self) -> None:
        clear_universe_cache()

    def _settings(self, **overrides: Any) -> SimpleNamespace:
        base = {
            "symbols": ["BTC/USDT", "ETH/USDT"],
            "include_stablecoins": False,
            "screener_universe_mode": "top_futures_volume",
            "screener_max_symbols": 100,
            "screener_universe_cache_ttl_minutes": 30,
            "screener_symbols": None,
        }
        base.update(overrides)
        return SimpleNamespace(**base)

    def test_uses_explicit_screener_symbols_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fetch = MagicMock(return_value=["SHOULD/NOT/CALL"])
        monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

        settings = self._settings(screener_symbols=["SOL/USDT", "XRP/USDT"])
        result = resolve_screener_universe(settings)

        assert result.symbols == ["SOL/USDT", "XRP/USDT"]
        assert result.source == "explicit_override"
        assert result.warning is None
        fetch.assert_not_called()

    def test_dynamic_mode_uses_cached_top_futures_volume(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fetch = MagicMock(return_value=["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"])
        monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

        settings = self._settings(screener_max_symbols=2)
        first = resolve_screener_universe(settings)
        second = resolve_screener_universe(settings)

        assert first.symbols == ["BTC/USDT:USDT", "ETH/USDT:USDT"]
        assert first.source == "top_futures_volume"
        assert first.warning is None
        assert second.symbols == first.symbols
        assert second.cache_hit is True
        fetch.assert_called_once()
        kwargs = fetch.call_args.kwargs
        assert kwargs["limit"] == 2
        assert kwargs["quote"] == "USDT"
        assert kwargs["include_stablecoins"] is False
        assert kwargs["market_type"] == "swap"

    def test_falls_back_to_settings_symbols_on_api_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fetch = MagicMock(side_effect=RuntimeError("binance down"))
        monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

        settings = self._settings(symbols=["BTC/USDT", "ETH/USDT", "SOL/USDT"])
        result = resolve_screener_universe(settings)

        assert result.symbols == ["BTC/USDT", "ETH/USDT", "SOL/USDT"]
        assert result.source == "settings_fallback"
        assert result.warning is not None
        assert "binance down" in result.warning

    def test_falls_back_to_settings_symbols_on_empty_universe(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fetch = MagicMock(return_value=[])
        monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

        settings = self._settings(symbols=["BTC/USDT"])
        result = resolve_screener_universe(settings)

        assert result.symbols == ["BTC/USDT"]
        assert result.source == "settings_fallback"
        assert result.warning is not None
        assert "empty" in result.warning.lower()


class TestRunScreenerUniverseIntegration:
    def setup_method(self) -> None:
        clear_universe_cache()

    def teardown_method(self) -> None:
        clear_universe_cache()

    def test_run_screener_none_uses_dynamic_resolver(self, monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
        from src.screener import engine as engine_module

        settings = SimpleNamespace(
            symbols=["BTC/USDT"],
            include_stablecoins=False,
            screener_storage_dir=str(tmp_path),
            screener_min_confidence=75.0,
            screener_min_grade="B",
            screener_min_risk_reward=1.5,
            screener_cooldown_minutes=10,
            screener_max_alerts_per_hour=10,
            screener_universe_mode="top_futures_volume",
            screener_max_symbols=100,
            screener_universe_cache_ttl_minutes=30,
            screener_symbols=None,
        )
        monkeypatch.setattr(engine_module, "load_settings", lambda: settings)
        monkeypatch.setattr(
            "src.binance_universe.fetch_binance_top_usdt_symbols",
            lambda **_kwargs: ["SOL/USDT:USDT", "XRP/USDT:USDT"],
        )

        analyzed: list[str] = []

        def fake_analyze(symbol: str) -> dict[str, Any]:
            analyzed.append(symbol)
            return {
                "symbol": symbol,
                "baseAsset": symbol.split("/")[0],
                "signal": {
                    "action": "WAIT",
                    "confidence": 50,
                    "grade": "C",
                    "entry": None,
                    "stopLoss": None,
                    "takeProfits": [],
                    "riskReward": None,
                    "marketRegime": "range",
                    "tradePermission": "no_trade",
                    "reasons": [],
                    "noTradeReasons": ["wait"],
                    "dataHealth": "ok",
                    "fundingRate": None,
                    "openInterestChangePercent": None,
                    "mtfAlignmentScore": None,
                    "warnings": [],
                },
                "actionCall": None,
                "analysis": {"price": 1.0},
            }

        monkeypatch.setattr(engine_module, "analyze_symbol_payload", fake_analyze)
        monkeypatch.setattr(engine_module, "evaluate_alerts", lambda *args, **kwargs: [])

        latest = engine_module.run_screener(None)

        assert analyzed == ["SOL/USDT:USDT", "XRP/USDT:USDT"]
        assert latest["universeSize"] == 2
        assert latest["universe"]["source"] == "top_futures_volume"
        assert latest["universe"]["symbols"] == ["SOL/USDT:USDT", "XRP/USDT:USDT"]
        assert latest["health"]["universeSource"] == "top_futures_volume"
        assert latest["health"].get("universeWarning") in (None, "")

    def test_run_screener_explicit_symbols_bypass_resolver(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path
    ) -> None:
        from src.screener import engine as engine_module

        settings = SimpleNamespace(
            symbols=["BTC/USDT"],
            include_stablecoins=False,
            screener_storage_dir=str(tmp_path),
            screener_min_confidence=75.0,
            screener_min_grade="B",
            screener_min_risk_reward=1.5,
            screener_cooldown_minutes=10,
            screener_max_alerts_per_hour=10,
            screener_universe_mode="top_futures_volume",
            screener_max_symbols=100,
            screener_universe_cache_ttl_minutes=30,
            screener_symbols=None,
        )
        monkeypatch.setattr(engine_module, "load_settings", lambda: settings)
        fetch = MagicMock(return_value=["SHOULD/NOT/CALL"])
        monkeypatch.setattr("src.binance_universe.fetch_binance_top_usdt_symbols", fetch)

        analyzed: list[str] = []

        def fake_analyze(symbol: str) -> dict[str, Any]:
            analyzed.append(symbol)
            return {
                "symbol": symbol,
                "baseAsset": "BTC",
                "signal": {
                    "action": "WAIT",
                    "confidence": 50,
                    "grade": "C",
                    "entry": None,
                    "stopLoss": None,
                    "takeProfits": [],
                    "riskReward": None,
                    "marketRegime": "range",
                    "tradePermission": "no_trade",
                    "reasons": [],
                    "noTradeReasons": ["wait"],
                    "dataHealth": "ok",
                    "fundingRate": None,
                    "openInterestChangePercent": None,
                    "mtfAlignmentScore": None,
                    "warnings": [],
                },
                "actionCall": None,
                "analysis": {"price": 1.0},
            }

        monkeypatch.setattr(engine_module, "analyze_symbol_payload", fake_analyze)
        monkeypatch.setattr(engine_module, "evaluate_alerts", lambda *args, **kwargs: [])

        latest = engine_module.run_screener(["BTC/USDT"])

        assert analyzed == ["BTC/USDT"]
        assert latest["universeSize"] == 1
        assert latest["universe"]["source"] == "explicit_argument"
        fetch.assert_not_called()

    def test_run_screener_records_fallback_warning_in_health(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path
    ) -> None:
        from src.screener import engine as engine_module

        settings = SimpleNamespace(
            symbols=["BTC/USDT", "ETH/USDT"],
            include_stablecoins=False,
            screener_storage_dir=str(tmp_path),
            screener_min_confidence=75.0,
            screener_min_grade="B",
            screener_min_risk_reward=1.5,
            screener_cooldown_minutes=10,
            screener_max_alerts_per_hour=10,
            screener_universe_mode="top_futures_volume",
            screener_max_symbols=100,
            screener_universe_cache_ttl_minutes=30,
            screener_symbols=None,
        )
        monkeypatch.setattr(engine_module, "load_settings", lambda: settings)
        monkeypatch.setattr(
            "src.binance_universe.fetch_binance_top_usdt_symbols",
            MagicMock(side_effect=RuntimeError("timeout")),
        )

        analyzed: list[str] = []

        def fake_analyze(symbol: str) -> dict[str, Any]:
            analyzed.append(symbol)
            return {
                "symbol": symbol,
                "baseAsset": symbol.split("/")[0],
                "signal": {
                    "action": "WAIT",
                    "confidence": 50,
                    "grade": "C",
                    "entry": None,
                    "stopLoss": None,
                    "takeProfits": [],
                    "riskReward": None,
                    "marketRegime": "range",
                    "tradePermission": "no_trade",
                    "reasons": [],
                    "noTradeReasons": ["wait"],
                    "dataHealth": "ok",
                    "fundingRate": None,
                    "openInterestChangePercent": None,
                    "mtfAlignmentScore": None,
                    "warnings": [],
                },
                "actionCall": None,
                "analysis": {"price": 1.0},
            }

        monkeypatch.setattr(engine_module, "analyze_symbol_payload", fake_analyze)
        monkeypatch.setattr(engine_module, "evaluate_alerts", lambda *args, **kwargs: [])

        latest = engine_module.run_screener(None)

        assert analyzed == ["BTC/USDT", "ETH/USDT"]
        assert latest["universe"]["source"] == "settings_fallback"
        assert latest["health"]["universeSource"] == "settings_fallback"
        assert "timeout" in str(latest["health"]["universeWarning"])


class TestSettingsUniverseConfig:
    def test_load_settings_reads_screener_universe_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("SYMBOLS", "BTC/USDT,ETH/USDT")
        monkeypatch.setenv("SCREENER_UNIVERSE_MODE", "top_futures_volume")
        monkeypatch.setenv("SCREENER_MAX_SYMBOLS", "100")
        monkeypatch.setenv("SCREENER_UNIVERSE_CACHE_TTL_MINUTES", "30")
        monkeypatch.setenv("SCREENER_SYMBOLS", "SOL/USDT, XRP/USDT")
        monkeypatch.setenv("INCLUDE_STABLECOINS", "false")

        from src.config import load_settings

        settings = load_settings()
        assert settings.screener_universe_mode == "top_futures_volume"
        assert settings.screener_max_symbols == 100
        assert settings.screener_universe_cache_ttl_minutes == 30
        assert settings.screener_symbols == ["SOL/USDT", "XRP/USDT"]
