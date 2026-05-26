from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from websocket.manager import manager

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
        await manager.send_to(ws, {"type": "bot_toggled", "bot": bot_name})

    elif msg_type == "alert_toggle":
        alert_id = msg.get("alert_id")
        await manager.send_to(ws, {"type": "alert_toggled", "alert_id": alert_id})

    elif msg_type == "alert_create":
        alert_data = msg.get("alert", {})
        await manager.send_to(ws, {"type": "alert_created", "alert": alert_data})

    else:
        await manager.send_to(ws, {"error": f"unknown_type: {msg_type}"})
