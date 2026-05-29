import { useState } from "react";
import { X } from "lucide-react";
import type { IndicatorOverlay, IndicatorOscillator } from "../types";

interface Props {
  indicator: IndicatorOverlay | IndicatorOscillator;
  onSave: (id: string, params: Record<string, number>) => void;
  onClose: () => void;
}

const PARAM_DEFS: Record<string, { key: string; label: string; default: number; min?: number; max?: number }[]> = {
  sma: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  ema: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  wma: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  hma: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  vwap: [{ key: "period", label: "Period", default: 20, min: 2, max: 200 }],
  bollinger: [
    { key: "period", label: "Period", default: 20, min: 2, max: 200 },
    { key: "std", label: "Std Dev", default: 2, min: 0.5, max: 5 },
  ],
  keltner: [
    { key: "period", label: "Period", default: 20, min: 2, max: 200 },
    { key: "atr_mult", label: "ATR Mult", default: 1.5, min: 0.5, max: 5 },
  ],
  parabolic_sar: [
    { key: "step", label: "Step", default: 0.02, min: 0.001, max: 0.5 },
    { key: "max_step", label: "Max Step", default: 0.2, min: 0.01, max: 1 },
  ],
  rsi: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  macd: [
    { key: "fast", label: "Fast", default: 12, min: 2, max: 100 },
    { key: "slow", label: "Slow", default: 26, min: 2, max: 200 },
    { key: "signal", label: "Signal", default: 9, min: 2, max: 100 },
  ],
  stochastic: [
    { key: "k_period", label: "%K Period", default: 14, min: 2, max: 200 },
    { key: "d_period", label: "%D Period", default: 3, min: 2, max: 100 },
  ],
  cci: [{ key: "period", label: "Period", default: 20, min: 2, max: 200 }],
  williams_r: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  atr: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  obv: [{ key: "sma_period", label: "Signal SMA", default: 0, min: 0, max: 200 }],
  cmf: [{ key: "period", label: "Period", default: 20, min: 2, max: 200 }],
  supertrend: [
    { key: "period", label: "Period", default: 10, min: 2, max: 100 },
    { key: "multiplier", label: "Multiplier", default: 3, min: 0.5, max: 10 },
  ],
  ichimoku: [
    { key: "tenkan", label: "Tenkan", default: 9, min: 2, max: 100 },
    { key: "kijun", label: "Kijun", default: 26, min: 2, max: 200 },
    { key: "span_b", label: "Span B", default: 52, min: 2, max: 200 },
    { key: "displacement", label: "Displacement", default: 26, min: 1, max: 100 },
  ],
  adx: [{ key: "period", label: "Period", default: 14, min: 2, max: 200 }],
  crt: [{ key: "lookback", label: "Lookback", default: 20, min: 2, max: 200 }],
};

export function IndicatorConfigModal({ indicator, onSave, onClose }: Props) {
  const defs = PARAM_DEFS[indicator.type] || [];
  const [params, setParams] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const d of defs) initial[d.key] = indicator.params[d.key] ?? d.default;
    return initial;
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content p-4 w-64" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-text-primary font-semibold uppercase tracking-wider text-sm">{indicator.type}</span>
          <button className="w-6 h-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors" onClick={onClose}>
            <X size={12} />
          </button>
        </div>
        <div className="space-y-2">
          {defs.map((d) => (
            <div key={d.key}>
              <label className="text-text-tertiary block mb-0.5 text-[10px]">{d.label}</label>
              <input
                className="input-field w-full"
                type="number"
                min={d.min}
                max={d.max}
                step={d.key === "step" || d.key === "max_step" || d.key === "std" || d.key === "atr_mult" ? 0.1 : 1}
                value={params[d.key] ?? d.default}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setParams({ ...params, [d.key]: v });
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button className="btn-ghost text-xs" onClick={onClose}>Cancel</button>
          <button className="btn-primary text-xs" onClick={() => { onSave(indicator.id, params); onClose(); }}>Apply</button>
        </div>
      </div>
    </div>
  );
}
