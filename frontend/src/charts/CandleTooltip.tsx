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
      className="absolute z-50 pointer-events-none animate-scale-in"
      style={{ left: Math.min(x, window.innerWidth - 180), top: Math.max(10, y - 100) }}
    >
      <div className="glass-card rounded-lg px-3 py-2 text-[10px] min-w-[140px] space-y-1">
        {/* Header - time */}
        <div className="text-[9px] text-gray-600 font-mono pb-1 border-b border-surface-border/30">
          {new Date(candle.time).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>

        {/* OHLC */}
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-gray-600">O</span>
            <span className="text-white/80 font-mono tabular-nums">${candle.open.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">H</span>
            <span className="text-accent-green font-mono tabular-nums">${candle.high.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">L</span>
            <span className="text-accent-red font-mono tabular-nums">${candle.low.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">C</span>
            <span className={`font-mono tabular-nums ${isGreen ? "text-accent-green" : "text-accent-red"}`}>
              ${candle.close.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Vol</span>
            <span className="text-gray-400 font-mono tabular-nums">{candle.volume.toFixed(2)}</span>
          </div>
        </div>

        {/* Meta info */}
        {meta && (
          <div className="pt-1 border-t border-surface-border/30 space-y-0.5">
            {meta.delta != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Δ</span>
                <span className={meta.delta >= 0 ? "text-accent-green font-mono tabular-nums" : "text-accent-red font-mono tabular-nums"}>
                  {meta.delta >= 0 ? "+" : ""}{meta.delta.toFixed(2)}
                </span>
              </div>
            )}
            {meta.buyVolume != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Buy Vol</span>
                <span className="text-accent-green font-mono tabular-nums">{meta.buyVolume.toFixed(2)}</span>
              </div>
            )}
            {meta.sellVolume != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">Sell Vol</span>
                <span className="text-accent-red font-mono tabular-nums">{meta.sellVolume.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Countdown */}
        {remainingSeconds != null && (
          <div className="pt-1 border-t border-surface-border/30 text-[9px] text-gray-600 font-mono text-center">
            {remainingSeconds > 0 ? `${remainingSeconds}s remaining` : "Closed"}
          </div>
        )}
      </div>
    </div>
  );
}
