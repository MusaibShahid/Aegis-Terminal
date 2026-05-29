import { memo } from "react";
import { Link2, Link2Off, Download, ChevronDown } from "lucide-react";
import { PairSelector } from "../components/PairSelector";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useResponsive } from "../hooks/useResponsive";
import type { PaneConfig } from "../types";

const INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"];

const INDICATORS = [
  { label: "SMA", type: "sma" }, { label: "EMA", type: "ema" },
  { label: "WMA", type: "wma" }, { label: "HMA", type: "hma" },
  { label: "RSI", type: "rsi" }, { label: "MACD", type: "macd" },
  { label: "Stoch", type: "stochastic" }, { label: "BB", type: "bollinger" },
  { label: "KC", type: "keltner" }, { label: "VWAP", type: "vwap" },
  { label: "PSAR", type: "parabolic_sar" }, { label: "ATR", type: "atr" },
  { label: "CCI", type: "cci" }, { label: "W%R", type: "williams_r" },
  { label: "SuperT", type: "supertrend" }, { label: "ADX", type: "adx" },
  { label: "Ichi", type: "ichimoku" }, { label: "CRT", type: "crt" },
];

const OSCILLATOR_TYPES = [
  { label: "Vol", type: "volume" }, { label: "MACD", type: "macd" },
  { label: "RSI", type: "rsi" }, { label: "Stoch", type: "stochastic" },
  { label: "CCI", type: "cci" }, { label: "W%R", type: "williams_r" },
  { label: "ATR", type: "atr" }, { label: "OBV", type: "obv" },
  { label: "CMF", type: "cmf" },
];

interface Props {
  pane: PaneConfig;
  onUpdatePane: (id: string, updates: Partial<PaneConfig>) => void;
  onAddIndicator: (paneId: string, type: string) => void;
  onAddOscillator?: (paneId: string, type: string) => void;
  onChangeChartType?: (type: PaneConfig["chartType"]) => void;
  chartTypes?: { value: PaneConfig["chartType"]; label: string }[];
  onExportPng?: () => void;
}

export const Toolbar = memo(function Toolbar({
  pane, onUpdatePane, onAddIndicator, onAddOscillator, onChangeChartType, chartTypes, onExportPng,
}: Props) {
  const linkedMode = useLayoutStore((s) => s.linkedMode);
  const toggleLinkedMode = useLayoutStore((s) => s.toggleLinkedMode);
  const responsive = useResponsive();
  const showButtons = responsive.isDesktop;

  return (
    <div className="h-8 bg-surface-alt border-b border-surface-border flex items-center px-2 gap-1.5 shrink-0 overflow-x-auto scrollbar-none">
      {/* Linked mode */}
      <button
        className={`h-6 w-6 flex items-center justify-center rounded transition-all shrink-0 ${
          linkedMode
            ? "text-accent-blue bg-accent-blue/10 border border-accent-blue/25"
            : "text-text-muted hover:text-text-secondary hover:bg-surface-hover border border-transparent"
        }`}
        onClick={toggleLinkedMode}
        title={linkedMode ? "Linked mode active" : "Link all panes"}
      >
        {linkedMode ? <Link2 size={12} /> : <Link2Off size={12} />}
      </button>

      <PairSelector symbol={pane.symbol} onChange={(sym) => onUpdatePane(pane.id, { symbol: sym })} />

      {/* Interval */}
      <select
        className="select-field h-6 text-[11px] font-mono shrink-0"
        value={pane.interval}
        onChange={(e) => onUpdatePane(pane.id, { interval: e.target.value })}
      >
        {INTERVALS.map((iv) => <option key={iv} value={iv}>{iv}</option>)}
      </select>

      {/* Chart type */}
      {chartTypes && onChangeChartType && (
        <select
          className="select-field h-6 text-[10px] shrink-0"
          value={pane.chartType}
          onChange={(e) => onChangeChartType(e.target.value as PaneConfig["chartType"])}
        >
          {chartTypes.map((ct) => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
        </select>
      )}

      <div className="w-px h-4 bg-surface-border shrink-0 mx-0.5" />

      {/* Oscillators */}
      {onAddOscillator && showButtons && (
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-text-muted font-mono mr-0.5 shrink-0">OSC</span>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {OSCILLATOR_TYPES.map((osc) => (
              <button
                key={osc.type}
                className="text-[10px] text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-surface-hover transition-all whitespace-nowrap font-mono shrink-0"
                onClick={() => onAddOscillator(pane.id, osc.type)}
              >
                {osc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-px h-4 bg-surface-border shrink-0 mx-0.5" />

      {/* Indicators */}
      {showButtons && (
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-text-muted font-mono mr-0.5 shrink-0">IND</span>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {INDICATORS.map((ind) => (
              <button
                key={ind.type}
                className="text-[10px] text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded hover:bg-surface-hover transition-all whitespace-nowrap font-mono shrink-0"
                onClick={() => onAddIndicator(pane.id, ind.type)}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {onExportPng && (
          <button
            className="h-6 w-6 flex items-center justify-center text-text-tertiary hover:text-text-primary rounded hover:bg-surface-hover transition-all"
            onClick={onExportPng}
            title="Export PNG"
          >
            <Download size={12} />
          </button>
        )}
      </div>
    </div>
  );
});
