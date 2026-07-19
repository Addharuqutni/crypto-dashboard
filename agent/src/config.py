import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

# agent/ is PROJECT_ROOT for strategy config / datasets.
# Repo root holds the single shared .env.local / .env used by Next.js + agent.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
VALID_MARKET_DATA_MODES = {"rest", "websocket", "evaluate", "dashboard"}


def _load_shared_env() -> None:
    """Load one shared env file from repo root (preferred), then agent/ fallback."""
    candidates = [
        REPO_ROOT / ".env.local",
        REPO_ROOT / ".env",
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / ".env.local",
    ]
    loaded = False
    for path in candidates:
        if path.is_file():
            # Later files do not override values already set (first match wins).
            load_dotenv(path, override=False)
            loaded = True
            break
    if not loaded:
        load_dotenv(override=False)


_load_shared_env()


@dataclass(frozen=True)
class Settings:
    exchange: str
    symbols: list[str]
    timeframe: str
    fetch_limit: int
    scan_interval_seconds: int
    market_data_mode: str
    realtime_print_interval_seconds: int
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    alert_only_signals: bool
    use_top_marketcap: bool
    use_binance_top_volume: bool
    binance_top_volume_limit: int
    binance_top_volume_quote: str
    binance_top_volume_market_type: str
    top_marketcap_limit: int
    top_marketcap_quote: str
    include_stablecoins: bool
    save_action_dataset: bool
    evaluation_fetch_limit: int
    evaluation_max_rows: int | None
    ai_model_enabled: bool
    ai_model_provider: str
    ai_model_api_key: str | None
    ai_model_name: str
    ai_model_base_url: str | None
    ai_model_timeout: int
    ai_model_min_score: float
    dashboard_host: str
    dashboard_port: int
    dashboard_auto_scan: bool
    dashboard_auto_scan_interval_seconds: int
    dashboard_auto_evaluate: bool
    dashboard_auto_evaluate_interval_seconds: int
    database_url: str | None
    database_enabled: bool
    internal_token: str | None
    screener_storage_dir: str
    screener_max_alerts_per_hour: int
    screener_cooldown_minutes: int
    screener_min_confidence: float
    screener_min_risk_reward: float
    screener_min_grade: str
    screener_interval_minutes: int
    screener_universe_mode: str
    screener_max_symbols: int
    screener_universe_cache_ttl_minutes: int
    screener_symbols: list[str]


def _get_int_env(name: str, default: int, minimum: int = 1) -> int:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} harus berupa integer, nilai saat ini: {raw_value!r}") from error

    if value < minimum:
        raise ValueError(f"{name} minimal {minimum}, nilai saat ini: {value}")
    return value


def _get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return default
    normalized = raw_value.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    raise ValueError(f"{name} harus boolean true/false, nilai saat ini: {raw_value!r}")


def _parse_symbols(raw_symbols: str) -> list[str]:
    symbols = [symbol.strip().upper() for symbol in raw_symbols.split(",") if symbol.strip()]
    if not symbols:
        raise ValueError("SYMBOLS tidak boleh kosong")
    return symbols


def _parse_optional_symbols(raw_symbols: str | None) -> list[str]:
    if raw_symbols is None or not str(raw_symbols).strip():
        return []
    return [symbol.strip().upper() for symbol in str(raw_symbols).split(",") if symbol.strip()]


def _get_optional_int_env(name: str) -> int | None:
    raw_value = os.getenv(name, "").strip()
    if not raw_value:
        return None
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} harus berupa integer atau kosong, nilai saat ini: {raw_value!r}") from error
    if value < 1:
        raise ValueError(f"{name} minimal 1 jika diisi, nilai saat ini: {value}")
    return value


def _get_float_env(name: str, default: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = float(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} harus berupa float, nilai saat ini: {raw_value!r}") from error
    if value < minimum or value > maximum:
        raise ValueError(f"{name} harus di antara {minimum} dan {maximum}, nilai saat ini: {value}")
    return value


def load_settings() -> Settings:
    market_data_mode = os.getenv("MARKET_DATA_MODE", "rest").strip().lower()
    if market_data_mode not in VALID_MARKET_DATA_MODES:
        valid_modes = ", ".join(sorted(VALID_MARKET_DATA_MODES))
        raise ValueError(f"MARKET_DATA_MODE harus salah satu dari: {valid_modes}")

    return Settings(
        exchange=os.getenv("EXCHANGE", "binance").strip().lower(),
        symbols=_parse_symbols(os.getenv("SYMBOLS", "BTC/USDT")),
        timeframe=os.getenv("TIMEFRAME", "1h").strip(),
        fetch_limit=_get_int_env("FETCH_LIMIT", 250, minimum=50),
        scan_interval_seconds=_get_int_env("SCAN_INTERVAL_SECONDS", 3600),
        market_data_mode=market_data_mode,
        realtime_print_interval_seconds=_get_int_env("REALTIME_PRINT_INTERVAL_SECONDS", 5),
        telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN") or None,
        telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID") or None,
        alert_only_signals=_get_bool_env("ALERT_ONLY_SIGNALS", True),
        use_top_marketcap=_get_bool_env("USE_TOP_MARKETCAP", False),
        use_binance_top_volume=_get_bool_env("USE_BINANCE_TOP_VOLUME", False),
        binance_top_volume_limit=_get_int_env("BINANCE_TOP_VOLUME_LIMIT", 100),
        binance_top_volume_quote=os.getenv("BINANCE_TOP_VOLUME_QUOTE", "USDT").strip().upper(),
        binance_top_volume_market_type=os.getenv("BINANCE_TOP_VOLUME_MARKET_TYPE", "spot").strip().lower(),
        top_marketcap_limit=_get_int_env("TOP_MARKETCAP_LIMIT", 100),
        top_marketcap_quote=os.getenv("TOP_MARKETCAP_QUOTE", "USDT").strip().upper(),
        include_stablecoins=_get_bool_env("INCLUDE_STABLECOINS", False),
        save_action_dataset=_get_bool_env("SAVE_ACTION_DATASET", True),
        evaluation_fetch_limit=_get_int_env("EVALUATION_FETCH_LIMIT", 250, minimum=50),
        evaluation_max_rows=_get_optional_int_env("EVALUATION_MAX_ROWS"),
        # Shared AI_* keys (Next.js) take precedence; AI_MODEL_* kept as aliases.
        ai_model_api_key=(
            os.getenv("AI_API_KEY")
            or os.getenv("AI_MODEL_API_KEY")
            or os.getenv("GEMINI_API_KEY")
            or None
        ),
        ai_model_name=(
            os.getenv("AI_MODEL")
            or os.getenv("AI_MODEL_NAME")
            or "gpt-4o-mini"
        ).strip(),
        ai_model_base_url=os.getenv("AI_BASE_URL") or os.getenv("AI_MODEL_BASE_URL") or None,
        # Enable AI when explicitly set, or automatically when a key is present.
        ai_model_enabled=(
            _get_bool_env("AI_MODEL_ENABLED", False)
            or bool(
                os.getenv("AI_API_KEY")
                or os.getenv("AI_MODEL_API_KEY")
                or os.getenv("GEMINI_API_KEY")
            )
        ),
        ai_model_provider=(
            os.getenv("AI_MODEL_PROVIDER")
            or ("openai_compatible" if (os.getenv("AI_BASE_URL") or os.getenv("AI_MODEL_BASE_URL")) else "gemini")
        ).strip().lower(),
        ai_model_timeout=_get_int_env("AI_MODEL_TIMEOUT", 30),
        ai_model_min_score=_get_float_env("AI_MODEL_MIN_SCORE", 0.6),
        dashboard_host=os.getenv("DASHBOARD_HOST", "127.0.0.1").strip(),
        dashboard_port=_get_int_env("DASHBOARD_PORT", 8000),
        dashboard_auto_scan=_get_bool_env("DASHBOARD_AUTO_SCAN", False),
        dashboard_auto_scan_interval_seconds=_get_int_env("DASHBOARD_AUTO_SCAN_INTERVAL_SECONDS", 3600),
        dashboard_auto_evaluate=_get_bool_env("DASHBOARD_AUTO_EVALUATE", True),
        dashboard_auto_evaluate_interval_seconds=_get_int_env("DASHBOARD_AUTO_EVALUATE_INTERVAL_SECONDS", 300),
        database_url=os.getenv("DATABASE_URL") or None,
        database_enabled=_get_bool_env("DATABASE_ENABLED", False),
        internal_token=os.getenv("PYTHON_AGENT_INTERNAL_TOKEN") or None,
        screener_storage_dir=os.getenv("SCREENER_STORAGE_DIR", str(REPO_ROOT / "data" / "screener")),
        screener_max_alerts_per_hour=_get_int_env("SCREENER_MAX_ALERTS_PER_HOUR", 10),
        screener_cooldown_minutes=_get_int_env("SCREENER_ALERT_COOLDOWN_MINUTES", 10),
        screener_min_confidence=_get_float_env("SCREENER_MIN_CONFIDENCE", 75.0, 0.0, 100.0),
        screener_min_risk_reward=_get_float_env("SCREENER_MIN_RISK_REWARD", 1.5, 0.0, 100.0),
        screener_min_grade=(os.getenv("SCREENER_MIN_GRADE", "B").strip().upper() or "B"),
        screener_interval_minutes=_get_int_env("SCREENER_INTERVAL_MINUTES", 15),
        screener_universe_mode=(
            os.getenv("SCREENER_UNIVERSE_MODE", "top_futures_volume").strip().lower()
            or "top_futures_volume"
        ),
        screener_max_symbols=_get_int_env("SCREENER_MAX_SYMBOLS", 100),
        screener_universe_cache_ttl_minutes=_get_int_env(
            "SCREENER_UNIVERSE_CACHE_TTL_MINUTES",
            30,
            minimum=0,
        ),
        screener_symbols=_parse_optional_symbols(os.getenv("SCREENER_SYMBOLS", "")),
    )


def load_strategy_config(path: str | Path | None = None) -> dict[str, Any]:
    config_path = Path(path) if path else PROJECT_ROOT / "config.yaml"
    if not config_path.is_absolute():
        config_path = PROJECT_ROOT / config_path

    with config_path.open("r", encoding="utf-8") as file:
        config = yaml.safe_load(file)

    if not isinstance(config, dict):
        raise ValueError(f"Config strategi tidak valid: {config_path}")
    return config
