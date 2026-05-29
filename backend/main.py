import asyncio
from contextlib import asynccontextmanager

import aiosqlite
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from aggregation.candle_aggregator import CandleAggregator, validate_candle
from api.routes import router as api_router
from config import settings
from connectors.binance import close_shared_client
from connectors.binance_depth import BinanceDepthConnector
from connectors.data_service import DataService
from connectors.mt5_bridge import MT5Bridge
from dependencies import dependency_manager
from logging_setup import setup_logging
from execution.paper_trading import PaperTradingEngine
from execution.orderbook import OrderBookSimulator
from execution.bot import BotOrchestrator
from execution.live_trading import LiveTradingEngine
from replay.engine import ReplayEngine
from storage.database import get_db
from tick_engine import TickEngine
from time_engine import TimeEngine
from websocket.handlers import router as ws_router
from websocket.manager import manager

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("aegis_terminal_starting", host=settings.host, port=settings.port)

    tick_engine = TickEngine()
    app.state.tick_engine = tick_engine

    replay_engine = ReplayEngine()
    app.state.replay_engine = replay_engine
    manager.replay_engine = replay_engine

    candle_aggregator = CandleAggregator()
    app.state.candle_aggregator = candle_aggregator

    time_engine = TimeEngine()
    time_engine.add_handler(lambda msg: manager.broadcast("market", msg))
    time_engine.set_symbols(
        ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
         "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD",
         "USDJPY", "AUDUSD", "USDCAD", "NZDUSD"],
        ["1m", "5m", "1h"],
    )
    await time_engine.start()
    app.state.time_engine = time_engine

    # Background task: broadcast partial candles with fresh countdown every 5s
    async def _partial_broadcast_loop():
        while True:
            await asyncio.sleep(5)
            import time as _tm
            now_ms = int(_tm.time() * 1000)
            for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT",
                        "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD",
                        "USDJPY", "AUDUSD", "USDCAD", "NZDUSD"]:
                for iv, partial in candle_aggregator.get_all_candles(sym).items():
                    partial["type"] = "candle"
                    partial["remaining_seconds"] = max(0, (partial["close_time"] - now_ms) // 1000)
                    if partial["remaining_seconds"] > 0:
                        await manager.broadcast("market", partial)

    _partial_task = asyncio.create_task(_partial_broadcast_loop())

    # Background task: broadcast footprint, delta, VPVR over WebSocket every 5s
    # Replaces frontend REST polling — frontend WS handlers already process these types.
    from analytics.footprint import build_footprint, calculate_delta, cumulative_delta
    from analytics.vpvr import compute_vpvr

    async def _analytics_broadcast_loop():
        logger.info("analytics_loop_starting")
        while True:
            try:
                await asyncio.sleep(5)
                # Only iterate symbols that have recent tick data
                active_symbols = [s for s in tick_engine._ticks.keys() if tick_engine._ticks[s]]
                if not active_symbols:
                    continue
                for sym in active_symbols:
                    ticks = tick_engine.get_ticks(sym)
                    if not ticks:
                        continue
                    logger.info("analytics_broadcasting", symbol=sym, tick_count=len(ticks))

                    # Footprint
                    fp = build_footprint(ticks)
                    fp["symbol"] = sym
                    fp["type"] = "footprint"
                    await manager.broadcast("market", fp)

                    # Delta
                    candle_delta = calculate_delta(ticks)
                    cum = cumulative_delta(ticks)
                    dl = {
                        "symbol": sym,
                        "type": "delta",
                        "candle_delta": candle_delta,
                        "cumulative_delta": cum[-1]["cumulative_delta"] if cum else 0,
                        "delta_series": cum[-100:],
                    }
                    await manager.broadcast("market", dl)

                    # VPVR (last 10k ticks, matching REST endpoint limit)
                    vp_ticks = tick_engine.get_ticks(sym, limit=10000)
                    vp = compute_vpvr(vp_ticks)
                    vp["symbol"] = sym
                    vp["type"] = "vpvr"
                    await manager.broadcast("market", vp)
            except Exception as analytics_err:
                logger.exception("analytics_broadcast_error", error=str(analytics_err))
                await asyncio.sleep(1)

    _analytics_task = asyncio.create_task(_analytics_broadcast_loop())

    dm = dependency_manager
    dm.set_ready("tick_engine", True)
    dm.set_ready("time_engine", True)
    dm.set_ready("aggregation", True)
    dm.set_ready("stable_candles", True)
    dm.set_ready("indicator_engine", True)
    dm.set_ready("tick_classification", True)
    dm.set_ready("volume_aggregation", True)
    dm.set_ready("strategy_engine", True)
    dm.set_ready("candle_history", True)
    dm.set_ready("risk_engine", True)
    dm.set_ready("tick_storage", True)

    # --- Paper Trading Engine ---
    orderbook = OrderBookSimulator()
    paper_trading = PaperTradingEngine(orderbook=orderbook)
    app.state.paper_trading = paper_trading
    manager.paper_trading = paper_trading  # for WS handlers

    # Load persisted state from DB and keep a dedicated connection for auto-persistence
    paper_trading_db = await aiosqlite.connect("data/aegis.db")
    paper_trading_db.row_factory = aiosqlite.Row
    await paper_trading.load_from_db(paper_trading_db)
    # Settings are loaded inside load_from_db via _load_settings_from_db
    paper_trading.set_db(paper_trading_db)

    # Wire WS broadcast for paper trading events
    async def _paper_event_handler(event: dict) -> None:
        await manager.broadcast("market", event)
    paper_trading.set_event_handler(_paper_event_handler)

    dm.set_ready("paper_trading", True)

    # --- Bot Orchestrator ---
    bot_orchestrator = BotOrchestrator()
    app.state.bot_orchestrator = bot_orchestrator
    manager.bot_orchestrator = bot_orchestrator

    dm.set_ready("bot_orchestrator", True)

    async def on_candle(candle: dict) -> None:
        # Validate incoming candle
        errors = validate_candle(candle)
        if errors:
            logger.warning("candle_validation_failed", symbol=candle.get("symbol"),
                           interval=candle.get("interval"), errors=errors)
            return  # Reject malformed candle

        # Broadcast source candle (usually 1m from Binance/MT5)
        await manager.broadcast("market", candle)

        # Feed paper trading engine with close price (for order/position checks)
        symbol = candle.get("symbol", "")
        close = candle.get("close", 0)
        if symbol and close:
            await paper_trading.on_price(symbol, close)

        # Feed bot orchestrator
        if symbol and close:
            await bot_orchestrator.on_candle(candle)

        # Properly aggregate into higher timeframes using full OHLC
        completed = candle_aggregator.ingest(candle)
        for interval_key, agg_candle in completed.items():
            # Add type field for WS routing
            agg_candle["type"] = "candle"
            # Validate aggregated candle
            agg_errors = validate_candle(agg_candle)
            if agg_errors:
                logger.error("aggregated_candle_validation_failed",
                             symbol=agg_candle.get("symbol"),
                             interval=agg_candle.get("interval"), errors=agg_errors)
                continue
            # Cap remaining_seconds for completed candles
            agg_candle["remaining_seconds"] = 0
            await manager.broadcast("market", agg_candle)

            # Feed paper trading engine with aggregated candle close
            agg_close = agg_candle.get("close", 0)
            agg_sym = agg_candle.get("symbol", "")
            if agg_sym and agg_close:
                await paper_trading.on_price(agg_sym, agg_close)

        # Broadcast only changed partial candles (throttled via dirty set)
        dirty_keys = candle_aggregator.get_and_clear_dirty()
        if dirty_keys:
            import time as _time_module
            now_ms = int(_time_module.time() * 1000)
            for dirty_key in dirty_keys:
                _sym, _iv = dirty_key.split(":", 1)
                partial = candle_aggregator.get_candle(_sym, _iv)
                if partial:
                    partial["type"] = "candle"
                    partial["remaining_seconds"] = max(0, (
                        partial["close_time"] - now_ms
                    ) // 1000)
                    await manager.broadcast("market", partial)

    async def on_quote(quote: dict) -> None:
        await manager.broadcast("market", quote)
        # Feed tick engine from quotes for footprint/delta/session
        symbol = quote.get("symbol", "")
        bid = quote.get("bid", 0)
        ask = quote.get("ask", 0)
        ts = quote.get("timestamp", 0)
        # Use mid price as a single tick (fixes triple-counting bug)
        if bid > 0 and ask > 0:
            mid = (bid + ask) / 2
            tick_engine.process_tick(symbol, mid, 1, "buy", ts)
            # Feed paper trading with quote mid price for real-time order checking
            await paper_trading.on_price(symbol, mid, bid=bid, ask=ask)

    async def on_depth(depth: dict) -> None:
        await manager.broadcast("depth", depth)
        # Feed order book simulator with depth data
        sym = depth.get("symbol", "")
        bids = depth.get("bids", [])
        asks = depth.get("asks", [])
        if sym:
            orderbook.update_depth(sym, bids, asks)

    ds = DataService()
    ds.set_handlers(on_candle=on_candle, on_quote=on_quote)
    await ds.start()

    depth_conn = BinanceDepthConnector()
    depth_conn.set_handler(on_depth)
    depth_task = asyncio.create_task(depth_conn.start(["BTCUSDT", "ETHUSDT", "SOLUSDT"]))
    app.state.depth_conn = depth_conn

    # --- MT5 Bridge (gold, silver, forex via Python subprocess) ---
    # Map MT5 symbols to frontend symbols (identity for metals since we use XAUUSD/XAGUSD)
    MT5_SYMBOL_MAP = {
        "XAUUSD": "XAUUSD",
        "XAGUSD": "XAGUSD",
    }
    MT5_REVERSE_MAP: dict[str, str] = {v: k for k, v in MT5_SYMBOL_MAP.items()}

    def map_mt5_symbol(symbol: str) -> str:
        """Map MT5 symbol to canonical frontend symbol."""
        return MT5_SYMBOL_MAP.get(symbol.upper(), symbol.upper())

    def unmap_mt5_symbol(symbol: str) -> str:
        """Map canonical frontend symbol back to MT5 symbol."""
        return MT5_REVERSE_MAP.get(symbol.upper(), symbol.upper())

    try:
        mt5 = MT5Bridge(symbol_map=MT5_REVERSE_MAP)

        # Wrap handlers to map symbols from MT5 format (XAUUSD) to frontend format (XAUUSD)
        mt5_on_candle = on_candle
        mt5_on_quote = on_quote

        async def _mt5_candle_handler(msg: dict) -> None:
            msg["symbol"] = map_mt5_symbol(msg.get("symbol", ""))
            await mt5_on_candle(msg)

        async def _mt5_quote_handler(msg: dict) -> None:
            msg["symbol"] = map_mt5_symbol(msg.get("symbol", ""))
            await mt5_on_quote(msg)

        mt5.set_handlers(on_quote=_mt5_quote_handler, on_candle=_mt5_candle_handler)
        mt5_ok = await mt5.start()
        if mt5_ok:
            dm.set_ready("mt5", True)
            dm.set_ready("mt5_quotes", True)
        app.state.mt5_bridge = mt5
    except Exception as e:
        logger.exception("mt5_bridge_startup_failed")
        app.state.mt5_bridge = None

    # --- Live Trading Engine (MT5 execution) — created AFTER MT5 bridge is up ---
    live_trading = None
    mt5_bridge_instance = getattr(app.state, "mt5_bridge", None)
    if mt5_bridge_instance and mt5_bridge_instance.is_connected:
        live_trading = LiveTradingEngine(mt5_bridge_instance)
        app.state.live_trading = live_trading
        manager.live_trading = live_trading

        async def _live_event_handler(event: dict) -> None:
            await manager.broadcast("market", event)
        live_trading.set_event_handler(_live_event_handler)
        logger.info("live_trading_engine_created")
    else:
        app.state.live_trading = None
        logger.info("live_trading_not_available_mt5_not_connected")

    # Wire bot signals — routes to paper OR live MT5 based on bot config
    async def _bot_signal_handler(signal: dict) -> None:
        action = signal.get("action", "")
        price = signal.get("price", 0)
        volume = signal.get("volume", 0.1)
        symbol = signal.get("symbol", "")
        bot_name = signal.get("bot", "")
        live_mode = signal.get("live_mode", False)
        order_executed = False

        if action and symbol and volume > 0:
            if live_mode and live_trading and live_trading.enabled:
                try:
                    result = await live_trading.send_market_order(
                        symbol=symbol,
                        side=action,
                        volume=volume,
                        price=price,
                        comment=f"bot_{bot_name}",
                        reason=f"bot_{bot_name}",
                    )
                    retcode = result.get("retcode", -1)
                    if retcode == 10009:
                        order_executed = True
                        logger.info("bot_live_order_filled", symbol=symbol, action=action,
                                    volume=volume, bot=bot_name, deal=result.get("deal"))
                    else:
                        logger.warning("bot_live_order_failed", symbol=symbol, action=action,
                                       error=result.get("error"), bot=bot_name)
                except Exception as exc:
                    logger.exception("bot_live_order_error", symbol=symbol, action=action, bot=bot_name)
            else:
                try:
                    result = await paper_trading.create_order(
                        symbol=symbol,
                        side=action,
                        order_type="market",
                        quantity=volume,
                        price=price,
                        reason=f"bot_{bot_name}",
                    )
                    if "error" in result:
                        logger.warning("bot_order_failed", symbol=symbol, action=action, error=result["error"])
                    else:
                        order_executed = True
                        logger.info("bot_order_created", symbol=symbol, action=action, volume=volume)
                except Exception as exc:
                    logger.exception("bot_order_error", symbol=symbol, action=action, error=str(exc))

        signal["order_executed"] = order_executed
        await manager.broadcast("market", signal)

    # Retrieve the bot orchestrator and set the handler
    existing_orchestrator = getattr(app.state, "bot_orchestrator", None)
    if existing_orchestrator:
        existing_orchestrator.set_signal_handler(_bot_signal_handler)

    yield

    _partial_task.cancel()
    _analytics_task.cancel()
    await time_engine.stop()
    await ds.close()
    if app.state.mt5_bridge:
        await app.state.mt5_bridge.stop()
    await depth_conn.close()
    depth_task.cancel()
    # Close paper trading DB connection
    try:
        await paper_trading_db.close()
    except Exception:
        pass
    # Close shared Binance HTTP client pool
    await close_shared_client()
    logger.info("aegis_terminal_shutdown")


app = FastAPI(
    title="Aegis Terminal",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:80", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router)


def main() -> None:
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level=settings.log_level.lower(),
    )


if __name__ == "__main__":
    main()
