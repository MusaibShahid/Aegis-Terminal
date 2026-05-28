import { useState } from "react";
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
};

export function IndicatorConfigModal({ indicator, onSave, onClose }: Props) {
  const defs = PARAM_DEFS[indicator.type] || [];
  const [params, setParams] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const d of defs) {
      initial[d.key] = indicator.params[d.key] ?? d.default;
    }
    return initial;
  });

  const handleSave = () => {
    onSave(indicator.id, params);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-lg border border-surface-border p-4 w-64 text-xs shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-white font-semibold mb-3 uppercase tracking-wider">{indicator.type}</div>
        <div className="space-y-2">
          {defs.map((d) => (
            <div key={d.key}>
              <label className="text-gray-500 block mb-0.5 text-[10px]">{d.label}</label>
              <input
                className="w-full bg-surface-alt border border-surface-border rounded px-2 py-1 text-white text-xs outline-none focus:border-accent-blue"
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
        <div className="flex gap-2 mt-3 justify-end">
          <button className="px-3 py-1 rounded bg-surface-alt text-gray-400 hover:text-white" onClick={onClose}>
            Cancel
          </button>
          <button className="px-3 py-1 rounded bg-accent-blue text-white hover:bg-accent-blue/80" onClick={handleSave}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
