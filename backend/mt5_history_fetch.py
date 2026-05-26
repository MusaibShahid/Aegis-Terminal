"""One-shot MT5 history fetch — invoked as a subprocess by MT5Bridge.

Usage:
    C:\\Python310-32\\python.exe mt5_history_fetch.py <symbol> <timeframe> <count>

Outputs JSON array of candles to stdout.
"""
import json
import sys

try:
    import MetaTrader5 as mt5
except ImportError:
    print(json.dumps({"error": "MetaTrader5 not installed"}))
    sys.exit(1)


def main():
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Usage: mt5_history_fetch.py SYMBOL TIMEFRAME COUNT"}))
        sys.exit(1)

    symbol = sys.argv[1].upper()
    timeframe = int(sys.argv[2])
    count = int(sys.argv[3])

    initialized = mt5.initialize()
    if not initialized:
        print(json.dumps({"error": f"MT5 init failed: {mt5.last_error()}"}))
        sys.exit(1)

    try:
        rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
        if rates is None or len(rates) == 0:
            print(json.dumps({"error": f"No rates returned for {symbol}"}))
            sys.exit(1)

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

        print(json.dumps(candles))
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
