import asyncio
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile

from data_engine.fetch import fetch_history_candles
from aggregation.candle_aggregator import validate_candle
from ai_assistant import analyze_market
from ai_trade_assistant import compute_entry_sl_tp
from connectors.binance import BinanceConnector, to_binance_symbol
from dependencies import dependency_manager
from instruments.registry import get_all as get_all_instruments, search as search_instruments, get_by_market, get_market_types, get_sources, get_by_symbol
from storage.database import get_db
from storage.models import Alert, Drawing, Layout, Watchlist, TradeJournal
from utils.mock_data import generate_candles
from analytics.footprint import build_footprint, calculate_delta, cumulative_delta
from analytics.vpvr import compute_vpvr
from execution.paper_trading import PaperTradingEngine, OrderSide, OrderType
from execution.live_trading import LiveTradingEngine
from execution.backtest import run_backtest

logger = structlog.get_logger()
router = APIRouter()


# ---------------------------------------------------------------------------
# In-memory TTL cache for historical data endpoints
# ---------------------------------------------------------------------------
import time as _time

class TTLCache:
    """Simple in-memory cache with per-key TTL (seconds)."""
    def __init__(self) -> None:
        self._data: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if _time.monotonic() > expires_at:
            del self._data[key]
            return None
        return value

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._data[key] = (_time.monotonic() + ttl, value)

    def invalidate(self, key: str) -> None:
        self._data.pop(key, None)


_history_cache = TTLCache()

# How long to cache based on interval — shorter TTL for fast timeframes
_INTERVAL_CACHE_TTL: dict[str, float] = {
    "1m": 15.0,
    "5m": 60.0,
    "15m": 120.0,
    "30m": 180.0,
    "1h": 300.0,
    "4h": 600.0,
    "1d": 3600.0,
    "1w": 7200.0,
}


def _cache_key(symbol: str, interval: str, limit: int) -> str:
    return f"history:{symbol}:{interval}:{limit}"


# ---------------------------------------------------------------------------


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/history")
async def get_history(symbol: str, interval: str = "1m", limit: int = 500, request: Request = None):
    sym = symbol.upper()
    capped = min(limit, 1000)
    ck = _cache_key(sym, interval, capped)

    # Check cache first (stale-while-revalidate: return cached immediately)
    cached = _history_cache.get(ck)
    if cached is not None:
        # Fire-and-forget refresh in background
        asyncio.create_task(_refresh_history_cache(ck, sym, interval, capped, request))
        return cached

    mt5_bridge = getattr(request.app.state, "mt5_bridge", None) if request else None
    candles, source = await fetch_history_candles(sym, interval, capped, mt5_bridge)
    result = {"symbol": sym, "interval": interval, "candles": candles, "source": source}
    ttl = _INTERVAL_CACHE_TTL.get(interval, 30.0)
    _history_cache.set(ck, result, ttl)
    return result


async def _refresh_history_cache(ck: str, sym: str, interval: str, limit: int, request: Request) -> None:
    """Background refresh — silently update the cache."""
    try:
        mt5_bridge = getattr(request.app.state, "mt5_bridge", None) if request else None
        candles, source = await fetch_history_candles(sym, interval, limit, mt5_bridge)
        result = {"symbol": sym, "interval": interval, "candles": candles, "source": source}
        ttl = _INTERVAL_CACHE_TTL.get(interval, 30.0)
        _history_cache.set(ck, result, ttl)
    except Exception:
        pass  # Keep stale cache alive


@router.get("/footprint")
async def get_footprint(symbol: str, interval: str = "1m", request: Request = None):
    te = getattr(request.app.state, "tick_engine", None)
    if te:
        ticks = te.get_ticks(symbol.upper())
        result = build_footprint(ticks)
        result["symbol"] = symbol.upper()
        result["interval"] = interval
        return result
    return {"symbol": symbol.upper(), "levels": [], "max_volume": 0}


@router.get("/delta")
async def get_delta(symbol: str, request: Request = None):
    te = getattr(request.app.state, "tick_engine", None)
    if te:
        ticks = te.get_ticks(symbol.upper())
        candle_delta = calculate_delta(ticks)
        cum = cumulative_delta(ticks)
        return {
            "symbol": symbol.upper(),
            "candle_delta": candle_delta,
            "cumulative_delta": cum[-1]["cumulative_delta"] if cum else 0,
            "delta_series": cum[-100:],
        }
    return {"symbol": symbol.upper(), "candle_delta": {"delta": 0}, "cumulative_delta": 0, "delta_series": []}


@router.get("/vpvr")
async def get_vpvr(symbol: str, request: Request = None):
    te = getattr(request.app.state, "tick_engine", None)
    if te:
        ticks = te.get_ticks(symbol.upper(), limit=10000)
        result = compute_vpvr(ticks)
        result["symbol"] = symbol.upper()
        return result
    return {"symbol": symbol.upper(), "levels": [], "poc": 0, "vah": 0, "val": 0}


# --- Watchlists ---

@router.get("/watchlists")
async def get_watchlists(db=Depends(get_db)):
    return await Watchlist.get_all(db)


@router.post("/watchlists")
async def create_watchlist(name: str, symbols: list[str], db=Depends(get_db)):
    return await Watchlist.create(db, name=name, symbols=symbols)


@router.delete("/watchlists/{wl_id}")
async def delete_watchlist(wl_id: int, db=Depends(get_db)):
    await Watchlist.delete(db, wl_id)
    return {"ok": True}


# --- Layouts ---

@router.get("/layouts")
async def get_layouts(db=Depends(get_db)):
    return await Layout.get_all(db)


@router.post("/layouts")
async def save_layout(data: dict, db=Depends(get_db)):
    return await Layout.create(db, data=data)


@router.delete("/layouts/{layout_id}")
async def delete_layout(layout_id: int, db=Depends(get_db)):
    await Layout.delete(db, layout_id)
    return {"ok": True}


# --- Drawings ---

@router.get("/drawings/{pane_id}")
async def get_drawings(pane_id: str, db=Depends(get_db)):
    return await Drawing.get_by_pane(db, pane_id)


@router.post("/drawings")
async def save_drawing(pane_id: str, tool: str, data: dict, db=Depends(get_db)):
    return await Drawing.create(db, pane_id, tool, data)


@router.delete("/drawings/{drawing_id}")
async def delete_drawing(drawing_id: int, db=Depends(get_db)):
    await Drawing.delete(db, drawing_id)
    return {"ok": True}


# --- Alerts ---

@router.get("/alerts")
async def get_alerts(db=Depends(get_db)):
    return await Alert.get_all(db)


@router.post("/alerts")
async def create_alert(name: str, type: str, condition: dict, symbol: str, db=Depends(get_db)):
    return await Alert.create(db, name, type, condition, symbol)


@router.post("/alerts/{alert_id}/toggle")
async def toggle_alert(alert_id: int, db=Depends(get_db)):
    await Alert.toggle(db, alert_id)
    return {"ok": True}


@router.delete("/alerts/{alert_id}")
async def delete_alert(alert_id: int, db=Depends(get_db)):
    await Alert.delete(db, alert_id)
    return {"ok": True}


# --- Instrument Registry ---

@router.get("/instruments")
async def list_instruments(market: str | None = None, source: str | None = None):
    if market:
        return get_by_market(market)
    return get_all_instruments()


@router.get("/instruments/search")
async def search_instruments_endpoint(q: str = ""):
    if not q:
        return []
    return search_instruments(q)


@router.get("/instruments/markets")
async def instrument_markets():
    return get_market_types()


@router.get("/instruments/sources")
async def instrument_sources():
    return get_sources()


# --- Dependencies ---

@router.get("/dependencies")
async def get_dependencies():
    return dependency_manager.all_ready()


@router.get("/dependencies/{feature}")
async def check_feature(feature: str):
    ready, missing = dependency_manager.feature_ready(feature)
    return {"feature": feature, "ready": ready, "missing": missing}


# --- AI Assistant ---

@router.get("/ai/analyze")
async def ai_analyze(symbol: str, interval: str = "1h", request: Request = None):
    sym = symbol.upper()
    mt5_bridge = getattr(request.app.state, "mt5_bridge", None) if request else None
    try:
        # Use the smart fallback chain (MT5 → Binance → mock)
        candles, source = await fetch_history_candles(sym, interval, 100, mt5_bridge)
        if candles:
            result = analyze_market(candles, sym)
            result["symbol"] = sym
            result["interval"] = interval
            result["source"] = source
            return result
        return {"summary": f"No data for {sym}.", "signals": [], "risk": "unknown"}
    except Exception as exc:
        logger.warning("ai_analysis_failed", symbol=sym, error=str(exc))
        return {"summary": f"Unable to analyze {sym}.", "signals": [], "risk": "unknown", "error": str(exc)}


# --- Countdown ---

@router.get("/countdown/{symbol}")
async def get_candle_countdown(symbol: str, interval: str = "1m", request: Request = None):
    te = getattr(request.app.state, "time_engine", None)
    if te:
        cd = te.get_countdown(symbol.upper(), interval)
        if cd:
            return cd
    return {"symbol": symbol.upper(), "interval": interval, "remaining_seconds": 0, "session": "unknown"}


# --- Session ---

@router.get("/session/{symbol}")
async def get_session(symbol: str, request: Request = None):
    te = getattr(request.app.state, "tick_engine", None)
    if te:
        return {"symbol": symbol.upper(), "session": te.get_session(symbol.upper())}
    return {"symbol": symbol.upper(), "session": "unknown"}


# --- Trade Journal ---

@router.get("/journal")
async def list_journal_entries(db=Depends(get_db)):
    return await TradeJournal.get_all(db)


@router.get("/journal/stats")
async def journal_stats(db=Depends(get_db)):
    return await TradeJournal.get_stats(db)


@router.get("/journal/{trade_id}")
async def get_journal_entry(trade_id: int, db=Depends(get_db)):
    entry = await TradeJournal.get_by_id(db, trade_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Trade not found")
    return entry


@router.post("/journal")
async def create_journal_entry(data: dict, db=Depends(get_db)):
    return await TradeJournal.create(db, data)


@router.put("/journal/{trade_id}")
async def update_journal_entry(trade_id: int, data: dict, db=Depends(get_db)):
    entry = await TradeJournal.update(db, trade_id, data)
    if not entry:
        raise HTTPException(status_code=404, detail="Trade not found")
    return entry


@router.delete("/journal/{trade_id}")
async def delete_journal_entry(trade_id: int, db=Depends(get_db)):
    await TradeJournal.delete(db, trade_id)
    return {"ok": True}


# --- AI Trade Assistant ---

@router.get("/ai/trade-setup")
async def ai_trade_setup(symbol: str, interval: str = "1h", request: Request = None):
    sym = symbol.upper()
    mt5_bridge = getattr(request.app.state, "mt5_bridge", None) if request else None
    try:
        # Use the smart fallback chain (MT5 → Binance → mock)
        candles, source = await fetch_history_candles(sym, interval, 100, mt5_bridge)
        if not candles:
            return {"summary": f"No data for {sym}.", "signals": [], "entry": None, "stop_loss": None, "take_profit": None, "confidence": 0, "direction": "neutral", "rr": None}
        result = compute_entry_sl_tp(candles, sym)
        result["symbol"] = sym
        result["source"] = source
        return result
    except Exception as exc:
        logger.warning("ai_trade_setup_failed", symbol=sym, error=str(exc))
        return {"summary": f"Unable to analyze {sym}.", "signals": [], "entry": None, "stop_loss": None, "take_profit": None, "confidence": 0, "direction": "neutral", "rr": None, "error": str(exc)}


@router.post("/journal/from-setup")
async def create_trade_from_setup(data: dict, db=Depends(get_db)):
    """Create a journal entry from an AI trade setup (quick-entry)."""
    payload = {
        "symbol": data.get("symbol", ""),
        "side": data.get("direction", "long"),
        "entry_price": data.get("entry", 0),
        "stop_loss": data.get("stop_loss"),
        "take_profit": data.get("take_profit"),
        "quantity": data.get("quantity", 1),
        "entry_reason": data.get("entry_reason", "AI suggested setup"),
        "status": "open",
    }
    return await TradeJournal.create(db, payload)


# --- Screenshot Upload ---

import os
from pathlib import Path

SCREENSHOT_DIR = Path("data/screenshots")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

import uuid

@router.post("/journal/screenshot")
async def upload_screenshot(file: UploadFile = None, trade_id: int | None = None, db=Depends(get_db)):
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    filename = f"{uuid.uuid4().hex}.png"
    filepath = SCREENSHOT_DIR / filename
    data = await file.read()
    import asyncio
    await asyncio.to_thread(filepath.write_bytes, data)
    relative_path = str(filepath)
    if trade_id:
        await TradeJournal.update(db, trade_id, {"screenshot_path": relative_path})
    return {"path": relative_path, "url": f"/api/screenshots/{filename}"}


@router.get("/screenshots/{filename}")
async def get_screenshot(filename: str):
    # Sanitize filename to prevent path traversal attacks
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = SCREENSHOT_DIR / safe_name
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Screenshot not found")
    from fastapi.responses import FileResponse
    return FileResponse(str(filepath), media_type="image/png")


# --- Paper Trading ---


_paper_engine: PaperTradingEngine | None = None


def _get_paper_engine(request: Request) -> PaperTradingEngine:
    global _paper_engine
    if _paper_engine is None:
        _paper_engine = getattr(request.app.state, "paper_trading", None)
    return _paper_engine


@router.get("/paper/account")
async def paper_account(request: Request):
    """Get paper trading account snapshot."""
    engine = _get_paper_engine(request)
    if not engine:
        return {"error": "Paper trading engine not available"}
    return engine.snapshot()


@router.post("/paper/orders")
async def paper_create_order(
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    price: float | None = None,
    stop_price: float | None = None,
    reason: str | None = None,
    db=Depends(get_db),
    request: Request = None,
):
    """Create a paper order (market / limit / stop / stop_limit)."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    result = await engine.create_order(
        symbol=symbol, side=side, order_type=order_type,
        quantity=quantity, price=price, stop_price=stop_price,
        reason=reason, db=db,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/paper/orders")
async def paper_list_orders(request: Request):
    """List all open paper orders."""
    engine = _get_paper_engine(request)
    if not engine:
        return {"error": "Paper trading engine not available"}
    return {"orders": [o for o in engine.open_orders]}


@router.delete("/paper/orders/{order_id}")
async def paper_cancel_order(order_id: int, db=Depends(get_db), request: Request = None):
    """Cancel an open paper order."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    result = await engine.cancel_order(order_id, db=db)
    if not result:
        raise HTTPException(status_code=404, detail="Order not found or already filled")
    return result


@router.get("/paper/positions")
async def paper_list_positions(request: Request):
    """List all open paper positions."""
    engine = _get_paper_engine(request)
    if not engine:
        return {"error": "Paper trading engine not available"}
    return {"positions": [engine._pos_to_dict(p) for p in engine.open_positions]}


@router.put("/paper/positions/{position_id}")
async def paper_update_position(
    position_id: int,
    stop_loss: float | None = None,
    take_profit: float | None = None,
    db=Depends(get_db),
    request: Request = None,
):
    """Update stop-loss and/or take-profit on an open paper position."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    result = await engine.update_position(position_id, stop_loss=stop_loss, take_profit=take_profit, db=db)
    if not result:
        raise HTTPException(status_code=404, detail="Position not found or already closed")
    return result


@router.delete("/paper/positions/{position_id}")
async def paper_close_position(
    position_id: int,
    exit_price: float | None = None,
    reason: str | None = None,
    db=Depends(get_db),
    request: Request = None,
):
    """Close an open paper position."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    result = await engine.close_position(position_id, exit_price=exit_price, reason=reason, db=db)
    if not result:
        raise HTTPException(status_code=404, detail="Position not found or already closed")
    return result


@router.get("/paper/history")
async def paper_trade_history(request: Request):
    """Get closed paper trade history."""
    engine = _get_paper_engine(request)
    if not engine:
        return {"error": "Paper trading engine not available"}
    return {"trades": [
        {
            "id": t.id, "symbol": t.symbol, "side": t.side.value,
            "entry_price": t.entry_price, "exit_price": t.exit_price,
            "quantity": t.quantity, "pnl": t.pnl, "pnl_pct": t.pnl_pct,
            "entry_reason": t.entry_reason, "exit_reason": t.exit_reason,
            "opened_at": t.opened_at, "closed_at": t.closed_at,
        }
        for t in engine.closed_trades
    ]}


@router.get("/paper/settings")
async def paper_get_settings(request: Request):
    """Get paper trading settings (slippage, fee model, etc.)."""
    engine = _get_paper_engine(request)
    if not engine:
        return {"error": "Paper trading engine not available"}
    return engine.settings


@router.put("/paper/settings")
async def paper_update_settings(
    initial_balance: float | None = None,
    slippage_bps: float | None = None,
    fee_model: str | None = None,
    taker_fee_bps: float | None = None,
    maker_fee_bps: float | None = None,
    db=Depends(get_db),
    request: Request = None,
):
    """Update paper trading settings."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    if fee_model is not None and fee_model not in ("none", "exchange"):
        raise HTTPException(status_code=400, detail="fee_model must be 'none' or 'exchange'")
    result = await engine.update_settings(
        initial_balance=initial_balance,
        slippage_bps=slippage_bps,
        fee_model=fee_model,
        taker_fee_bps=taker_fee_bps,
        maker_fee_bps=maker_fee_bps,
        db=db,
    )
    return result


# --- Live MT5 Trading ---


@router.get("/live/status")
async def live_status(request: Request):
    """Get live trading engine status (enabled, bridge connected, risk params)."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        return {"enabled": False, "bridge_connected": False, "error": "Live trading engine not available"}
    return live.status()


@router.post("/live/enable")
async def live_enable(enabled: bool = True, request: Request = None):
    """Enable or disable live MT5 trading."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        raise HTTPException(status_code=503, detail="Live trading engine not available")
    live.set_enabled(enabled)
    return {"ok": True, **live.status()}


@router.post("/live/orders")
async def live_create_order(
    symbol: str,
    side: str,
    volume: float,
    price: float | None = None,
    sl: float | None = None,
    tp: float | None = None,
    deviation: int = 10,
    comment: str = "aegis_manual",
    request: Request = None,
):
    """Send a live market order. WARNING: This executes a real trade if enabled!"""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        raise HTTPException(status_code=503, detail="Live trading engine not available")
    result = await live.send_market_order(
        symbol=symbol, side=side, volume=volume,
        price=price, sl=sl, tp=tp,
        deviation=deviation, comment=comment,
        reason="manual_rest",
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.post("/live/close")
async def live_close(
    symbol: str,
    volume: float,
    price: float,
    deviation: int = 10,
    request: Request = None,
):
    """Close an MT5 position by opposite market order."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        raise HTTPException(status_code=503, detail="Live trading engine not available")
    result = await live.close_market_position(
        symbol=symbol, volume=volume, price=price,
        deviation=deviation, reason="manual_rest",
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/live/positions")
async def live_positions(request: Request):
    """Get current MT5 positions."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        return {"positions": [], "error": "Live trading engine not available"}
    positions = await live.sync_positions()
    return {"positions": positions, "count": len(positions)}


@router.get("/live/account")
async def live_account(request: Request):
    """Get MT5 account info (balance, equity, margin)."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        return {"error": "Live trading engine not available"}
    info = await live.get_account_info()
    return info


@router.get("/live/risk-params")
async def live_risk_params(request: Request):
    """Get live trading risk parameters."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        return {"error": "Live trading engine not available"}
    return live.risk_params


@router.post("/live/risk-params")
async def live_update_risk_params(data: dict, request: Request = None):
    """Update live trading risk parameters."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        raise HTTPException(status_code=503, detail="Live trading engine not available")
    live.set_risk_params(data)
    return {"ok": True, **live.risk_params}


@router.post("/live/reset-daily")
async def live_reset_daily(request: Request = None):
    """Reset daily trade count and risk P&L."""
    live: LiveTradingEngine | None = getattr(request.app.state, "live_trading", None)
    if not live:
        raise HTTPException(status_code=503, detail="Live trading engine not available")
    live.reset_daily()
    return {"ok": True}


@router.post("/paper/reset")
async def paper_reset(db=Depends(get_db), request: Request = None):
    """Reset paper trading account and clear all positions/orders."""
    engine = _get_paper_engine(request)
    if not engine:
        raise HTTPException(status_code=503, detail="Paper trading engine not available")
    await engine.reset(db=db)
    return {"ok": True, **engine.stats}


# --- Bots ---


@router.get("/bots")
async def list_bots(request: Request):
    """List all trading bots."""
    orchestrator = getattr(request.app.state, "bot_orchestrator", None)
    if not orchestrator:
        return {"bots": [], "error": "Bot orchestrator not available"}
    return {"bots": orchestrator.list_bots()}


@router.post("/bots")
async def create_bot(data: dict, request: Request = None):
    """Create a new trading bot."""
    orchestrator = getattr(request.app.state, "bot_orchestrator", None)
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Bot orchestrator not available")
    try:
        data["enabled"] = data.get("enabled", True)
        bot = orchestrator.add_bot(data)
        return {"ok": True, "bot": bot.to_dict()}
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/bots/{bot_name}")
async def delete_bot(bot_name: str, request: Request = None):
    """Remove a trading bot."""
    orchestrator = getattr(request.app.state, "bot_orchestrator", None)
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Bot orchestrator not available")
    if not orchestrator.remove_bot(bot_name):
        raise HTTPException(status_code=404, detail=f"Bot '{bot_name}' not found")
    return {"ok": True}


@router.post("/bots/{bot_name}/toggle")
async def toggle_bot(bot_name: str, request: Request = None):
    """Toggle a bot's enabled/disabled state."""
    orchestrator = getattr(request.app.state, "bot_orchestrator", None)
    if not orchestrator:
        raise HTTPException(status_code=503, detail="Bot orchestrator not available")
    bot = orchestrator.toggle_bot(bot_name)
    if not bot:
        raise HTTPException(status_code=404, detail=f"Bot '{bot_name}' not found")
    return {"ok": True, "enabled": bot.enabled}


# --- Backtest ---


@router.post("/backtest")
async def backtest(data: dict, request: Request = None):
    """Run a backtest for a bot configuration against historical data.

    Accepts the same config schema as ``POST /api/bots`` plus:
    - initial_capital (float, default 10_000)
    - limit (int, default 500, max 1000)

    Returns comprehensive metrics including equity curve and trade list.
    """
    mt5_bridge = getattr(request.app.state, "mt5_bridge", None) if request else None
    result = await run_backtest(data, mt5_bridge=mt5_bridge)
    return result


# --- Replay ---


@router.post("/replay/load")
async def replay_load(symbol: str, interval: str = "1m", count: int = 500, request: Request = None):
    """Load historical data into the replay engine."""
    sym = symbol.upper()
    mt5_inst = getattr(request.app.state, "mt5_bridge", None) if request else None
    candles: list[dict] = []

    if mt5_inst:
        from connectors.mt5_bridge import TIMEFRAME_MAP
        if interval in TIMEFRAME_MAP:
            mt5_candles = await mt5_inst.get_history(sym, interval, count)
            if mt5_candles:
                candles = [c for c in mt5_candles if not validate_candle(c)]

    if not candles:
        bc = BinanceConnector()
        try:
            candles = await bc.get_klines(sym, interval, count)
        except Exception:
            pass
        finally:
            await bc.close()

    if not candles:
        from aggregation.candle_aggregator import INTERVAL_SECONDS, align_timestamp
        if mt5_inst and interval != "1m":
            mt5_1m = await mt5_inst.get_history(sym, "1m", min(count * 2, 1000))
            if mt5_1m:
                target_sec = INTERVAL_SECONDS.get(interval, 3600)
                buckets: dict[int, dict] = {}
                for c in mt5_1m:
                    bucket = align_timestamp(c["time"], target_sec)
                    if bucket not in buckets:
                        buckets[bucket] = {**c, "time": bucket, "high": c["high"], "low": c["low"], "close": c["close"], "volume": c["volume"]}
                    else:
                        b = buckets[bucket]
                        b["high"] = max(b["high"], c["high"])
                        b["low"] = min(b["low"], c["low"])
                        b["close"] = c["close"]
                        b["volume"] += c["volume"]
                candles = list(buckets.values())

    if not candles:
        from utils.mock_data import generate_candles
        candles = generate_candles(sym, interval, count)

    from utils.mock_data import candles_to_ticks
    replay_ticks = candles_to_ticks(candles)
    re = getattr(request.app.state, "replay_engine", None)
    if re:
        re.load_ticks(replay_ticks)
        return {"ok": True, "tick_count": len(replay_ticks), "symbol": sym}
    return {"ok": False, "error": "Replay engine not available"}


@router.get("/replay/status")
async def replay_status(request: Request = None):
    re = getattr(request.app.state, "replay_engine", None)
    if not re:
        return {"ok": False}
    return {
        "ok": True,
        "tick_count": len(re._ticks) if re._ticks else 0,
        "index": re._index,
        "progress": re.progress,
        "speed": re._speed,
    }
