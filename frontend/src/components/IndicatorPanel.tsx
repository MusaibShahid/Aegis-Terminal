import { memo, useState } from "react";
import { X } from "lucide-react";
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
  { type: "supertrend", label: "Supertrend", cat: "overlay" },
  { type: "ichimoku", label: "Ichimoku Cloud", cat: "overlay" },
  { type: "crt", label: "Candle Range Theory", cat: "overlay" },
  { type: "rsi", label: "RSI", cat: "oscillator" },
  { type: "macd", label: "MACD", cat: "oscillator" },
  { type: "stochastic", label: "Stochastic", cat: "oscillator" },
  { type: "cci", label: "CCI", cat: "oscillator" },
  { type: "williams_r", label: "Williams %R", cat: "oscillator" },
  { type: "atr", label: "ATR", cat: "oscillator" },
  { type: "obv", label: "OBV", cat: "oscillator" },
  { type: "cmf", label: "CMF", cat: "oscillator" },
  { type: "adx", label: "ADX", cat: "oscillator" },
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
  supertrend: { period: 10, multiplier: 3 },
  ichimoku: { tenkan: 9, kijun: 26, span_b: 52, displacement: 26 },
  crt: { lookback: 50 },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  stochastic: { k_period: 14, d_period: 3 },
  cci: { period: 20 },
  williams_r: { period: 14 },
  atr: { period: 14 },
  obv: { sma_period: 0 },
  cmf: { period: 20 },
  adx: { period: 14 },
};

export const IndicatorPanel = memo(function IndicatorPanel({ pane }: Props) {
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
      <div className="flex items-center gap-1 px-2 py-1.5 bg-surface-alt border-b border-surface-border shrink-0 overflow-x-auto scrollbar-none">
        {pane.indicators.map((ind) => (
          <span
            key={ind.id}
            className="inline-flex items-center gap-1.5 text-[10px] bg-accent-blue/8 text-accent-blue border border-accent-blue/15 px-2 py-0.5 rounded cursor-pointer hover:bg-accent-blue/12 hover:border-accent-blue/25 transition-all group"
            onClick={() => setEditingId(ind.id)}
            title="Click to configure"
          >
            <span className="font-medium tracking-wider font-mono">{ind.type.toUpperCase()}</span>
            {formatParams(ind) && (
              <span className="text-text-muted text-[8px] hidden group-hover:inline transition-opacity">
                {formatParams(ind)}
              </span>
            )}
            <button
              className="w-3.5 h-3.5 flex items-center justify-center rounded text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-all text-[9px] ml-0.5"
              onClick={(e) => { e.stopPropagation(); removeIndicator(ind.id); }}
            >
              <X size={8} />
            </button>
          </span>
        ))}
        <button
          className="text-[18px] leading-none text-text-tertiary hover:text-text-primary px-1 hover:bg-surface-hover rounded transition-all"
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
              <span className="text-text-primary font-semibold uppercase tracking-wider">Add Indicator</span>
              <button className="text-text-tertiary hover:text-text-primary text-sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <input
              className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1.5 text-text-primary text-xs outline-none focus:border-accent-blue mb-2"
              placeholder="Search indicators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="flex-1 overflow-y-auto space-y-0.5">
              {filtered.map((ind) => (
                <button
                  key={ind.type}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-hover text-left transition-colors disabled:opacity-40"
                  onClick={() => addIndicator(ind.type)}
                  disabled={pane.indicators.some((i) => i.type === ind.type)}
                >
                  <span className="text-text-primary">{ind.label}</span>
                  <span className="text-[9px] text-text-muted uppercase">{ind.cat}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="text-text-muted text-center py-4">No indicators found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
