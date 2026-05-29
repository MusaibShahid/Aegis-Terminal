import type { CandleMeta } from "../types";

interface Props {
  visible: boolean;
  x: number;
  y: number;
  candle: { time: number; open: number; high: number; low: number; close: number; volume: number };
  meta?: CandleMeta;
  remainingSeconds?: number;
}

export function CandleTooltip({ visible, x, y, candle, meta, remainingSeconds }: Props) {
  if (!visible) return null;

  const isGreen = candle.close >= candle.open;

  return (
    <div
      className="absolute z-50 pointer-events-none animate-fade-in"
      style={{ left: Math.min(x, window.innerWidth - 180), top: Math.max(10, y - 100) }}
    >
      <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-[10px] min-w-[140px] space-y-1 shadow-md">
        {/* Time */}
        <div className="text-[9px] text-text-muted font-mono pb-1 border-b border-surface-border">
          {new Date(candle.time).toLocaleString("en-US", {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </div>

        {/* OHLCV */}
        <div className="space-y-0.5 font-mono tabular-nums">
          <div className="flex justify-between">
            <span className="text-text-muted">O</span>
            <span className="text-text-secondary">${candle.open.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">H</span>
            <span className="text-accent-green">${candle.high.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">L</span>
            <span className="text-accent-red">${candle.low.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">C</span>
            <span className={isGreen ? "text-accent-green" : "text-accent-red"}>${candle.close.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Vol</span>
            <span className="text-text-tertiary">{candle.volume.toFixed(2)}</span>
          </div>
        </div>

        {/* Meta */}
        {meta && (
          <div className="pt-1 border-t border-surface-border space-y-0.5 font-mono tabular-nums">
            {meta.buy_volume != null && meta.sell_volume != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Delta</span>
                <span className={(meta.buy_volume - meta.sell_volume) >= 0 ? "text-accent-green" : "text-accent-red"}>
                  {(meta.buy_volume - meta.sell_volume) >= 0 ? "+" : ""}{(meta.buy_volume - meta.sell_volume).toFixed(2)}
                </span>
              </div>
            )}
            {meta.buy_volume != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Buy</span>
                <span className="text-accent-green">{meta.buy_volume.toFixed(2)}</span>
              </div>
            )}
            {meta.sell_volume != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Sell</span>
                <span className="text-accent-red">{meta.sell_volume.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Countdown */}
        {remainingSeconds != null && (
          <div className="pt-1 border-t border-surface-border text-[9px] text-text-muted font-mono text-center">
            {remainingSeconds > 0 ? `${remainingSeconds}s remaining` : "Closed"}
          </div>
        )}
      </div>
    </div>
  );
}
