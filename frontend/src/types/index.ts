// --- Core Market Data ---

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

// --- Depth / DOM ---

export interface DepthLevel {
  price: number;
  volume: number;
}

export interface DepthData {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  timestamp: number;
}

// --- Footprint ---

export interface FootprintLevel {
  price: number;
  bid_volume: number;
  ask_volume: number;
  total_volume: number;
  delta: number;
  imbalance: number;
  intensity: number;
}

export interface FootprintData {
  symbol: string;
  levels: FootprintLevel[];
  max_volume: number;
}

// --- VPVR ---

export interface VPVRLevel {
  price: number;
  volume: number;
  is_poc: boolean;
  in_value_area: boolean;
}

export interface VPVRData {
  symbol: string;
  levels: VPVRLevel[];
  poc: number;
  vah: number;
  val: number;
  total_volume: number;
}

// --- Delta ---

export interface DeltaSeries {
  timestamp: number;
  cumulative_delta: number;
}

export interface DeltaData {
  symbol: string;
  candle_delta: { buy_volume: number; sell_volume: number; delta: number; total_volume: number };
  cumulative_delta: number;
  delta_series: DeltaSeries[];
}

// --- SMC ---

export interface SwingPoint {
  index: number;
  price: number;
  time: number;
}

export interface SwingPoints {
  swing_highs: SwingPoint[];
  swing_lows: SwingPoint[];
}

export interface BOSSignal {
  type: string;
  time: number;
  price: number;
  break_level: number;
}

export interface FVG {
  type: string;
  time: number;
  gap_high: number;
  gap_low: number;
  midpoint: number;
}

export interface OrderBlock {
  type: string;
  time: number;
  high: number;
  low: number;
  is_bullish: boolean;
}

export interface LiquiditySweep {
  type: string;
  time: number;
  price: number;
}

// --- Indicators ---

export interface IndicatorOverlay {
  id: string;
  type: "sma" | "ema" | "wma" | "hma" | "vwap" | "bollinger" | "keltner" | "parabolic_sar" | "supertrend" | "ichimoku" | "crt" | "adx";
  paneId: string;
  params: Record<string, number>;
}

export interface IndicatorOscillator {
  id: string;
  type: "rsi" | "macd" | "stochastic" | "cci" | "williams_r" | "atr" | "adx";
  paneId: string;
  params: Record<string, number>;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  panes: PaneConfig[];
}

// --- Pine Script Custom Indicator ---
export interface PineScriptIndicator {
  id: string;
  name: string;
  code: string;
  paneId: string;
  params?: Record<string, number>;
  color?: string;
}

// --- Pane & Layout ---

export interface PaneConfig {
  id: string;
  symbol: string;
  interval: string;
  indicators: (IndicatorOverlay | IndicatorOscillator)[];
  oscillators: OscillatorConfig[];
  pineScripts: PineScriptIndicator[];
  chartType: "candle" | "footprint" | "delta" | "depth" | "heatmap" | "vpvr" | "candle_footprint";
  linked: boolean;
}

export interface LayoutConfig {
  id?: string;
  name: string;
  panes: PaneConfig[];
  pineScripts?: PineScriptIndicator[];
}

// --- Instrument ---

export interface Instrument {
  symbol: string;
  display_name: string;
  market_type: "crypto" | "metal" | "forex";
  source: string;
  tick_size: number;
  precision: number;
  timezone: string;
}

// --- Watchlist ---

export interface WatchlistGroup {
  id?: string;
  name: string;
  symbols: string[];
  color?: string;
  order?: number;
}

// --- Candle Metadata ---

export interface CandleMeta {
  open_time: number;
  close_time: number;
  session: string;
  timezone: string;
  tick_count: number;
  buy_volume: number;
  sell_volume: number;
  is_final: boolean;
}

// --- Oscillator Sub-Panel Config ---

export interface OscillatorConfig {
  id: string;
  type: "volume" | "macd" | "rsi" | "stochastic" | "cci" | "williams_r" | "atr" | "obv" | "cmf";
  params: Record<string, number>;
  color?: string;
}

// --- Drawings ---

export type DrawingTool =
  | "trendline"
  | "horizontal"
  | "vertical"
  | "ray"
  | "rectangle"
  | "freehand"
  | "fibonacci"
  | "text"
  | "arrow"
  | "circle"
  | "eraser";

/** A point on the chart expressed in chart coordinates (time in ms, price). */
export interface DrawingPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id?: string;
  _serverId?: number;
  paneId: string;
  tool: DrawingTool;
  /** Points in chart coordinates: {time: ms_timestamp, price}. */
  points: DrawingPoint[];
  color?: string;
  text?: string;
  createdAt?: number;
}

// --- Alerts ---

export interface AlertConfig {
  id?: number;
  name: string;
  type: "price" | "volume" | "delta" | "indicator";
  condition: { field?: string; operator: string; value: number; indicator?: string };
  symbol: string;
  enabled: boolean;
}

// --- Bots ---

export interface BotConfig {
  id?: number;
  name: string;
  strategy: "ema_crossover" | "rsi" | "macd" | "bollinger";
  symbol: string;
  interval?: string;
  params: Record<string, number>;
  riskParams: Record<string, number>;
  enabled: boolean;
  liveMode?: boolean;
}

export interface BotSignal {
  type: string;
  bot: string;
  strategy: string;
  symbol: string;
  action: "buy" | "sell";
  price: number;
  volume: number;
  time: number;
  order_executed?: boolean;
}

// --- Replay ---

export interface ReplayState {
  playing: boolean;
  speed: number;
  progress: number;
  tickCount: number;
  symbol: string;
}

// --- WebSocket ---

export interface WsMessage {
  type: string;
  [key: string]: unknown;
}

// --- Template ---

export interface Template {
  id?: number;
  name: string;
  type: string;
  data: Record<string, unknown>;
}

// --- Candle Countdown ---

export interface CandleCountdown {
  symbol: string;
  interval: string;
  open_time: number;
  close_time: number;
  remaining_seconds: number;
  server_time: number;
  session: string;
}

export interface CountdownMessage {
  type: "candle_time";
  server_time: number;
  session: string;
  countdowns: Record<string, CandleCountdown>;
}

// --- Timeframes ---

export type Timeframe = "1m" | "3m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d" | "1w";
