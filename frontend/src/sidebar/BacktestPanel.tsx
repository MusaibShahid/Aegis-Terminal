import { useState } from "react";

const STRATEGIES = [
  { id: "ema_crossover", label: "EMA Crossover", params: [{ key: "fast", label: "Fast", default: 9 }, { key: "slow", label: "Slow", default: 21 }] },
  { id: "rsi", label: "RSI Strategy", params: [{ key: "period", label: "Period", default: 14 }, { key: "oversold", label: "Oversold", default: 30 }, { key: "overbought", label: "Overbought", default: 70 }] },
  { id: "macd", label: "MACD", params: [{ key: "fast", label: "Fast", default: 12 }, { key: "slow", label: "Slow", default: 26 }, { key: "signal", label: "Signal", default: 9 }] },
  { id: "bollinger", label: "Bollinger Bounce", params: [{ key: "period", label: "Period", default: 20 }, { key: "std", label: "Std Dev", default: 2 }] },
];

interface Trade {
  entry: number; exit: number; return: number; action: string; entryTime: number; exitTime: number;
}

function runBacktest(candles: { close: number; time: number }[], strategy: string, params: Record<string, number>) {
  const trades: Trade[] = [];
  let position: null | "long" = null;
  let entryPrice = 0, entryTime = 0;
  const prices = candles.map((c) => c.close);
  let pnl = 0, wins = 0, losses = 0, peak = 0, dd = 0;

  const sma = (data: number[], p: number) => {
    const r: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < p - 1) { r.push(null); continue; }
      let s = 0; for (let j = i - p + 1; j <= i; j++) s += data[j];
      r.push(s / p);
    }
    return r;
  };

  const ema = (data: number[], p: number) => {
    const r: (number | null)[] = [];
    const m = 2 / (p + 1);
    for (let i = 0; i < data.length; i++) {
      if (i < p - 1) { r.push(null); continue; }
      if (i === p - 1) { let s = 0; for (let j = 0; j <= i; j++) s += data[j]; r.push(s / p); }
      else r.push((data[i] - r[r.length - 1]!) * m + r[r.length - 1]!);
    }
    return r;
  };

  for (let i = 1; i < candles.length; i++) {
    let signal: string | null = null;
    if (strategy === "ema_crossover") {
      const fast = params.fast || 9, slow = params.slow || 21;
      const f = ema(prices, fast), s = ema(prices, slow);
      if (i >= slow && f[i] && s[i] && f[i - 1] && s[i - 1]) {
        if (f[i - 1]! <= s[i - 1]! && f[i]! > s[i]!) signal = "buy";
        if (f[i - 1]! >= s[i - 1]! && f[i]! < s[i]!) signal = "sell";
      }
    } else if (strategy === "rsi") {
      const p = params.period || 14, os = params.oversold || 30, ob = params.overbought || 70;
      const gains: number[] = [], losses: number[] = [];
      for (let k = 1; k <= i; k++) {
        const diff = prices[k] - prices[k - 1];
        gains.push(Math.max(0, diff));
        losses.push(Math.max(0, -diff));
      }
      if (i >= p) {
        const avgGain = gains.slice(-p).reduce((a, b) => a + b, 0) / p;
        const avgLoss = losses.slice(-p).reduce((a, b) => a + b, 0) / p;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsiVal = 100 - 100 / (1 + rs);
        if (i > 0) {
          const prevGains = gains.slice(-p - 1, -1);
          const prevLosses = losses.slice(-p - 1, -1);
          const prevAvgGain = prevGains.reduce((a, b) => a + b, 0) / p;
          const prevAvgLoss = prevLosses.reduce((a, b) => a + b, 0) / p;
          const prevRs = prevAvgLoss === 0 ? 100 : prevAvgGain / prevAvgLoss;
          const prevRsi = 100 - 100 / (1 + prevRs);
          if (prevRsi <= os && rsiVal > os) signal = "buy";
          if (prevRsi >= ob && rsiVal < ob) signal = "sell";
        }
      }
    }

    const price = prices[i];
    if (signal === "buy" && !position) {
      position = "long"; entryPrice = price; entryTime = candles[i].time;
    } else if (signal === "sell" && position === "long") {
      const ret = (price - entryPrice) / entryPrice;
      trades.push({ entry: entryPrice, exit: price, return: ret, action: "long", entryTime, exitTime: candles[i].time });
      pnl += ret; if (ret > 0) wins++; else losses++;
      position = null;
      peak = Math.max(peak, pnl); dd = Math.max(dd, peak - pnl);
    }
  }

  const total = wins + losses;
  return {
    pnl: pnl.toFixed(4),
    winRate: total > 0 ? ((wins / total) * 100).toFixed(1) : "0",
    trades: trades.length,
    sharpe: trades.length > 1 ? (pnl / trades.length) / (trades.reduce((s, t) => s + (t.return - pnl / trades.length) ** 2, 0) / trades.length) ** 0.5 || 0 : 0,
    drawdown: dd.toFixed(4),
    profitFactor: losses > 0 ? (wins / losses).toFixed(2) : "∞",
  };
}

export function BacktestPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  const [strategy, setStrategy] = useState("ema_crossover");
  const [params, setParams] = useState<Record<string, number>>({ fast: 9, slow: 21 });
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const strategyDef = STRATEGIES.find((s) => s.id === strategy);

  const handleStrategyChange = (id: string) => {
    setStrategy(id);
    const def = STRATEGIES.find((s) => s.id === id);
    if (def) {
      const p: Record<string, number> = {};
      def.params.forEach((param) => { p[param.key] = param.default; });
      setParams(p);
    }
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const resp = await fetch(`/api/history?symbol=${symbol}&interval=${interval}&limit=500`);
      const data = await resp.json();
      if (data.candles?.length) {
        const res = runBacktest(data.candles, strategy, params);
        setResult(res);
      }
    } catch { /* ignore */ }
    setRunning(false);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1 shrink-0">
        <input
          className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="Symbol"
        />
        <select
          className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
        >
          {["1m","5m","15m","30m","1h","4h","1d"].map((iv) => (
            <option key={iv} value={iv}>{iv}</option>
          ))}
        </select>
        <select
          className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white"
          value={strategy}
          onChange={(e) => handleStrategyChange(e.target.value)}
        >
          {STRATEGIES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        {strategyDef?.params.map((param) => (
          <div key={param.key} className="flex items-center gap-2">
            <span className="text-gray-400 w-16">{param.label}</span>
            <input
              className="flex-1 bg-surface border border-surface-border rounded px-2 py-0.5 text-xs text-white"
              type="number"
              value={params[param.key] ?? param.default}
              onChange={(e) => setParams({ ...params, [param.key]: parseFloat(e.target.value) || param.default })}
            />
          </div>
        ))}
        <button
          className="w-full bg-accent-blue text-white rounded py-1 text-xs hover:bg-accent-blue/80 disabled:opacity-40"
          onClick={run}
          disabled={running}
        >
          {running ? "Running..." : "Run Backtest"}
        </button>
      </div>

      {result && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="grid grid-cols-2 gap-1">
            {[
              { label: "PnL", value: result.pnl, className: parseFloat(result.pnl) >= 0 ? "text-accent-green" : "text-accent-red" },
              { label: "Win Rate", value: `${result.winRate}%` },
              { label: "Trades", value: result.trades },
              { label: "Sharpe", value: typeof result.sharpe === "number" ? result.sharpe.toFixed(2) : "0" },
              { label: "Max DD", value: result.drawdown, className: "text-accent-red" },
              { label: "Profit Factor", value: result.profitFactor },
            ].map((m) => (
              <div key={m.label} className="bg-surface-alt rounded p-1.5">
                <div className="text-gray-500 text-[10px]">{m.label}</div>
                <div className={`font-mono text-sm ${m.className || "text-white"}`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
