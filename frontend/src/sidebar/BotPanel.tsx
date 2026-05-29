import { useState, useEffect, useCallback } from "react";
import { useBotStore } from "../stores/useBotStore";
import type { BotConfig } from "../types";

const API_BASE = "/api";
const BOT_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const BOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BOT_STRATEGIES = [
  { id: "ema_crossover", label: "EMA Crossover" },
  { id: "rsi", label: "RSI Reversal" },
  { id: "macd", label: "MACD Signal" },
  { id: "bollinger", label: "Bollinger Bands" },
];

/** Fetch bots from backend and sync local store. */
async function fetchBots() {
  try {
    const res = await fetch(`${API_BASE}/bots`);
    if (!res.ok) return;
    const data = await res.json();
    const bots: BotConfig[] = (data.bots || []).map((b: any, i: number) => ({
      id: i + 1,
      name: b.name,
      strategy: b.strategy,
      symbol: b.symbol,
      interval: b.interval || "1m",
      params: b.params || {},
      riskParams: b.risk_params || {},
      enabled: b.enabled,
      liveMode: b.live_mode ?? false,
    }));
    useBotStore.getState().setBots(bots);
  } catch {
    // Backend unavailable — use local state only
  }
}

export function BotPanel() {
  const bots = useBotStore((s) => s.bots);
  const setBots = useBotStore((s) => s.setBots);
  const toggleBot = useBotStore((s) => s.toggleBot);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState("ema_crossover");
  const [interval, setInterval] = useState("1h");
  const [config, setConfig] = useState("{}");
  const [liveMode, setLiveMode] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Fetch bots from backend on mount
  useEffect(() => {
    fetchBots();
  }, []);

  const handleCreateBot = async () => {
    if (bots.some((b) => b.symbol === symbol && b.strategy === strategy)) return;
    const parsedConfig = (() => { try { return JSON.parse(config || "{}"); } catch { return {}; } })();

    setSyncing(true);
    try {
      // Create bot on backend
      const res = await fetch(`${API_BASE}/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${strategy}_${symbol}`,
          strategy,
          symbol,
          interval,
          params: parsedConfig,
          risk_params: { max_position_size: 1.0, max_daily_loss: 500, cooldown_seconds: 60 },
          enabled: true,
          live_mode: liveMode,
        }),
      });
      if (res.ok) {
        await fetchBots(); // Re-fetch to stay in sync
      }
    } catch {
      // Backend unavailable — add locally
      useBotStore.getState().addBot({
        id: Date.now(),
        name: `${strategy}_${symbol}`,
        symbol,
        interval,
        strategy: strategy as BotConfig["strategy"],
        params: parsedConfig,
        riskParams: { max_position_size: 1.0, max_daily_loss: 500, cooldown_seconds: 60 },
        enabled: true,
        liveMode,
      });
    } finally {
      setSyncing(false);
    }
    setConfig("{}");
    setLiveMode(false);
  };

  const handleDeleteBot = useCallback(async (id: number) => {
    const bot = bots.find((b) => b.id === id);
    if (!bot) return;

    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/bots/${encodeURIComponent(bot.name)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchBots();
      } else {
        useBotStore.getState().removeBot(id);
      }
    } catch {
      useBotStore.getState().removeBot(id);
    } finally {
      setSyncing(false);
    }
  }, [bots]);

  const handleToggleBot = useCallback(async (id: number) => {
    const bot = bots.find((b) => b.id === id);
    if (!bot) return;

    // Optimistic local toggle
    toggleBot(id);

    try {
      await fetch(`${API_BASE}/bots/${encodeURIComponent(bot.name)}/toggle`, {
        method: "POST",
      });
    } catch {
      // Revert on failure
      toggleBot(id);
    }
  }, [bots, toggleBot]);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Create bot form */}
      <div className="p-2 border-b border-surface-border/30 space-y-1.5">
        <div className="flex gap-1">
          <select className="trade-select flex-[1.3]" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {BOT_SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="trade-select w-[56px]" value={interval} onChange={(e) => setInterval(e.target.value)}>
            {BOT_INTERVALS.map((iv) => (
              <option key={iv} value={iv}>{iv}</option>
            ))}
          </select>
          <select className="trade-select flex-1" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {BOT_STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none group">
            <div
              className={`relative w-7 h-3.5 rounded-full transition-colors ${
                liveMode ? "bg-accent-red/60" : "bg-gray-700"
              }`}
              onClick={() => setLiveMode(!liveMode)}
            >
              <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                liveMode ? "translate-x-[14px]" : "translate-x-[2px]"
              }`} />
            </div>
            <span className={`text-[9px] font-medium ${liveMode ? "text-accent-red" : "text-text-tertiary"}`}>
              {liveMode ? "Live" : "Paper"}
            </span>
          </label>
          <input
            className="flex-1 trade-input font-mono text-[9px]"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            placeholder='{"param": "value"}'
          />
          <button
            className={`btn-primary px-3 transition-all ${
              syncing
                ? "bg-gray-700 text-text-secondary border border-gray-600 cursor-wait"
                : "bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25"
            }`}
            onClick={handleCreateBot}
            disabled={syncing}
          >
            {syncing ? "..." : "+ Create"}
          </button>
        </div>
      </div>

      {/* Bot list */}
      <div className="flex-1 overflow-y-auto p-1 space-y-1">
        {bots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted gap-2 p-4">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs">No bots running</span>
            <span className="text-[10px] text-text-muted">Create a bot above to get started</span>
          </div>
        ) : (
          bots.map((bot) => (
            <div key={bot.id} className="glass-card rounded-lg px-2.5 py-2 group transition-all duration-150">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-text-secondary text-[11px]">{bot.symbol}</span>
                  <span className="badge-gray text-[9px]">{bot.interval || "1m"}</span>
                  <span className="badge-blue">{bot.strategy.replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Live mode indicator */}
                  <span className={`inline-flex items-center gap-1 text-[9px] px-1 py-0.5 rounded ${
                    bot.liveMode
                      ? "text-accent-red bg-accent-red/10 border border-accent-red/20"
                      : "text-text-muted bg-gray-800/40 border border-gray-700/30"
                  }`}>
                    <span className={`w-1 h-1 rounded-full ${bot.liveMode ? "bg-accent-red" : "bg-gray-600"}`} />
                    {bot.liveMode ? "Live" : "Paper"}
                  </span>
                  <button
                    className={`relative w-7 h-3.5 rounded-full transition-colors ${
                      bot.enabled ? "bg-accent-green/60" : "bg-gray-700"
                    }`}
                    onClick={() => bot.id != null && handleToggleBot(bot.id)}
                  >
                    <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                      bot.enabled ? "translate-x-[14px]" : "translate-x-[2px]"
                    }`} />
                  </button>
                  <button
                    className="text-text-muted hover:text-accent-red opacity-0 group-hover:opacity-100 transition-all text-[9px] p-0.5"
                    onClick={() => bot.id != null && handleDeleteBot(bot.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex gap-2 mt-1 text-[9px] text-text-muted">
                <span className={`inline-flex items-center gap-1 ${bot.enabled ? "text-accent-green" : "text-text-muted"}`}>
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
