"""MT5 worker — runs under 32-bit Python, streams ticks/quotes as JSON lines to stdout.
Accepts commands via stdin (each line is a JSON request).

Usage (from main 64-bit process):
    subprocess = await asyncio.create_subprocess_exec(
        "C:/Python310-32/python.exe", "mt5_worker.py",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
    )
    # read lines from subprocess.stdout
    # write commands to subprocess.stdin
"""
import json
import os
import sys
import time

try:
    import MetaTrader5 as mt5
except ImportError:
    print(json.dumps({"type": "error", "message": "MetaTrader5 not installed"}))
    sys.exit(1)

SYMBOLS = ["XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "NZDUSD"]

INTERVAL_MAP = {
    1: "1m", 5: "5m", 15: "15m", 30: "30m",
    60: "1h", 240: "4h", 1440: "1d", 10080: "1w",
}
TF_MAP = {v: k for k, v in INTERVAL_MAP.items()}

# Allow non-blocking stdin reads
import threading


def emit(obj: dict) -> None:
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def handle_fetch_history(request: dict) -> None:
    """Fetch historical candles using the existing MT5 connection."""
    symbol = request.get("symbol", "").upper()
    timeframe = request.get("timeframe", 1)
    count = request.get("count", 100)
    req_id = request.get("id", 0)

    if not symbol:
        emit({"type": "history_result", "id": req_id, "error": "No symbol specified"})
        return

    try:
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
        if rates is None or len(rates) == 0:
            emit({"type": "history_result", "id": req_id, "error": f"No rates for {symbol} TF={timeframe}"})
            return

        candles = []
        for r in rates:
            candles.append({
                "time": int(r[0]) * 1000,
                "open": float(r[1]),
                "high": float(r[2]),
                "low": float(r[3]),
                "close": float(r[4]),
                "volume": float(r[5]),
            })

        emit({"type": "history_result", "id": req_id, "candles": candles})
    except Exception as exc:
        emit({"type": "history_result", "id": req_id, "error": str(exc)})


def stdin_reader():
    """Read JSON commands from stdin in a background thread."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            cmd = req.get("command", "")
            if cmd == "fetch_history":
                handle_fetch_history(req)
        except json.JSONDecodeError:
            pass


def main():
    initialized = mt5.initialize()
    if not initialized:
        emit({"type": "error", "message": f"MT5 init failed: {mt5.last_error()}"})
        return

    info = mt5.account_info()
    if info is None:
        emit({"type": "error", "message": "MT5 account_info returned None"})
        return
    emit({"type": "connected", "account": info.login, "server": info.server, "balance": info.balance})

    # Start stdin reader thread
    reader_thread = threading.Thread(target=stdin_reader, daemon=True)
    reader_thread.start()

    last_quotes: dict[str, dict] = {}
    last_rates: dict[str, dict] = {}

    while True:
        try:
            now = int(time.time())

            # --- Quotes (every 200ms) ---
            for sym in SYMBOLS:
                tick = mt5.symbol_info_tick(sym)
                if tick is None:
                    continue
                prev = last_quotes.get(sym)
                if prev and prev["bid"] == tick.bid and prev["ask"] == tick.ask:
                    continue
                last_quotes[sym] = {"bid": tick.bid, "ask": tick.ask}
                emit({
                    "type": "quote",
                    "symbol": sym,
                    "bid": tick.bid,
                    "ask": tick.ask,
                    "timestamp": int(tick.time) * 1000,
                })

            # --- Rates (every 5s for 1m candles) ---
            for sym in SYMBOLS:
                rates = mt5.copy_rates_from_pos(sym, 1, 0, 2)
                if rates is None or len(rates) == 0:
                    continue
                r = rates[-1]
                # numpy void fields: index 0=time,1=open,2=high,3=low,4=close,5=tick_volume,6=spread,7=real_volume
                t = int(r[0])
                key = f"{sym}:1m"
                prev = last_rates.get(key)
                if prev and prev["time"] == t:
                    continue
                last_rates[key] = {"time": t}
                emit({
                    "type": "candle",
                    "symbol": sym,
                    "interval": "1m",
                    "time": t * 1000,
                    "open": float(r[1]),
                    "high": float(r[2]),
                    "low": float(r[3]),
                    "close": float(r[4]),
                    "volume": float(r[5]),
                })

            time.sleep(0.2)

        except KeyboardInterrupt:
            break
        except Exception as exc:
            emit({"type": "error", "message": str(exc)})
            time.sleep(1)

    mt5.shutdown()
    emit({"type": "disconnected"})


if __name__ == "__main__":
    main()
