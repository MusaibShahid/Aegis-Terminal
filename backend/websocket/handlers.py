from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from websocket.manager import manager
from execution.paper_trading import PaperTradingEngine

logger = structlog.get_logger()
router = APIRouter()

_replay_tasks: dict[str, asyncio.Task] = {}


@router.websocket("/ws/{channel}")
async def websocket_endpoint(ws: WebSocket, channel: str):
    await manager.connect(ws, channel)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                await handle_message(ws, channel, msg)
            except json.JSONDecodeError:
                await manager.send_to(ws, {"error": "invalid_json"})
    except WebSocketDisconnect:
        await manager.disconnect(ws)
    except Exception as exc:
        logger.error("ws_error", channel=channel, error=str(exc))
        await manager.disconnect(ws)


async def handle_message(ws: WebSocket, channel: str, msg: dict[str, Any]) -> None:
    msg_type = msg.get("type")

    if msg_type == "subscribe":
        symbols = msg.get("symbols", [])
        intervals = msg.get("intervals", [])
        await manager.send_to(ws, {
            "type": "subscribed", "channel": channel, "symbols": symbols, "intervals": intervals,
        })

    elif msg_type == "ping":
        await manager.send_to(ws, {"type": "pong"})

    elif msg_type == "replay_start":
        re = manager.replay_engine
        if not re or re.tick_count == 0:
            await manager.send_to(ws, {"type": "replay_error", "message": "No replay data loaded"})
            return

        async def on_tick(tick: dict) -> None:
            await manager.send_to(ws, {"type": "replay_tick", "tick": tick})

        async def on_complete() -> None:
            await manager.send_to(ws, {"type": "replay_complete"})

        re.set_handler(on_tick=on_tick, on_complete=on_complete)
        task_id = f"{id(ws)}"
        _replay_tasks[task_id] = asyncio.create_task(re.play())
        await manager.send_to(ws, {"type": "replay_started"})

    elif msg_type == "replay_pause":
        if manager.replay_engine:
            manager.replay_engine.pause()
        await manager.send_to(ws, {"type": "replay_paused"})

    elif msg_type == "replay_stop":
        task_id = f"{id(ws)}"
        task = _replay_tasks.pop(task_id, None)
        if task and not task.done():
            task.cancel()
        if manager.replay_engine:
            manager.replay_engine.stop()
        await manager.send_to(ws, {"type": "replay_stopped"})

    elif msg_type == "replay_speed":
        speed = msg.get("speed", 1.0)
        if manager.replay_engine:
            manager.replay_engine.set_speed(speed)
        await manager.send_to(ws, {"type": "replay_speed", "speed": speed})

    elif msg_type == "replay_step":
        n = msg.get("count", 1)
        re = manager.replay_engine
        ticks = re.step(n) if re else []
        await manager.send_to(ws, {
            "type": "replay_ticks", "ticks": ticks,
            "progress": re.progress if re else 0,
        })

    elif msg_type == "bot_toggle":
        bot_name = msg.get("bot", "")
        orchestrator = getattr(manager, "bot_orchestrator", None)
        if orchestrator:
            bot = orchestrator.toggle_bot(bot_name)
            if bot:
                await manager.send_to(ws, {
                    "type": "bot_toggled",
                    "bot": bot_name,
                    "enabled": bot.enabled,
                })
            else:
                await manager.send_to(ws, {"type": "bot_error", "message": f"Bot '{bot_name}' not found"})
        else:
            await manager.send_to(ws, {"type": "bot_error", "message": "Bot orchestrator not available"})

    elif msg_type == "alert_toggle":
        alert_id = msg.get("alert_id")
        await manager.send_to(ws, {"type": "alert_toggled", "alert_id": alert_id})

    elif msg_type == "alert_create":
        alert_data = msg.get("alert", {})
        await manager.send_to(ws, {"type": "alert_created", "alert": alert_data})

    # --- Paper Trading ---

    elif msg_type == "bot_create":
        orchestrator = getattr(manager, "bot_orchestrator", None)
        if orchestrator:
            try:
                config = msg.get("config", {})
                config["enabled"] = config.get("enabled", True)
                bot = orchestrator.add_bot(config)
                await manager.send_to(ws, {"type": "bot_created", "bot": bot.to_dict()})
            except ValueError as e:
                await manager.send_to(ws, {"type": "bot_error", "message": str(e)})
        else:
            await manager.send_to(ws, {"type": "bot_error", "message": "Bot orchestrator not available"})

    elif msg_type == "bot_remove":
        orchestrator = getattr(manager, "bot_orchestrator", None)
        if orchestrator:
            name = msg.get("name", "")
            if orchestrator.remove_bot(name):
                await manager.send_to(ws, {"type": "bot_removed", "name": name})
            else:
                await manager.send_to(ws, {"type": "bot_error", "message": f"Bot '{name}' not found"})
        else:
            await manager.send_to(ws, {"type": "bot_error", "message": "Bot orchestrator not available"})

    elif msg_type == "bot_list":
        orchestrator = getattr(manager, "bot_orchestrator", None)
        if orchestrator:
            bots = orchestrator.list_bots()
            await manager.send_to(ws, {"type": "bot_list", "bots": bots})
        else:
            await manager.send_to(ws, {"type": "bot_error", "message": "Bot orchestrator not available"})

    elif msg_type == "paper_create_order":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if not engine:
            await manager.send_to(ws, {"type": "paper_error", "message": "Engine not available"})
            return
        result = await engine.create_order(
            symbol=msg.get("symbol", ""),
            side=msg.get("side", "buy"),
            order_type=msg.get("order_type", "market"),
            quantity=msg.get("quantity", 0.0),
            price=msg.get("price"),
            stop_price=msg.get("stop_price"),
            reason=msg.get("reason"),
        )
        if "error" in result:
            await manager.send_to(ws, {"type": "paper_error", "message": result["error"]})
        else:
            await manager.send_to(ws, {"type": "paper_order_created", "order": result})

    elif msg_type == "paper_cancel_order":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if not engine:
            await manager.send_to(ws, {"type": "paper_error", "message": "Engine not available"})
            return
        result = await engine.cancel_order(msg.get("order_id", 0))
        if result:
            await manager.send_to(ws, {"type": "paper_order_cancelled", "order": result})
        else:
            await manager.send_to(ws, {"type": "paper_error", "message": "Order not found"})

    elif msg_type == "paper_close_position":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if not engine:
            await manager.send_to(ws, {"type": "paper_error", "message": "Engine not available"})
            return
        result = await engine.close_position(
            msg.get("position_id", 0),
            exit_price=msg.get("exit_price"),
            reason=msg.get("reason"),
        )
        if result:
            await manager.send_to(ws, {"type": "paper_position_closed", "position": result})
        else:
            await manager.send_to(ws, {"type": "paper_error", "message": "Position not found"})

    elif msg_type == "paper_get_snapshot":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if engine:
            await manager.send_to(ws, {"type": "paper_snapshot", **engine.snapshot()})

    elif msg_type == "paper_get_settings":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if engine:
            await manager.send_to(ws, {"type": "paper_settings", **engine.settings})

    elif msg_type == "paper_update_settings":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if not engine:
            await manager.send_to(ws, {"type": "paper_error", "message": "Engine not available"})
            return
        result = await engine.update_settings(
            initial_balance=msg.get("initial_balance"),
            slippage_bps=msg.get("slippage_bps"),
            fee_model=msg.get("fee_model"),
            taker_fee_bps=msg.get("taker_fee_bps"),
            maker_fee_bps=msg.get("maker_fee_bps"),
        )
        if "error" in result:
            await manager.send_to(ws, {"type": "paper_error", "message": result["error"]})
        else:
            await manager.send_to(ws, {"type": "paper_settings_updated", "settings": result})

    elif msg_type == "paper_reset":
        engine: PaperTradingEngine | None = getattr(manager, "paper_trading", None)
        if engine:
            await engine.reset()
            await manager.send_to(ws, {"type": "paper_reset_done", **engine.stats})

    # --- Live MT5 Trading ---

    elif msg_type == "live_enable":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        enabled = msg.get("enabled", True)
        live.set_enabled(enabled)
        await manager.send_to(ws, {"type": "live_status", **live.status()})

    elif msg_type == "live_send_order":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        result = await live.send_market_order(
            symbol=msg.get("symbol", ""),
            side=msg.get("side", "buy"),
            volume=msg.get("volume", 0.1),
            price=msg.get("price"),
            sl=msg.get("sl"),
            tp=msg.get("tp"),
            deviation=msg.get("deviation", 10),
            comment=msg.get("comment", "aegis_manual"),
            reason=msg.get("reason"),
        )
        if "error" in result:
            await manager.send_to(ws, {"type": "live_error", "message": result["error"]})
        else:
            await manager.send_to(ws, {"type": "live_order_result", "result": result})

    elif msg_type == "live_close_position":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        result = await live.close_market_position(
            symbol=msg.get("symbol", ""),
            volume=msg.get("volume", 0.1),
            price=msg.get("price", 0),
            deviation=msg.get("deviation", 10),
            reason=msg.get("reason"),
        )
        if "error" in result:
            await manager.send_to(ws, {"type": "live_error", "message": result["error"]})
        else:
            await manager.send_to(ws, {"type": "live_close_result", "result": result})

    elif msg_type == "live_sync_positions":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        positions = await live.sync_positions()
        await manager.send_to(ws, {"type": "live_positions", "positions": positions, "count": len(positions)})

    elif msg_type == "live_sync_orders":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        orders = await live.sync_orders()
        await manager.send_to(ws, {"type": "live_orders", "orders": orders, "count": len(orders)})

    elif msg_type == "live_account_info":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        info = await live.get_account_info()
        await manager.send_to(ws, {"type": "live_account_info", **info})

    elif msg_type == "live_status":
        live = getattr(manager, "live_trading", None)
        if not live:
            await manager.send_to(ws, {"type": "live_error", "message": "Live trading engine not available"})
            return
        await manager.send_to(ws, {"type": "live_status", **live.status()})

    else:
        await manager.send_to(ws, {"error": f"unknown_type: {msg_type}"})
