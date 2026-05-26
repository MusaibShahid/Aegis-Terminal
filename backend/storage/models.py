from __future__ import annotations

import json

import aiosqlite
import structlog
from pydantic import BaseModel

logger = structlog.get_logger()


class Watchlist(BaseModel):
    id: int | None = None
    name: str
    symbols: list[str]

    @classmethod
    async def get_all(cls, db: aiosqlite.Connection) -> list[dict]:
        cursor = await db.execute("SELECT id, name, symbols FROM watchlists ORDER BY id")
        rows = await cursor.fetchall()
        return [{"id": r[0], "name": r[1], "symbols": json.loads(r[2])} for r in rows]

    @classmethod
    async def create(cls, db: aiosqlite.Connection, name: str, symbols: list[str]) -> dict:
        cursor = await db.execute(
            "INSERT INTO watchlists (name, symbols) VALUES (?, ?)", (name, json.dumps(symbols))
        )
        await db.commit()
        return {"id": cursor.lastrowid, "name": name, "symbols": symbols}

    @classmethod
    async def delete(cls, db: aiosqlite.Connection, watchlist_id: int) -> None:
        await db.execute("DELETE FROM watchlists WHERE id = ?", (watchlist_id,))
        await db.commit()


class Layout(BaseModel):
    id: int | None = None
    name: str
    data: dict

    @classmethod
    async def get_all(cls, db: aiosqlite.Connection) -> list[dict]:
        cursor = await db.execute("SELECT id, name, data FROM layouts ORDER BY id")
        rows = await cursor.fetchall()
        return [{"id": r[0], "name": r[1], "data": json.loads(r[2])} for r in rows]

    @classmethod
    async def create(cls, db: aiosqlite.Connection, data: dict) -> dict:
        name = data.get("name", "default")
        cursor = await db.execute(
            "INSERT INTO layouts (name, data) VALUES (?, ?)", (name, json.dumps(data))
        )
        await db.commit()
        return {"id": cursor.lastrowid, "name": name, "data": data}

    @classmethod
    async def delete(cls, db: aiosqlite.Connection, layout_id: int) -> None:
        await db.execute("DELETE FROM layouts WHERE id = ?", (layout_id,))
        await db.commit()


class Drawing(BaseModel):
    id: int | None = None
    pane_id: str
    tool: str
    data: dict

    @classmethod
    async def get_by_pane(cls, db: aiosqlite.Connection, pane_id: str) -> list[dict]:
        cursor = await db.execute(
            "SELECT id, pane_id, tool, data FROM drawings WHERE pane_id = ? ORDER BY id", (pane_id,)
        )
        rows = await cursor.fetchall()
        return [{"id": r[0], "pane_id": r[1], "tool": r[2], "data": json.loads(r[3])} for r in rows]

    @classmethod
    async def create(cls, db: aiosqlite.Connection, pane_id: str, tool: str, data: dict) -> dict:
        cursor = await db.execute(
            "INSERT INTO drawings (pane_id, tool, data) VALUES (?, ?, ?)",
            (pane_id, tool, json.dumps(data)),
        )
        await db.commit()
        return {"id": cursor.lastrowid, "pane_id": pane_id, "tool": tool, "data": data}

    @classmethod
    async def delete(cls, db: aiosqlite.Connection, drawing_id: int) -> None:
        await db.execute("DELETE FROM drawings WHERE id = ?", (drawing_id,))
        await db.commit()


class Alert(BaseModel):
    id: int | None = None
    name: str
    type: str
    condition: dict
    symbol: str
    enabled: bool = True

    @classmethod
    async def get_all(cls, db: aiosqlite.Connection) -> list[dict]:
        cursor = await db.execute("SELECT * FROM alerts ORDER BY id")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    @classmethod
    async def create(cls, db: aiosqlite.Connection, name: str, alert_type: str, condition: dict, symbol: str) -> dict:
        cursor = await db.execute(
            "INSERT INTO alerts (name, type, condition, symbol) VALUES (?, ?, ?, ?)",
            (name, alert_type, json.dumps(condition), symbol),
        )
        await db.commit()
        return {"id": cursor.lastrowid, "name": name, "type": alert_type, "condition": condition, "symbol": symbol}

    @classmethod
    async def toggle(cls, db: aiosqlite.Connection, alert_id: int) -> None:
        await db.execute("UPDATE alerts SET enabled = NOT enabled WHERE id = ?", (alert_id,))
        await db.commit()

    @classmethod
    async def delete(cls, db: aiosqlite.Connection, alert_id: int) -> None:
        await db.execute("DELETE FROM alerts WHERE id = ?", (alert_id,))
        await db.commit()


class TradeJournal(BaseModel):
    id: int | None = None
    symbol: str
    side: str
    entry_price: float
    exit_price: float | None = None
    quantity: float
    stop_loss: float | None = None
    take_profit: float | None = None
    entry_reason: str | None = None
    exit_reason: str | None = None
    pnl: float | None = None
    pnl_pct: float | None = None
    tags: str | None = None
    notes: str | None = None
    screenshot_path: str | None = None
    status: str = "open"
    opened_at: str | None = None
    closed_at: str | None = None

    @classmethod
    async def get_all(cls, db: aiosqlite.Connection) -> list[dict]:
        cursor = await db.execute("SELECT * FROM trade_journal ORDER BY created_at DESC")
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]

    @classmethod
    async def get_by_id(cls, db: aiosqlite.Connection, trade_id: int) -> dict | None:
        cursor = await db.execute("SELECT * FROM trade_journal WHERE id = ?", (trade_id,))
        r = await cursor.fetchone()
        return dict(r) if r else None

    @classmethod
    async def create(cls, db: aiosqlite.Connection, data: dict) -> dict:
        fields = [
            "symbol", "side", "entry_price", "exit_price", "quantity",
            "stop_loss", "take_profit", "entry_reason", "exit_reason",
            "pnl", "pnl_pct", "tags", "notes", "screenshot_path", "status",
        ]
        vals = {k: (json.dumps(data[k]) if isinstance(data.get(k), (list, dict)) else data.get(k)) for k in fields}
        cursor = await db.execute(
            """INSERT INTO trade_journal
               (symbol, side, entry_price, exit_price, quantity, stop_loss,
                take_profit, entry_reason, exit_reason, pnl, pnl_pct,
                tags, notes, screenshot_path, status)
               VALUES (:symbol, :side, :entry_price, :exit_price, :quantity,
                       :stop_loss, :take_profit, :entry_reason, :exit_reason,
                       :pnl, :pnl_pct, :tags, :notes, :screenshot_path, :status)""",
            vals,
        )
        await db.commit()
        return {"id": cursor.lastrowid, **{k: v for k, v in vals.items() if v is not None}}

    @classmethod
    async def update(cls, db: aiosqlite.Connection, trade_id: int, data: dict) -> dict | None:
        existing = await cls.get_by_id(db, trade_id)
        if not existing:
            return None
        allowed = {
            "exit_price", "exit_reason", "pnl", "pnl_pct", "tags",
            "notes", "screenshot_path", "status", "closed_at",
        }
        updates = {k: v for k, v in data.items() if k in allowed and v is not None}
        if not updates:
            return existing
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        vals = [(json.dumps(v) if isinstance(v, (list, dict)) else v) for v in updates.values()]
        vals.append(trade_id)
        await db.execute(f"UPDATE trade_journal SET {set_clause} WHERE id = ?", vals)
        await db.commit()
        return await cls.get_by_id(db, trade_id)

    @classmethod
    async def delete(cls, db: aiosqlite.Connection, trade_id: int) -> None:
        await db.execute("DELETE FROM trade_journal WHERE id = ?", (trade_id,))
        await db.commit()

    @classmethod
    async def get_stats(cls, db: aiosqlite.Connection) -> dict:
        cursor = await db.execute(
            "SELECT COUNT(*) as total, SUM(CASE WHEN status='closed' AND pnl>0 THEN 1 ELSE 0 END) as wins, "
            "SUM(CASE WHEN status='closed' AND pnl<0 THEN 1 ELSE 0 END) as losses, "
            "SUM(pnl) as total_pnl, AVG(pnl) as avg_pnl "
            "FROM trade_journal"
        )
        r = await cursor.fetchone()
        if not r:
            return {"total": 0, "wins": 0, "losses": 0, "total_pnl": 0, "avg_pnl": 0, "win_rate": 0}
        d = dict(r)
        total = d["total"] or 0
        wins = d["wins"] or 0
        losses = d["losses"] or 0
        return {
            "total": total,
            "wins": wins,
            "losses": losses,
            "total_pnl": round(d["total_pnl"] or 0, 2),
            "avg_pnl": round(d["avg_pnl"] or 0, 2),
            "win_rate": round((wins / total * 100) if total > 0 else 0, 1),
        }
