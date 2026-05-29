import { useState, useEffect, useRef, useCallback } from "react";

const BOT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const BOT_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];
const BOT_STRATEGIES = [
  { id: "ema_crossover", label: "EMA Crossover" },
  { id: "rsi", label: "RSI Reversal" },
  { id: "macd", label: "MACD Signal" },
  { id: "bollinger", label: "Bollinger Bands" },
];

interface BacktestResult {
  total_return: number;
  win_rate: number;
  total_trades: number;
  profit_factor: number | null;
  max_drawdown: number;
  sharpe: number;
  final_equity: number;
  initial_capital: number;
  total_signals: number;
  equity_curve: { time: number; equity: number }[];
  trades: {
    entry_time: number;
    exit_time: number | null;
    side: string;
    entry_price: number;
    exit_price: number | null;
    quantity: number;
    pnl: number;
    pnl_pct: number;
    exit_reason: string;
  }[];
  error?: string;
}

function drawEquityCurve(
  canvas: HTMLCanvasElement,
  curve: { time: number; equity: number }[],
  initialCapital: number,
) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);

  if (curve.length < 2) {
    ctx.fillStyle = "#6b7280";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("Not enough data", w / 2, h / 2);
    return;
  }

  const padding = { top: 8, right: 8, bottom: 18, left: 50 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  const equities = curve.map((p) => p.equity);
  const minEq = Math.min(...equities);
  const maxEq = Math.max(...equities);
  const range = maxEq - minEq || 1;

  const times = curve.map((p) => p.time);
  const minT = times[0];
  const maxT = times[times.length - 1];
  const tRange = maxT - minT || 1;

  // Helper: data -> pixel coords
  const xPos = (t: number) => padding.left + ((t - minT) / tRange) * chartW;
  const yPos = (eq: number) => padding.top + ((maxEq - eq) / range) * chartH;

  // --- Grid lines ---
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // --- Y-axis labels ---
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const eq = maxEq - (range / 4) * i;
    const y = padding.top + (chartH / 4) * i;
    ctx.fillText(eq.toFixed(0), padding.left - 4, y + 3);
  }

  // --- Baseline (initial capital) ---
  const baseY = yPos(initialCapital);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, baseY);
  ctx.lineTo(w - padding.right, baseY);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Gradient fill ---
  ctx.beginPath();
  ctx.moveTo(xPos(curve[0].time), chartH + padding.top);
  for (const pt of curve) {
    ctx.lineTo(xPos(pt.time), yPos(pt.equity));
  }
  ctx.lineTo(xPos(curve[curve.length - 1].time), chartH + padding.top);
  ctx.closePath();

  const gradientColor = "#3b82f6";
  const grad = ctx.createLinearGradient(0, padding.top, 0, chartH + padding.top);
  grad.addColorStop(0, "rgba(59,130,246,0.2)");
  grad.addColorStop(1, "rgba(59,130,246,0.02)");
  ctx.fillStyle = grad;
  ctx.fill();

  // --- Equity line ---
  ctx.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const x = xPos(curve[i].time);
    const y = yPos(curve[i].equity);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = gradientColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- Start / end dots ---
  for (const idx of [0, curve.length - 1]) {
    ctx.beginPath();
    ctx.arc(xPos(curve[idx].time), yPos(curve[idx].equity), 3, 0, Math.PI * 2);
    ctx.fillStyle = gradientColor;
    ctx.fill();
    ctx.strokeStyle = "#0e0e11";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // --- X-axis time labels ---
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  const labelCount = Math.min(5, curve.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor((i / (labelCount - 1)) * (curve.length - 1));
    const pt = curve[idx];
    const date = new Date(pt.time);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    ctx.fillText(label, xPos(pt.time), h - 3);
  }
}

export function BacktestPanel() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [strategy, setStrategy] = useState("ema_crossover");
  const [interval, setInterval] = useState("1h");
  const [params, setParams] = useState("{}");
  const [capital, setCapital] = useState("10000");
  const [candleLimit, setCandleLimit] = useState("500");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  // Drawing function reads from ref so ResizeObserver doesn't need recreation
  function drawCurve() {
    const canvas = canvasRef.current;
    const currentResults = resultsRef.current;
    if (!canvas || !currentResults || currentResults.equity_curve.length < 2) return;
    drawEquityCurve(canvas, currentResults.equity_curve, currentResults.initial_capital);
  }

  // Redraw when results change
  useEffect(() => {
    drawCurve();
  }, [results]);

  // ResizeObserver — set up once, never recreated on results update
  useEffect(() => {
    const ro = new ResizeObserver(() => drawCurve());
    if (canvasRef.current?.parentElement) {
      ro.observe(canvasRef.current.parentElement);
    }
    return () => ro.disconnect();
  }, []);

  const handleRun = async () => {
    setRunning(true);
    setResults(null);
    try {
      const parsedParams = (() => {
        try { return JSON.parse(params || "{}"); } catch { return {}; }
      })();

      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          strategy,
          interval,
          params: parsedParams,
          initial_capital: parseFloat(capital) || 10000,
          limit: parseInt(candleLimit) || 500,
        }),
      });
      const data: BacktestResult = await res.json();
      setResults(data);
    } catch {
      setResults({
        error: "Failed to run backtest",
        total_return: 0,
        win_rate: 0,
        total_trades: 0,
        profit_factor: null,
        max_drawdown: 0,
        sharpe: 0,
        final_equity: 0,
        initial_capital: parseFloat(capital) || 10000,
        total_signals: 0,
        equity_curve: [],
        trades: [],
      });
    } finally {
      setRunning(false);
    }
  };

  const formatPct = (v: number, goodIfGte?: number) => {
    const color = goodIfGte != null ? (v >= goodIfGte ? "text-accent-green" : "text-accent-red") : "text-text-secondary";
    return { value: `${v.toFixed(1)}%`, color };
  };

  const stats = results
    ? [
        { label: "Return", ...formatPct(results.total_return, 0) },
        { label: "Win Rate", ...formatPct(results.win_rate, 50) },
        { label: "Trades", value: String(results.total_trades), color: "text-text-secondary" },
        { label: "Profit Factor", value: results.profit_factor != null ? results.profit_factor.toFixed(2) : "∞", color: (results.profit_factor ?? 0) >= 1.5 ? "text-accent-green" : "text-accent-red" },
        { label: "Max DD", ...formatPct(results.max_drawdown), color: "text-accent-red" },
        { label: "Sharpe", value: results.sharpe.toFixed(2), color: results.sharpe >= 1 ? "text-accent-green" : "text-accent-red" },
        { label: "Final Equity", value: `$${results.final_equity.toFixed(0)}`, color: results.final_equity >= results.initial_capital ? "text-accent-green" : "text-accent-red" },
        { label: "Signals", value: String(results.total_signals), color: "text-text-secondary" },
      ]
    : [];

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Config form */}
      <div className="p-2 border-b border-surface-border/30 space-y-1.5">
        <div className="flex gap-1">
          <select className="trade-select flex-[1.3]" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            {BOT_SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="trade-select w-[52px]" value={interval} onChange={(e) => setInterval(e.target.value)}>
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
        <div className="flex gap-1">
          <input
            className="flex-1 trade-input font-mono text-[9px]"
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder='{"fast": 9, "slow": 21}'
          />
          <input
            className="w-[60px] trade-input text-[9px] font-mono text-right"
            value={capital}
            onChange={(e) => setCapital(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="10000"
            title="Initial capital"
          />
          <input
            className="w-[40px] trade-input text-[9px] font-mono text-center"
            value={candleLimit}
            onChange={(e) => setCandleLimit(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="500"
            title="Candles"
          />
        </div>
        <button
          className="w-full btn-primary bg-accent-blue/15 text-accent-blue border border-accent-blue/25 hover:bg-accent-blue/25 disabled:opacity-40 transition-all"
          onClick={handleRun}
          disabled={running}
        >
          {running ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
              Running...
            </span>
          ) : "Run Backtest"}
        </button>
      </div>

      {/* Results */}
      {results && !results.error && (
        <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
          {/* Equity curve canvas */}
          {results.equity_curve.length >= 2 && (
            <div className="glass-card rounded-lg p-2">
              <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold mb-1.5">
                Equity Curve
              </div>
              <div className="relative h-20 w-full">
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          )}

          {/* Stats grid */}
          <div className="glass-card rounded-lg p-2.5 space-y-1.5">
            <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold">
              Performance
            </div>
            <div className="grid grid-cols-4 gap-1">
              {stats.map((m) => (
                <div key={m.label} className="bg-surface-alt/30 rounded p-1.5">
                  <div className="text-[8px] text-text-muted uppercase tracking-wider">{m.label}</div>
                  <div className={`text-[10px] font-mono font-semibold tabular-nums ${m.color}`}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Trade list */}
          {results.trades.length > 0 && (
            <div className="glass-card rounded-lg p-2.5 space-y-1">
              <div className="text-[9px] text-text-muted uppercase tracking-wider font-semibold flex items-center justify-between">
                <span>Trades ({results.trades.length})</span>
                <span className="text-[8px] font-normal normal-case">
                  {results.trades.filter((t) => t.exit_reason === "open").length} open
                </span>
              </div>
              <div className="space-y-0.5 max-h-28 overflow-y-auto">
                {results.trades.map((t, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between rounded px-1.5 py-1 text-[9px] ${
                      t.pnl > 0
                        ? "bg-accent-green/5"
                        : t.pnl < 0
                          ? "bg-accent-red/5"
                          : "bg-surface-alt/20"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1 h-1 rounded-full ${
                        t.side === "buy" ? "bg-accent-green" : "bg-accent-red"
                      }`} />
                      <span className="font-mono text-text-primary/70">
                        {t.side === "buy" ? "LONG" : "SHORT"}
                      </span>
                      <span className="text-text-muted">
                        {t.exit_reason === "open" ? "◉" : "●"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-text-muted">
                        {t.entry_price.toFixed(2)}
                      </span>
                      <span className={t.pnl > 0 ? "text-accent-green" : t.pnl < 0 ? "text-accent-red" : "text-text-primary/50"}>
                        {t.pnl > 0 ? "+" : ""}{t.pnl_pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {results?.error && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-xs text-accent-red/60">{results.error}</span>
        </div>
      )}

      {/* Empty state */}
      {!results && !running && (
        <div className="flex flex-col items-center justify-center flex-1 text-text-muted gap-2 p-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span className="text-xs">Configure a bot and run a backtest</span>
          <span className="text-[10px] text-text-muted">500 candles of historical data analyzed</span>
        </div>
      )}
    </div>
  );
}
