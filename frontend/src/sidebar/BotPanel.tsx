import { useState } from "react";
import { useBotStore } from "../stores/useBotStore";

const BOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BOT_STRATEGIES = [
  { id: "ema_cross", label: "EMA Cross" },
  { id: "rsi_reversal", label: "RSI Reversal" },
  { id: "macd_signal", label: "MACD Signal" },
  { id: "grid_trading", label: "Grid Trading" },
  { id: "mean_reversion", label: "Mean Reversion" },
];

export function BotPanel() {
  const bots = useBotStore((s) => s.bots);
  const toggleBot = useBotStore((s) => s.toggleBot);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState("ema_cross");
  const [config, setConfig] = useState("{}");

  const handleCreateBot = () => {
    if (bots.some((b) => b.symbol === symbol && b.strategy === strategy)) return;
    useBotStore.getState().addBot({
      symbol,
      strategy,
      enabled: true,
      config: (() => { try { return JSON.parse(config || "{}"); } catch { return {}; } })(),
    });
  };

  const handleDeleteBot = (id: string) => {
    useBotStore.getState().removeBot(id);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Create bot form */}
      <div className="p-2 border-b border-surface-border/30 space-y-1.5">
        <div className="flex gap-1">
          <select className="trade-select flex-1" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {BOT_SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="trade-select flex-1" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {BOT_STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <input
            className="flex-1 trade-input font-mono text-[9px]"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder='{"param": "value"}'
          />
          <button
            className="btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 px-3"
            onClick={handleCreateBot}
          >
            + Create
          </button>
        </div>
      </div>

      {/* Bot list */}
      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2 p-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs">No bots running</span>
            <span className="text-[10px] text-gray-700">Create a bot above to get started</span>
          </div>
        ) : (
          bots.map((bot) => (
            <div key={bot.id} className="glass-card rounded-lg px-2.5 py-2 group transition-all duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white/80 text-[11px]">{bot.symbol}</span>
                  <span className="badge-blue">{bot.strategy.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    className={`relative w-7 h-3.5 rounded-full transition-colors ${
                      bot.enabled ? "bg-accent-green/60" : "bg-gray-700"
                    }`}
                    onClick={() => toggleBot(bot.id)}
                  >
                    <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                      bot.enabled ? "translate-x-[14px]" : "translate-x-[2px]"
                    }`} />
                  </button>
                  <button
                    className="text-gray-700 hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all text-[9px] p-0.5"
                    onClick={() => handleDeleteBot(bot.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-1 text-[9px] text-gray-600">
                <span className={`inline-flex items-center gap-1 ${bot.enabled ? "text-accent-green" : "text-gray-600"}`}>
                  <span className={`w-1 h-1 rounded-full ${bot.enabled ? "bg-accent-green" : "bg-gray-600"}`} />
                  {bot.enabled ? "Active" : "Paused"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
