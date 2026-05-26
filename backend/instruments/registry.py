from __future__ import annotations

from typing import Any

INSTRUMENTS: list[dict[str, Any]] = [
    # Crypto
    {"symbol": "BTCUSDT", "display_name": "Bitcoin", "market_type": "crypto", "source": "binance", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "ETHUSDT", "display_name": "Ethereum", "market_type": "crypto", "source": "binance", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "SOLUSDT", "display_name": "Solana", "market_type": "crypto", "source": "binance", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    {"symbol": "BNBUSDT", "display_name": "BNB", "market_type": "crypto", "source": "binance", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "ADAUSDT", "display_name": "Cardano", "market_type": "crypto", "source": "binance", "tick_size": 0.0001, "timezone": "UTC", "precision": 4},
    {"symbol": "XRPUSDT", "display_name": "Ripple", "market_type": "crypto", "source": "binance", "tick_size": 0.0001, "timezone": "UTC", "precision": 4},
    {"symbol": "DOGEUSDT", "display_name": "Dogecoin", "market_type": "crypto", "source": "binance", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
    {"symbol": "AVAXUSDT", "display_name": "Avalanche", "market_type": "crypto", "source": "binance", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "DOTUSDT", "display_name": "Polkadot", "market_type": "crypto", "source": "binance", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    {"symbol": "LINKUSDT", "display_name": "Chainlink", "market_type": "crypto", "source": "binance", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    # Metals (Binance pairs — live data available)
    {"symbol": "XAUUSDT", "display_name": "Gold (Binance)", "market_type": "metal", "source": "binance", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "XAGUSDT", "display_name": "Silver (Binance)", "market_type": "metal", "source": "binance", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    # Metals (MT5 — requires MT5 bridge; mapped to Binance via symbol mapper)
    {"symbol": "XAUUSD", "display_name": "Gold", "market_type": "metal", "source": "mt5", "tick_size": 0.01, "timezone": "UTC", "precision": 2},
    {"symbol": "XAGUSD", "display_name": "Silver", "market_type": "metal", "source": "mt5", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    # Forex
    {"symbol": "EURUSD", "display_name": "Euro / US Dollar", "market_type": "forex", "source": "mt5", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
    {"symbol": "GBPUSD", "display_name": "British Pound / US Dollar", "market_type": "forex", "source": "mt5", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
    {"symbol": "USDJPY", "display_name": "US Dollar / Japanese Yen", "market_type": "forex", "source": "mt5", "tick_size": 0.001, "timezone": "UTC", "precision": 3},
    {"symbol": "AUDUSD", "display_name": "Australian Dollar / US Dollar", "market_type": "forex", "source": "mt5", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
    {"symbol": "USDCAD", "display_name": "US Dollar / Canadian Dollar", "market_type": "forex", "source": "mt5", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
    {"symbol": "NZDUSD", "display_name": "New Zealand Dollar / US Dollar", "market_type": "forex", "source": "mt5", "tick_size": 0.00001, "timezone": "UTC", "precision": 5},
]


def get_all() -> list[dict[str, Any]]:
    return INSTRUMENTS


def get_by_symbol(symbol: str) -> dict[str, Any] | None:
    for inst in INSTRUMENTS:
        if inst["symbol"] == symbol.upper():
            return inst
    return None


def get_by_market(market_type: str) -> list[dict[str, Any]]:
    return [i for i in INSTRUMENTS if i["market_type"] == market_type]


def search(query: str) -> list[dict[str, Any]]:
    q = query.upper()
    return [
        i for i in INSTRUMENTS
        if q in i["symbol"] or q in i["display_name"].upper()
    ]


def get_market_types() -> list[str]:
    return list({i["market_type"] for i in INSTRUMENTS})


def get_sources() -> list[str]:
    return list({i["source"] for i in INSTRUMENTS})
