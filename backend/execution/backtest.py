from __future__ import annotations

import math
import time
from typing import Any

import structlog

from data_engine.fetch import fetch_history_candles
from execution.bot import TradingBot
from execution.paper_trading import PaperTradingEngine, OrderSide
from execution.orderbook import OrderBookSimulator

logger = structlog.get_logger()


async def run_backtest(
    config: dict[str, Any],
    mt5_bridge: Any | None = None,
) -> dict[str, Any]:
    """Run a backtest for a bot configuration against historical data.

    Parameters
    ----------
    config : dict
        Bot configuration (same schema as ``POST /api/bots``):
        - symbol (str, required)
        - strategy (str, required)
        - interval (str, default "1h")
        - params (dict, strategy-specific)
        - risk_params (dict, risk limits)
        - initial_capital (float, default 10_000)
        - limit (int, default 500, candles to fetch)
    mt5_bridge : MT5Bridge, optional
        MT5 bridge instance for fetching MT5-sourced data.

    Returns
    -------
    dict with keys:
        total_return, win_rate, total_trades, profit_factor,
        max_drawdown, sharpe, equity_curve, trades
    """
    symbol = config.get("symbol", "BTCUSDT").upper()
    strategy = config.get("strategy", "ema_crossover")
    interval = config.get("interval", "1h")
    params = config.get("params", {})
    risk_params = config.get("risk_params", {})
    initial_capital = config.get("initial_capital", 10_000.0)
    limit = min(config.get("limit", 500), 1000)

    # 1. Fetch historical candles using smart fallback chain
    candles, source = await fetch_history_candles(symbol, interval, limit, mt5_bridge)
    logger.info("backtest_data_source", symbol=symbol, interval=interval, source=source)

    if not candles:
        return _empty_result(initial_capital, "No historical data returned")

    # 2. Create bot + paper trading engine
    bot_config = {
        "name": f"backtest_{strategy}_{symbol}",
        "strategy": strategy,
        "symbol": symbol,
        "interval": interval,
        "params": params,
        "risk_params": risk_params,
        "enabled": True,
    }
    bot = TradingBot(bot_config)

    ob = OrderBookSimulator()
    paper = PaperTradingEngine(orderbook=ob, initial_balance=initial_capital)
    # Disable fees for backtest clarity
    await paper.update_settings(fee_model="none", slippage_bps=0)

    # 3. Run through candles
    signals: list[dict[str, Any]] = []
    equity_curve: list[dict[str, Any]] = []
    peak_equity = initial_capital
    max_drawdown_pct = 0.0
    gross_profit = 0.0
    gross_loss = 0.0

    for i, candle in enumerate(candles):
        ts = candle.get("time", 0) or int(time.time() * 1000)
        close = candle.get("close", 0)

        # Feed paper trading with price for SL/TP checks
        ob.update_last_price(symbol, close)

        if close:
            await paper.on_price(symbol, close)

        # Evaluate bot strategy
        signal = await bot.on_candle(candle)
        if signal:
            signals.append(signal)
            action = signal.get("action", "")
            volume = signal.get("volume", 0.1)

            # Execute via paper trading as market order
            result = await paper.create_order(
                symbol=symbol,
                side=action,
                order_type="market",
                quantity=volume,
                price=close,
                reason=f"signal_{strategy}",
            )
            if "error" not in result:
                logger.info(
                    "backtest_trade",
                    candle=i,
                    action=action,
                    price=close,
                    volume=volume,
                )

        # Track drawdown on EVERY candle for accuracy
        equity = paper.equity
        if equity > peak_equity:
            peak_equity = equity
        dd = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0
        if dd > max_drawdown_pct:
            max_drawdown_pct = dd

        # Record equity curve (sampled for performance)
        if i % max(1, len(candles) // 200) == 0:
            equity_curve.append({"time": ts, "equity": round(equity, 2)})

    # Final equity point
    final_equity = paper.equity
    equity_curve.append({"time": candles[-1]["time"], "equity": round(final_equity, 2)})

    # 4. Compute metrics
    total_return_pct = (
        (final_equity - initial_capital) / initial_capital * 100
        if initial_capital > 0
        else 0.0
    )

    closed_trades = paper.closed_trades
    total_trades = len(closed_trades) + len(paper.open_positions)
    wins = paper._wins
    losses = paper._losses
    win_rate = wins / (wins + losses) * 100 if (wins + losses) > 0 else 0.0

    # Profit factor
    for t in closed_trades:
        if t.pnl > 0:
            gross_profit += t.pnl
        else:
            gross_loss += abs(t.pnl)
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (
        float("inf") if gross_profit > 0 else 0.0
    )

    # Sharpe ratio (using per-trade returns)
    if len(closed_trades) >= 2:
        returns = [t.pnl_pct / 100.0 for t in closed_trades]
        mean_r = sum(returns) / len(returns)
        var_r = sum((r - mean_r) ** 2 for r in returns) / len(returns)
        sharpe = mean_r / math.sqrt(var_r) if var_r > 0 else 0.0
    else:
        sharpe = 0.0

    # Serialise trades for the frontend
    trade_list = [
        {
            "entry_time": t.opened_at,
            "exit_time": t.closed_at,
            "side": t.side.value,
            "entry_price": t.entry_price,
            "exit_price": t.exit_price,
            "quantity": t.quantity,
            "pnl": t.pnl,
            "pnl_pct": t.pnl_pct,
            "exit_reason": t.exit_reason,
        }
        for t in closed_trades[-100:]  # last 100
    ]
    # Open positions as "active" trades
    for pos in paper.open_positions:
        trade_list.append({
            "entry_time": pos.opened_at,
            "exit_time": None,
            "side": pos.side.value,
            "entry_price": pos.entry_price,
            "exit_price": None,
            "quantity": pos.quantity,
            "pnl": pos.pnl,
            "pnl_pct": pos.pnl_pct,
            "exit_reason": "open",
        })

    return {
        "total_return": round(total_return_pct, 2),
        "win_rate": round(win_rate, 1),
        "total_trades": total_trades,
        "profit_factor": round(profit_factor, 2) if profit_factor != float("inf") else None,
        "max_drawdown": round(max_drawdown_pct, 2),
        "sharpe": round(sharpe, 2),
        "final_equity": round(final_equity, 2),
        "initial_capital": initial_capital,
        "total_signals": len(signals),
        "equity_curve": equity_curve,
        "trades": trade_list,
        "symbol": symbol,
        "strategy": strategy,
        "interval": interval,
    }


def _empty_result(
    initial_capital: float, error: str = "No data"
) -> dict[str, Any]:
    return {
        "total_return": 0.0,
        "win_rate": 0.0,
        "total_trades": 0,
        "profit_factor": None,
        "max_drawdown": 0.0,
        "sharpe": 0.0,
        "final_equity": initial_capital,
        "initial_capital": initial_capital,
        "total_signals": 0,
        "equity_curve": [],
        "trades": [],
        "error": error,
    }
