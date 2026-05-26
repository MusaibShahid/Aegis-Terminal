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
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);

  const analyze = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/ai/analyze?symbol=${symbol}&interval=${interval}`);
      const data = await resp.json();
      setResult(data);
      if (!data.error) {
        setChat((prev) => [
          ...prev,
          { role: "user", text: `Analyze ${symbol} (${interval})` },
          { role: "assistant", text: data.summary },
        ]);
      }
    } catch {}
    setLoading(false);
  };

  if (!isReady) {
    return <div className="text-gray-500 p-2 text-xs text-center">AI assistant unavailable</div>;
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="p-2 border-b border-surface-border space-y-1 shrink-0">
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
            {loading ? "..." : "Go"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {result && !result.error && (
          <div className="space-y-2">
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-1">
              <div className="bg-surface-alt rounded p-1">
                <div className="text-gray-500 text-[10px]">Trend</div>
                <div className={`font-mono text-sm ${result.trend === "uptrend" ? "text-accent-green" : result.trend === "downtrend" ? "text-accent-red" : "text-gray-400"}`}>
                  {result.trend}
                </div>
              </div>
              <div className="bg-surface-alt rounded p-1">
                <div className="text-gray-500 text-[10px]">RSI</div>
                <div className={`font-mono text-sm ${result.rsi > 70 ? "text-accent-red" : result.rsi < 30 ? "text-accent-green" : "text-white"}`}>
                  {result.rsi}
                </div>
              </div>
              <div className="bg-surface-alt rounded p-1">
                <div className="text-gray-500 text-[10px]">Change</div>
                <div className={`font-mono text-sm ${result.change_pct >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {result.change_pct >= 0 ? "+" : ""}{result.change_pct}%
                </div>
              </div>
            </div>

            {/* Signals */}
            {result.signals.map((sig, i) => (
              <div
                key={i}
                className={`p-1.5 rounded text-[10px] ${
                  sig.type === "bullish" ? "bg-accent-green/10 text-accent-green" :
                  sig.type === "bearish" ? "bg-accent-red/10 text-accent-red" :
                  sig.type === "warning" ? "bg-accent-yellow/10 text-accent-yellow" :
                  "bg-accent-blue/10 text-accent-blue"
                }`}
              >
                {sig.text}
              </div>
            ))}
          </div>
        )}

        {chat.length === 0 && !loading && (
          <div className="text-gray-500 text-center py-4">Enter a symbol and click Go for AI analysis</div>
        )}
      </div>
    </div>
  );
}
