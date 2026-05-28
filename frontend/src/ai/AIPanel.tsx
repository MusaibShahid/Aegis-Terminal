import { useState } from "react";
import { useDependencyStore } from "../stores/useDependencyStore";

interface AnalysisResult {
  summary: string;
  signals: { type: string; text: string }[];
  trend: string;
  rsi: number;
  volatility: string;
  risk: string;
  change_pct: number;
  error?: string;
}

export function AIPanel() {
  const isReady = useDependencyStore((s) => s.isReady("ai_assistant"));
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`/api/ai/analyze?symbol=${symbol}&interval=${interval}`);
      if (!resp.ok) {
        setError(`Server error: ${resp.status} ${resp.statusText}`);
        setLoading(false);
        return;
      }
      const data = await resp.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        setChat((prev) => [
          ...prev,
          { role: "user", text: `Analyze ${symbol} (${interval})` },
          { role: "assistant", text: data.summary },
        ]);
      }
    } catch {
      setError("Failed to fetch analysis");
    }
    setLoading(false);
  };

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
        <svg className="w-10 h-10 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <div className="text-xs">AI Assistant Unavailable</div>
        <div className="text-[9px] text-gray-600 mt-1">Backend AI service not connected</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/5 shrink-0 bg-gradient-to-r from-accent-blue/[0.03] to-transparent">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              className="w-full bg-[#1a1d2e] border border-white/10 rounded-lg pl-2.5 pr-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue/50 transition-colors uppercase tracking-wider"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="SYMBOL"
            />
          </div>
          <select
            className="bg-[#1a1d2e] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent-blue/50 transition-colors"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          >
            {["1m","5m","15m","1h","4h","1d"].map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
          <button
            className="px-3 py-1.5 rounded-lg bg-accent-blue/15 text-accent-blue border border-accent-blue/30 text-[10px] font-semibold hover:bg-accent-blue/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={analyze}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-1">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing
              </span>
            ) : "Analyze"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
        {error && (
          <div className="text-accent-red text-[10px] bg-accent-red/5 rounded-lg p-2.5 border border-accent-red/10 leading-relaxed">
            {error}
          </div>
        )}

        {result && !result.error && (
          <div className="space-y-3">
            {/* Metrics Cards */}
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: "Trend", value: result.trend, color: result.trend === "uptrend" ? "text-accent-green" : result.trend === "downtrend" ? "text-accent-red" : "text-gray-400" },
                { label: "RSI", value: result.rsi, color: result.rsi > 70 ? "text-accent-red" : result.rsi < 30 ? "text-accent-green" : "text-white" },
                { label: "Change", value: `${result.change_pct >= 0 ? "+" : ""}${result.change_pct}%`, color: result.change_pct >= 0 ? "text-accent-green" : "text-accent-red" },
              ].map((m) => (
                <div key={m.label} className="glass-card rounded-lg p-2.5 text-center">
                  <div className="text-gray-500 text-[9px] uppercase tracking-widest mb-0.5">{m.label}</div>
                  <div className={`font-mono text-sm font-bold ${m.color}`}>
                    {typeof m.value === "number" ? m.value.toFixed(1) : m.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            {result.summary && (
              <div className="glass-card rounded-lg p-2.5 text-[10px] text-gray-300 leading-relaxed">
                {result.summary}
              </div>
            )}

            {/* Signals */}
            {result.signals?.map((sig, i) => (
              <div
                key={i}
                className={`rounded-lg p-2.5 text-[10px] leading-relaxed border ${
                  sig.type === "bullish" ? "bg-accent-green/[0.04] border-accent-green/15 text-accent-green" :
                  sig.type === "bearish" ? "bg-accent-red/[0.04] border-accent-red/15 text-accent-red" :
                  sig.type === "warning" ? "bg-accent-yellow/[0.04] border-accent-yellow/15 text-accent-yellow" :
                  "bg-accent-blue/[0.04] border-accent-blue/15 text-accent-blue"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] uppercase tracking-widest font-semibold">
                    {sig.type === "bullish" ? "🟢 Bullish" : sig.type === "bearish" ? "🔴 Bearish" : sig.type === "warning" ? "⚠ Warning" : "ℹ Info"}
                  </span>
                </div>
                {sig.text}
              </div>
            ))}
          </div>
        )}

        {chat.length === 0 && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-gray-500">
            <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="text-xs">Enter a symbol and click Analyze for AI insights</span>
            <span className="text-[9px] text-gray-600 mt-1">Multi-timeframe analysis with trend, RSI, and volatility</span>
          </div>
        )}
      </div>
    </div>
  );
}
