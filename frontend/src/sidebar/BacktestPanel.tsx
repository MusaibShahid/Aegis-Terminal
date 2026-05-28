import { useState } from "react";

export function BacktestPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState("ema_cross");
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2025-06-01");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any> | null>(null);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, strategy, start_date: startDate, end_date: endDate }),
      });
      const data = await res.json();
      setResults(data);
    } catch {
      // ignore
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs p-2 space-y-2">
      <div className="space-y-1.5">
        <div className="flex gap-1">
          <input className="flex-1 trade-input text-xs font-mono" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="Symbol" />
          <select className="trade-select flex-[2]" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            <option value="ema_cross">EMA Cross</option>
            <option value="rsi_reversal">RSI Reversal</option>
            <option value="macd_signal">MACD Signal</option>
          </select>
        </div>
        <div className="flex gap-1">
          <input className="flex-1 trade-input text-[10px]" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className="flex-1 trade-input text-[10px]" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button
          className="w-full btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 disabled:opacity-40"
          onClick={handleRun}
          disabled={running}
        >
          {running ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
              Running...
            </span>
          ) : "Run Backtest"}
        </button>
      </div>

      {results && (
        <div className="glass-card rounded-lg p-2.5 space-y-2 animate-fade-in">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider font-semibold">Results</div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { label: "Total Return", value: `${results.total_return?.toFixed(2) ?? "N/A"}%`, color: (results.total_return ?? 0) >= 0 ? "text-accent-green" : "text-accent-red" },
              { label: "Win Rate", value: `${results.win_rate?.toFixed(1) ?? "N/A"}%`, color: (results.win_rate ?? 0) >= 50 ? "text-accent-green" : "text-accent-red" },
              { label: "Trades", value: String(results.total_trades ?? "N/A") },
              { label: "Profit Factor", value: results.profit_factor?.toFixed(2) ?? "N/A", color: (results.profit_factor ?? 0) >= 1.5 ? "text-accent-green" : "text-accent-red" },
              { label: "Max Drawdown", value: `${results.max_drawdown?.toFixed(2) ?? "N/A"}%`, color: "text-accent-red" },
              { label: "Sharpe", value: results.sharpe?.toFixed(2) ?? "N/A", color: (results.sharpe ?? 0) >= 1 ? "text-accent-green" : "text-accent-red" },
            ].map((m) => (
              <div key={m.label} className="bg-surface-alt/30 rounded p-1.5">
                <div className="text-[9px] text-gray-600">{m.label}</div>
                <div className={`text-[11px] font-mono font-semibold tabular-nums ${m.color ?? "text-white/80"}`}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!results && !running && (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-600 gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-xs">Configure and run a backtest</span>
        </div>
      )}
    </div>
  );
}
