import { useLayoutStore } from "../stores/useLayoutStore";
import { useResponsive } from "../hooks/useResponsive";
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
  onAddOscillator?: (paneId: string, type: string) => void;
  onChangeChartType?: (type: PaneConfig["chartType"]) => void;
  chartTypes?: { value: PaneConfig["chartType"]; label: string }[];
  onExportPng?: () => void;
}

const OSCILLATOR_TYPES = [
  { label: "Vol", type: "volume" },
  { label: "MACD", type: "macd" },
  { label: "RSI", type: "rsi" },
  { label: "Stoch", type: "stochastic" },
  { label: "CCI", type: "cci" },
  { label: "W%R", type: "williams_r" },
  { label: "ATR", type: "atr" },
  { label: "OBV", type: "obv" },
  { label: "CMF", type: "cmf" },
];

export function Toolbar({
  pane,
  onUpdatePane,
  onAddIndicator,
  onAddOscillator,
  onChangeChartType,
  chartTypes,
  onExportPng,
}: Props) {
  const linkedMode = useLayoutStore((s) => s.linkedMode);
  const toggleLinkedMode = useLayoutStore((s) => s.toggleLinkedMode);
  const responsive = useResponsive();

  const showFullLabels = responsive.isDesktop;
  const showIndicatorButtons = responsive.isDesktop;
  const showOscillatorButtons = responsive.isDesktop;

  return (
    <div className="h-8 bg-surface-alt/80 backdrop-blur-sm border-b border-surface-border/70 flex items-center px-1.5 lg:px-2 gap-1 lg:gap-1.5 shrink-0 overflow-x-auto scrollbar-none">
      {/* Linked mode toggle */}
      <button
        className={`h-6 w-6 lg:w-auto lg:px-1.5 flex items-center justify-center rounded text-[10px] font-medium transition-all duration-150 shrink-0 ${
          linkedMode
            ? "text-accent-blue bg-accent-blue/10 border border-accent-blue/25"
            : "text-gray-600 hover:text-gray-400 hover:bg-glass-white border border-transparent"
        }`}
        onClick={toggleLinkedMode}
        title={linkedMode ? "Linked mode active — all panes sync" : "Click to link all panes"}
      >
        <span className="flex items-center gap-1">
          {linkedMode ? "🔗" : "⊘"}
          {showFullLabels && <span className="text-[10px]">Link</span>}
        </span>
      </button>

      {/* Symbol input */}
      <input
        className="w-[80px] lg:w-[92px] h-6 bg-[#0a0b14] border border-surface-border rounded-md px-1.5 lg:px-2 text-[10px] lg:text-xs font-mono text-white/90 placeholder-gray-700 outline-none focus:border-accent-blue/40 focus:shadow-glow transition-all duration-150 shrink-0"
        value={pane.symbol}
        onChange={(e) => onUpdatePane(pane.id, { symbol: e.target.value.toUpperCase() })}
        placeholder="SYM"
        title="Symbol"
      />

      {/* Interval selector */}
      <select
        className="h-6 bg-[#0a0b14] border border-surface-border rounded-md px-1 text-[10px] lg:text-xs font-mono text-white/80 outline-none focus:border-accent-blue/40 cursor-pointer transition-all duration-150 shrink-0"
        value={pane.interval}
        onChange={(e) => onUpdatePane(pane.id, { interval: e.target.value })}
      >
        {INTERVALS.map((iv) => (
          <option key={iv} value={iv}>{iv}</option>
        ))}
      </select>

      {/* Chart type selector */}
      {chartTypes && onChangeChartType && (
        <select
          className="h-6 bg-[#0a0b14] border border-surface-border rounded-md px-1 text-[9px] lg:text-[10px] text-white/70 outline-none focus:border-accent-blue/40 cursor-pointer transition-all duration-150 shrink-0"
          value={pane.chartType}
          onChange={(e) => onChangeChartType(e.target.value as PaneConfig["chartType"])}
        >
          {chartTypes.map((ct) => (
            <option key={ct.value} value={ct.value}>{ct.label}</option>
          ))}
        </select>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-surface-border/50 shrink-0 mx-0.5" />

      {/* Oscillators — hidden on smaller screens, shown via tools drawer instead */}
      {onAddOscillator && showOscillatorButtons && (
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-600 font-mono mr-0.5 shrink-0">OSC:</span>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {OSCILLATOR_TYPES.map((osc) => (
              <button
                key={osc.type}
                className="text-[9px] lg:text-[10px] text-gray-600 hover:text-white px-1 py-0.5 rounded hover:bg-glass-white transition-all duration-100 whitespace-nowrap font-mono shrink-0"
                onClick={() => onAddOscillator(pane.id, osc.type)}
              >
                {osc.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="w-px h-4 bg-surface-border/50 shrink-0 mx-0.5" />

      {/* Indicators — hidden on smaller screens */}
      {showIndicatorButtons && (
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-gray-600 font-mono mr-0.5 shrink-0">IND:</span>
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
            {INDICATORS.map((ind) => (
              <button
                key={ind.type}
                className="text-[9px] lg:text-[10px] text-gray-600 hover:text-white px-1 py-0.5 rounded hover:bg-glass-white transition-all duration-100 whitespace-nowrap font-mono shrink-0"
                onClick={() => onAddIndicator(pane.id, ind.type)}
              >
                {ind.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {onExportPng && (
          <button
            className="h-6 w-6 flex items-center justify-center text-gray-600 hover:text-white rounded hover:bg-glass-white transition-all duration-100"
            onClick={onExportPng}
            title="Export PNG"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
