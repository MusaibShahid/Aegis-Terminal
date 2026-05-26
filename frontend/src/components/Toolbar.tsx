import type { PaneConfig } from "../types";

const INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"];

const INDICATORS = [
  { label: "SMA", type: "sma" },
  { label: "EMA", type: "ema" },
  { label: "WMA", type: "wma" },
  { label: "HMA", type: "hma" },
  { label: "RSI", type: "rsi" },
  { label: "MACD", type: "macd" },
  { label: "Stoch", type: "stochastic" },
  { label: "BB", type: "bollinger" },
  { label: "KC", type: "keltner" },
  { label: "VWAP", type: "vwap" },
  { label: "PSAR", type: "parabolic_sar" },
  { label: "ATR", type: "atr" },
  { label: "CCI", type: "cci" },
  { label: "W%R", type: "williams_r" },
];

interface Props {
  pane: PaneConfig;
  onUpdatePane: (id: string, updates: Partial<PaneConfig>) => void;
  onAddIndicator: (paneId: string, type: string) => void;
  onChangeChartType?: (type: PaneConfig["chartType"]) => void;
  chartTypes?: { value: PaneConfig["chartType"]; label: string }[];
  onExportPng?: () => void;
}

export function Toolbar({
  pane,
  onUpdatePane,
  onAddIndicator,
  onChangeChartType,
  chartTypes,
  onExportPng,
}: Props) {
  return (
    <div className="h-8 bg-surface-alt border-b border-surface-border flex items-center px-2 gap-2 shrink-0 overflow-x-auto">
      {/* Symbol */}
      <input
        className="w-24 bg-surface border border-surface-border rounded px-2 py-0.5 text-xs text-white font-mono outline-none focus:border-accent-blue shrink-0"
        value={pane.symbol}
        onChange={(e) => onUpdatePane(pane.id, { symbol: e.target.value.toUpperCase() })}
      />

      {/* Interval */}
      <select
        className="bg-surface border border-surface-border rounded px-1 py-0.5 text-xs text-white outline-none focus:border-accent-blue shrink-0"
        value={pane.interval}
        onChange={(e) => onUpdatePane(pane.id, { interval: e.target.value })}
      >
        {INTERVALS.map((iv) => (
          <option key={iv} value={iv}>
            {iv}
          </option>
        ))}
      </select>

      {/* Chart type */}
      {chartTypes && onChangeChartType && (
        <select
          className="bg-surface border border-surface-border rounded px-1 py-0.5 text-xs text-white outline-none focus:border-accent-blue shrink-0"
          value={pane.chartType}
          onChange={(e) => onChangeChartType(e.target.value as PaneConfig["chartType"])}
        >
          {chartTypes.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      )}

      <div className="w-px h-4 bg-surface-border shrink-0" />

      {/* Indicators */}
      <div className="flex items-center gap-1">
        {INDICATORS.map((ind) => (
          <button
            key={ind.type}
            className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-surface transition-colors whitespace-nowrap"
            onClick={() => onAddIndicator(pane.id, ind.type)}
          >
            {ind.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        {onExportPng && (
          <button
            className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-surface transition-colors"
            onClick={onExportPng}
            title="Export PNG"
          >
            ⬇
          </button>
        )}
      </div>
    </div>
  );
}
