from __future__ import annotations

import aiosqlite
import structlog

logger = structlog.get_logger()

DB_PATH = "data/aegis.db"


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await _ensure_tables(db)
    try:
        yield db
    finally:
        await db.close()


async def _ensure_tables(db: aiosqlite.Connection) -> None:
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS layouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS watchlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            symbols TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ticks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            price REAL NOT NULL,
            volume REAL NOT NULL,
            side TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON ticks(symbol, timestamp);

        CREATE TABLE IF NOT EXISTS drawings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pane_id TEXT NOT NULL,
            tool TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            condition TEXT NOT NULL,
            symbol TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            strategy TEXT NOT NULL,
            symbol TEXT NOT NULL,
            params TEXT NOT NULL,
            risk_params TEXT NOT NULL,
            enabled INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bot_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bot_id INTEGER NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            price REAL,
            volume REAL,
            status TEXT DEFAULT 'open',
            opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS trade_journal (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL,
            quantity REAL NOT NULL,
            stop_loss REAL,
            take_profit REAL,
            entry_reason TEXT,
            exit_reason TEXT,
            pnl REAL,
            pnl_pct REAL,
            tags TEXT,
            notes TEXT,
            screenshot_path TEXT,
            status TEXT DEFAULT 'open',
            opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS paper_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            balance REAL DEFAULT 10000.0,
            initial_balance REAL DEFAULT 10000.0,
            total_pnl REAL DEFAULT 0,
            total_trades INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            slippage_bps REAL DEFAULT 1.0,
            fee_model TEXT DEFAULT 'exchange',
            taker_fee_bps REAL DEFAULT 10.0,
            maker_fee_bps REAL DEFAULT 8.0,
            total_fees_paid REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS paper_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            quantity REAL NOT NULL,
            stop_loss REAL,
            take_profit REAL,
            pnl REAL DEFAULT 0,
            pnl_pct REAL DEFAULT 0,
            status TEXT DEFAULT 'open',
            opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS paper_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_id INTEGER,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            order_type TEXT NOT NULL,
            price REAL,
            stop_price REAL,
            quantity REAL NOT NULL,
            filled_price REAL,
            filled_quantity REAL DEFAULT 0,
            status TEXT DEFAULT 'open',
            slippage REAL,
            reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            filled_at TIMESTAMP,
            FOREIGN KEY (position_id) REFERENCES paper_positions(id)
        );

        CREATE TABLE IF NOT EXISTS paper_closed_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            entry_price REAL NOT NULL,
            exit_price REAL,
            quantity REAL NOT NULL,
            pnl REAL,
            pnl_pct REAL,
            entry_reason TEXT,
            exit_reason TEXT,
            opened_at TIMESTAMP,
            closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    await db.commit()
