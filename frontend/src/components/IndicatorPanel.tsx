import { useState } from "react";
import type { PaneConfig, IndicatorOverlay, IndicatorOscillator } from "../types";
import { useLayoutStore } from "../stores/useLayoutStore";
import { IndicatorConfigModal } from "./IndicatorConfigModal";

interface Props {
  pane: PaneConfig;
}

const ALL_INDICATORS = [
  { type: "sma", label: "SMA", cat: "overlay" },
  { type: "ema", label: "EMA", cat: "overlay" },
  { type: "wma", label: "WMA", cat: "overlay" },
  { type: "hma", label: "HMA", cat: "overlay" },
  { type: "bollinger", label: "Bollinger Bands", cat: "overlay" },
  { type: "keltner", label: "Keltner Channels", cat: "overlay" },
  { type: "vwap", label: "VWAP", cat: "overlay" },
  { type: "parabolic_sar", label: "Parabolic SAR", cat: "overlay" },
  { type: "rsi", label: "RSI", cat: "oscillator" },
  { type: "macd", label: "MACD", cat: "oscillator" },
  { type: "stochastic", label: "Stochastic", cat: "oscillator" },
  { type: "cci", label: "CCI", cat: "oscillator" },
  { type: "williams_r", label: "Williams %R", cat: "oscillator" },
  { type: "atr", label: "ATR", cat: "oscillator" },
  { type: "obv", label: "OBV", cat: "oscillator" },
  { type: "cmf", label: "CMF", cat: "oscillator" },
];

const DEFAULT_PARAMS: Record<string, Record<string, number>> = {
  sma: { period: 14 },
  ema: { period: 14 },
  wma: { period: 14 },
  hma: { period: 14 },
  bollinger: { period: 20, std: 2 },
  keltner: { period: 20, atr_mult: 1.5 },
  vwap: { period: 20 },
  parabolic_sar: { step: 0.02, max_step: 0.2 },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  stochastic: { k_period: 14, d_period: 3 },
  cci: { period: 20 },
  williams_r: { period: 14 },
  atr: { period: 14 },
  obv: { sma_period: 0 },
  cmf: { period: 20 },
};

export function IndicatorPanel({ pane }: Props) {
  const updatePane = useLayoutStore((s) => s.updatePane);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  const removeIndicator = (indId: string) => {
    updatePane(pane.id, {
      indicators: pane.indicators.filter((i) => i.id !== indId),
    });
  };

  const handleSaveParams = (id: string, params: Record<string, number>) => {
    updatePane(pane.id, {
      indicators: pane.indicators.map((i) =>
        i.id === id ? { ...i, params } : i
      ),
    });
  };

  const addIndicator = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const params = DEFAULT_PARAMS[type] || {};
    const isOsc = ALL_INDICATORS.find((i) => i.type === type)?.cat === "oscillator";
    const indicator = isOsc
      ? { id, type, params, paneId: pane.id, color: "#3b82f6" } as IndicatorOscillator
      : { id, type, params, paneId: pane.id, color: "#3b82f6" } as IndicatorOverlay;
    updatePane(pane.id, {
      indicators: [...pane.indicators, indicator],
    });
    setShowAdd(false);
    setSearch("");
  };

  const editingIndicator = editingId
    ? pane.indicators.find((i) => i.id === editingId) ?? null
    : null;

  const formatParams = (ind: IndicatorOverlay | IndicatorOscillator): string => {
    const entries = Object.entries(ind.params);
    if (entries.length === 0) return "";
    return entries.map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}:${v}`).join(" ");
  };

  const filtered = search.trim()
    ? ALL_INDICATORS.filter((i) =>
        i.label.toLowerCase().includes(search.toLowerCase())
      )
    : ALL_INDICATORS;

  return (
    <>
      <div className="flex items-center gap-1 px-2 py-1.5 bg-[#0d0f17] border-b border-white/5 shrink-0 overflow-x-auto scrollbar-thin">
        {pane.indicators.map((ind) => (
          <span
            key={ind.id}
            className="inline-flex items-center gap-1.5 text-[10px] bg-accent-blue/[0.06] text-accent-blue/90 border border-accent-blue/10 px-2 py-0.5 rounded-lg cursor-pointer hover:bg-accent-blue/[0.1] hover:border-accent-blue/20 transition-all group"
            onClick={() => setEditingId(ind.id)}
            title="Click to configure"
          >
            <svg className="w-2.5 h-2.5 opacity-50" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94a7.07 7.07 0 00.06-.94c0-.32-.02-.64-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a6.93 6.93 0 00-1.62-.94l-.36-2.54a.48.48 0 00-.48-.41h-3.84a.48.48 0 00-.48.41l-.36 2.54a6.9 6.9 0 00-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.48.48 0 00.12.61l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.26.41.48.41h3.84c.22 0 .43-.17.48-.41l.36-2.54a6.9 6.9 0 001.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.6 3.6 0 0112 15.6z"/>
            </svg>
            <span className="font-medium tracking-wider">{ind.type.toUpperCase()}</span>
            {formatParams(ind) && (
              <span className="text-gray-500 text-[8px] hidden group-hover:inline transition-opacity">
                {formatParams(ind)}
              </span>
            )}
            <button
              className="w-3.5 h-3.5 flex items-center justify-center rounded text-gray-500 hover:text-accent-red hover:bg-accent-red/10 transition-all text-[9px] ml-0.5"
              onClick={(e) => {
                e.stopPropagation();
                removeIndicator(ind.id);
              }}
            >
              ✕
            </button>
          </span>
        ))}
        <button
          className="text-[18px] leading-none text-gray-500 hover:text-white px-1 hover:bg-white/[0.05] rounded transition-all"
          onClick={() => setShowAdd(true)}
          title="Add indicator"
        >
          +
        </button>
      </div>

      {editingIndicator && (
        <IndicatorConfigModal
          indicator={editingIndicator}
          onSave={handleSaveParams}
          onClose={() => setEditingId(null)}
        />
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-surface rounded-lg border border-surface-border p-4 w-72 text-xs shadow-xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-white font-semibold uppercase tracking-wider">Add Indicator</span>
              <button className="text-gray-500 hover:text-white text-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <input
              className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1.5 text-white text-xs outline-none focus:border-accent-blue mb-2"
              placeholder="Search indicators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {filtered.map((ind) => (
                <button
                  key={ind.type}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-white/[0.05] text-left transition-colors disabled:opacity-40"
                  onClick={() => addIndicator(ind.type)}
                  disabled={pane.indicators.some((i) => i.type === ind.type)}
                >
                  <span className="text-gray-300">{ind.label}</span>
                  <span className="text-[9px] text-gray-600 uppercase">{ind.cat}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="text-gray-600 text-center py-4">No indicators found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
