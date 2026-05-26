import { useState } from "react";
import { useBotStore } from "../stores/useBotStore";
import type { BotConfig } from "../types";

const STRATEGIES = ["ema_crossover", "rsi", "macd", "bollinger"];

export function BotPanel() {
  const bots = useBotStore((s) => s.bots);
  const signals = useBotStore((s) => s.signals);
  const addBot = useBotStore((s) => s.addBot);
  const removeBot = useBotStore((s) => s.removeBot);
  const toggleBot = useBotStore((s) => s.toggleBot);
  const addPosition = useBotStore((s) => s.addPosition);
  const removePosition = useBotStore((s) => s.removePosition);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", strategy: "ema_crossover", symbol: "BTCUSDT", fast: 9, slow: 21 });

  const handleCreate = async () => {
    const bot: BotConfig = {
      id: Date.now(),
      name: form.name || form.strategy,
      strategy: form.strategy as BotConfig["strategy"],
      symbol: form.symbol,
      params: { fast: form.fast, slow: form.slow },
      riskParams: { max_position_size: 1, max_daily_loss: 500 },
      enabled: false,
    };
    addBot(bot);
    setShowForm(false);
  };

  const handleToggle = async (bot: BotConfig) => {
    toggleBot(bot.id!);
    if (!bot.enabled) {
      addPosition({ bot: bot.name, symbol: bot.symbol, side: "buy", price: 0, volume: 0.1 });
    } else {
      removePosition(bot.name);
    }
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border shrink-0">
        <span className="text-gray-400">Bots ({bots.length})</span>
        <button className="text-accent-blue hover:text-white" onClick={() => setShowForm(!showForm)}>+ New</button>
      </div>

      {showForm && (
        <div className="p-2 border-b border-surface-border space-y-1 bg-surface-alt">
          <input className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
          <select className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
            {STRATEGIES.map((s) => (<option key={s} value={s}>{s.replace("_", " ")}</option>))}
          </select>
          <button className="w-full bg-accent-blue text-white rounded py-1 text-xs hover:bg-accent-blue/80" onClick={handleCreate}>Create Bot</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {bots.length === 0 && <div className="text-gray-500 p-2 text-center">No bots configured</div>}
        {bots.map((b) => (
          <div key={b.id} className="px-2 py-1.5 border-b border-surface-border/30">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">{b.name}</span>
              <div className="flex gap-1">
                <button className={`px-2 py-0.5 rounded text-[10px] ${b.enabled ? "bg-accent-green text-white" : "bg-gray-700 text-gray-400"}`} onClick={() => handleToggle(b)}>
                  {b.enabled ? "ON" : "OFF"}
                </button>
                <button className="text-gray-500 hover:text-accent-red" onClick={() => removeBot(b.id!)}>x</button>
              </div>
            </div>
            <div className="text-gray-500 text-[10px]">{b.symbol} — {b.strategy.replace("_", " ")}</div>
          </div>
        ))}
      </div>

      {signals.length > 0 && (
        <div className="border-t border-surface-border">
          <div className="px-2 py-1 text-gray-400 text-[10px] uppercase">Signals</div>
          {signals.slice(-10).reverse().map((s, i) => (
            <div key={i} className={`px-2 py-1 text-[10px] ${s.action === "buy" ? "text-accent-green" : "text-accent-red"}`}>
              {s.symbol} {s.action.toUpperCase()} @ {s.price?.toFixed(2)} — {s.strategy}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
