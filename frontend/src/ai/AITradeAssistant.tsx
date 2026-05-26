import { useState } from "react";
import { useJournalStore } from "../stores/useJournalStore";
import { useDependencyStore } from "../stores/useDependencyStore";

interface TradeSetup {
  summary: string;
  signals: { type: string; text: string }[];
  direction: string;
  confidence: number;
  entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  rr: number | null;
  atr: number;
  rsi: number;
  error?: string;
}

export function AITradeAssistant() {
  const createEntry = useJournalStore((s) => s.createEntry);
  const isReady = useDependencyStore((s) => s.isReady("ai_assistant"));
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  const [quantity, setQuantity] = useState("0.01");
  const [setup, setSetup] = useState<TradeSetup | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setSetup(null);
    try {
      const resp = await fetch(`/api/ai/trade-setup?symbol=${symbol}&interval=${interval}`);
      const data = await resp.json();
      if (data.error) setError(data.error);
      setSetup(data);
    } catch {
      setError("Failed to fetch analysis");
    }
    setLoading(false);
  };

  const takeTrade = async () => {
    if (!setup || !setup.entry) return;
    setSaving(true);
    await createEntry({
      symbol: symbol.toUpperCase(),
      side: setup.direction as "long" | "short",
      entry_price: setup.entry,
      stop_loss: setup.stop_loss,
      take_profit: setup.take_profit,
      quantity: parseFloat(quantity) || 0.01,
      entry_reason: `AI assistant (${interval}, ${setup.confidence}% confidence)`,
      status: "open",
    });
    setSaving(false);
  };

  if (!isReady) {
    return <div className="text-gray-500 p-2 text-xs text-center">AI assistant unavailable</div>;
  }

  const dirColor = setup?.direction === "long" ? "text-accent-green" : setup?.direction === "short" ? "text-accent-red" : "text-gray-400";

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1.5 shrink-0">
        <div className="flex gap-1">
          <input
            className="flex-1 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol"
          />
          <select
            className="bg-surface border border-surface-border rounded px-1 py-1 text-xs text-white"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["1m","5m","15m","1h","4h","1d"].map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
          <button
            className="bg-accent-blue text-white px-2 rounded text-[10px] hover:bg-accent-blue/80 disabled:opacity-40"
            onClick={analyze}
            disabled={loading}
          >
            {loading ? "..." : "Setup"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-500 text-[10px]">Qty:</label>
          <input
            className="bg-surface border border-surface-border rounded px-2 py-0.5 text-xs text-white w-20"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {error && <div className="text-accent-red p-2 bg-accent-red/10 rounded">{error}</div>}

        {setup && !setup.error && (
          <div className="space-y-2">
            {/* Direction + Confidence */}
            <div className="grid grid-cols-2 gap-1">
              <div className="bg-surface-alt rounded p-2 text-center">
                <div className="text-gray-500 text-[10px]">Direction</div>
                <div className={`font-mono text-lg font-bold ${dirColor}`}>
                  {setup.direction.toUpperCase()}
                </div>
              </div>
              <div className="bg-surface-alt rounded p-2 text-center">
                <div className="text-gray-500 text-[10px]">Confidence</div>
                <div className={`font-mono text-lg font-bold ${setup.confidence > 70 ? "text-accent-green" : setup.confidence > 50 ? "text-accent-yellow" : "text-accent-red"}`}>
                  {setup.confidence}%
                </div>
              </div>
            </div>

            {/* Entry, SL, TP, RR */}
            <div className="bg-surface-alt rounded p-2 space-y-1">
              {setup.entry && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Entry</span>
                  <span className="text-white font-mono">${setup.entry}</span>
                </div>
              )}
              {setup.stop_loss && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Stop Loss</span>
                  <span className="text-accent-red font-mono">${setup.stop_loss}</span>
                </div>
              )}
              {setup.take_profit && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Take Profit</span>
                  <span className="text-accent-green font-mono">${setup.take_profit}</span>
                </div>
              )}
              {setup.rr && (
                <div className="flex justify-between pt-1 border-t border-surface-border mt-1">
                  <span className="text-gray-500">Risk:Reward</span>
                  <span className="text-white font-mono">1:{setup.rr}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">ATR</span>
                <span className="text-white font-mono">${setup.atr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">RSI</span>
                <span className={`font-mono ${setup.rsi > 70 ? "text-accent-red" : setup.rsi < 30 ? "text-accent-green" : "text-white"}`}>{setup.rsi}</span>
              </div>
            </div>

            {/* Signals */}
            {setup.signals.map((sig, i) => (
              <div key={i} className={`p-1.5 rounded text-[10px] ${
                sig.type === "bullish" ? "bg-accent-green/10 text-accent-green" :
                sig.type === "bearish" ? "bg-accent-red/10 text-accent-red" :
                sig.type === "warning" ? "bg-accent-yellow/10 text-accent-yellow" :
                "bg-accent-blue/10 text-accent-blue"
              }`}>
                {sig.text}
              </div>
            ))}

            {/* Take Trade button */}
            {setup.entry && (
              <button
                className="w-full py-1.5 rounded bg-accent-green text-white text-xs font-semibold hover:bg-accent-green/80 disabled:opacity-40"
                onClick={takeTrade}
                disabled={saving}
              >
                {saving ? "Adding..." : `Take ${setup.direction.toUpperCase()} — $${setup.entry}`}
              </button>
            )}
          </div>
        )}

        {!setup && !loading && !error && (
          <div className="text-gray-500 text-center py-4">Enter a symbol and click Setup for AI trade suggestion</div>
        )}
      </div>
    </div>
  );
}
