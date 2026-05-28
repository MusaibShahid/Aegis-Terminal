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
      if (!resp.ok) {
        setError(`Server error: ${resp.status} ${resp.statusText}`);
        setLoading(false);
        return;
      }
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSetup(data);
      }
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
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
        <svg className="w-10 h-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <div className="text-xs">Trade Assistant Unavailable</div>
        <div className="text-[9px] text-gray-600 mt-1">Backend AI service not connected</div>
      </div>
    );
  }

  const dirColor = setup?.direction === "long" ? "text-accent-green" : setup?.direction === "short" ? "text-accent-red" : "text-gray-400";
  const confColor = setup ? (setup.confidence > 70 ? "text-accent-green" : setup.confidence > 50 ? "text-accent-yellow" : "text-accent-red") : "text-gray-500";

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/5 shrink-0 bg-gradient-to-r from-accent-green/[0.02] to-transparent">
        <div className="flex gap-1.5">
          <input
            className="flex-1 bg-[#1a1d2e] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent-green/50 transition-colors uppercase tracking-wider"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="SYMBOL"
          />
          <select
            className="bg-[#1a1d2e] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-green/50 transition-colors"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["1m","5m","15m","1h","4h","1d"].map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
          <button
            className="px-3 py-1.5 rounded-lg bg-accent-green/15 text-accent-green border border-accent-green/30 text-[10px] font-semibold hover:bg-accent-green/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={analyze}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading
              </span>
            ) : "Setup"}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <label className="text-gray-500 text-[9px] uppercase tracking-wider">Qty:</label>
          <input
            className="bg-[#1a1d2e] border border-white/10 rounded-lg px-2.5 py-1 text-[10px] text-white w-24 focus:outline-none focus:border-accent-green/50 transition-colors"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {error && (
          <div className="text-accent-red text-[10px] bg-accent-red/5 rounded-lg p-2.5 border border-accent-red/10 leading-relaxed">{error}</div>
        )}

        {setup && !setup.error && (
          <div className="space-y-3">
            {/* Direction + Confidence */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="glass-card rounded-lg p-3 text-center">
                <div className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Direction</div>
                <div className={`font-mono text-lg font-bold ${dirColor}`}>
                  {setup.direction?.toUpperCase() ?? "—"}
                </div>
              </div>
              <div className="glass-card rounded-lg p-3 text-center">
                <div className="text-gray-500 text-[9px] uppercase tracking-widest mb-1">Confidence</div>
                <div className={`font-mono text-lg font-bold ${confColor}`}>{setup.confidence}%</div>
                {/* Confidence bar */}
                <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      setup.confidence > 70 ? "bg-accent-green" : setup.confidence > 50 ? "bg-accent-yellow" : "bg-accent-red"
                    }`}
                    style={{ width: `${setup.confidence}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Entry, SL, TP, RR */}
            <div className="glass-card rounded-lg p-3 space-y-1.5">
              {[
                { label: "Entry Price", value: setup.entry != null ? `$${setup.entry}` : "—", color: "text-white" },
                { label: "Stop Loss", value: setup.stop_loss != null ? `$${setup.stop_loss}` : "—", color: "text-accent-red" },
                { label: "Take Profit", value: setup.take_profit != null ? `$${setup.take_profit}` : "—", color: "text-accent-green" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between py-0.5">
                  <span className="text-gray-500 text-[10px]">{row.label}</span>
                  <span className={`font-mono text-xs font-semibold ${row.color}`}>{row.value}</span>
                </div>
              ))}
              <div className="border-t border-white/5 pt-1.5 mt-1.5 space-y-1">
                {setup.rr != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-[10px]">Risk:Reward</span>
                    <span className="text-white font-mono text-xs font-semibold">1:{setup.rr}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500 text-[10px]">ATR</span>
                  <span className="text-white font-mono text-xs font-semibold">${setup.atr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 text-[10px]">RSI</span>
                  <span className={`font-mono text-xs font-semibold ${setup.rsi > 70 ? "text-accent-red" : setup.rsi < 30 ? "text-accent-green" : "text-white"}`}>{setup.rsi}</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            {setup.summary && (
              <div className="glass-card rounded-lg p-2.5 text-[10px] text-gray-300 leading-relaxed">
                {setup.summary}
              </div>
            )}

            {/* Signals */}
            {(setup.signals ?? []).map((sig, i) => (
              <div key={i} className={`rounded-lg p-2.5 text-[10px] leading-relaxed border ${
                sig.type === "bullish" ? "bg-accent-green/[0.04] border-accent-green/15 text-accent-green" :
                sig.type === "bearish" ? "bg-accent-red/[0.04] border-accent-red/15 text-accent-red" :
                sig.type === "warning" ? "bg-accent-yellow/[0.04] border-accent-yellow/15 text-accent-yellow" :
                "bg-accent-blue/[0.04] border-accent-blue/15 text-accent-blue"
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] uppercase tracking-widest font-semibold">
                    {sig.type === "bullish" ? "🟢 Bullish" : sig.type === "bearish" ? "🔴 Bearish" : sig.type === "warning" ? "⚠ Warning" : "ℹ Info"}
                  </span>
                </div>
                {sig.text}
              </div>
            ))}

            {/* Take Trade */}
            {setup.entry && (
              <button
                className={`w-full py-2.5 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
                  setup.direction === "long"
                    ? "bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 shadow-[0_0_16px_rgba(34,197,94,0.1)] hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                    : "bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 shadow-[0_0_16px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
                } disabled:opacity-30 disabled:cursor-not-allowed`}
                onClick={takeTrade}
                disabled={saving}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Adding to Journal...
                  </span>
                ) : (
                  `Take ${(setup.direction ?? "?").toUpperCase()} — $${setup.entry}`
                )}
              </button>
            )}
          </div>
        )}

        {!setup && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs text-center">Enter a symbol and click Setup<br/>for AI-powered trade suggestions</span>
            <span className="text-[9px] text-gray-600 mt-1">Includes direction, confidence, entry, SL/TP levels</span>
          </div>
        )}
      </div>
    </div>
  );
}
