import { useLayoutStore } from "../stores/useLayoutStore";
import { useMarketStore } from "../stores/useMarketStore";

interface Props {
  symbol: string;
  interval: string;
}

function findSwingPoints(candles: { high: number; low: number; time: number }[], lookback = 5) {
  const highs: { price: number; time: number }[] = [];
  const lows: { price: number; time: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high > candles[i].high) isHigh = false;
      if (candles[j].low < candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ price: candles[i].high, time: candles[i].time });
    if (isLow) lows.push({ price: candles[i].low, time: candles[i].time });
  }
  return { highs, lows };
}

function findFVG(candles: { high: number; low: number; time: number }[]) {
  const gaps: { type: string; gapHigh: number; gapLow: number; time: number }[] = [];
  for (let i = 1; i < candles.length - 1; i++) {
    if (candles[i].low > candles[i - 1].high) {
      gaps.push({ type: "bullish", gapHigh: candles[i].low, gapLow: candles[i - 1].high, time: candles[i].time });
    }
    if (candles[i].high < candles[i - 1].low) {
      gaps.push({ type: "bearish", gapHigh: candles[i - 1].low, gapLow: candles[i].high, time: candles[i].time });
    }
  }
  return gaps;
}

export function SMCOverlay({ symbol, interval }: Props) {
  const candles = useMarketStore((s) => s.candles[`${symbol}:${interval}`]);
  if (!candles || candles.length < 20) return null;

  const swing = findSwingPoints(candles);
  const fvgs = findFVG(candles);
  const data = candles.map((c) => ({ high: c.high, low: c.low, time: c.time }));

  const minPrice = Math.min(...candles.map((c) => c.low));
  const maxPrice = Math.max(...candles.map((c) => c.high));
  const range = maxPrice - minPrice || 1;

  // Normalize a price to a percentage position (0 = bottom, 100 = top)
  const yPos = (price: number) => ((maxPrice - price) / range) * 100;
  const xPos = (time: number) => {
    const idx = candles.findIndex((c) => c.time === time);
    return (idx / Math.max(candles.length - 1, 1)) * 100;
  };
  const highIdx = (time: number) => candles.findIndex((c) => c.time === time);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Swing highs */}
      {swing.highs.map((sh, i) => (
        <div
          key={`sh-${i}`}
          className="absolute w-2 h-2 border-2 border-accent-red rounded-full -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: `${xPos(sh.time)}%`, top: `${yPos(sh.price)}%` }}
        />
      ))}
      {/* Swing lows */}
      {swing.lows.map((sl, i) => (
        <div
          key={`sl-${i}`}
          className="absolute w-2 h-2 border-2 border-accent-green rounded-full -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: `${xPos(sl.time)}%`, top: `${yPos(sl.price)}%` }}
        />
      ))}
      {/* FVG zones */}
      {fvgs.slice(-10).map((fvg, i) => {
        const topPct = yPos(fvg.gapHigh);
        const botPct = yPos(fvg.gapLow);
        const left = xPos(fvg.time);
        return (
          <div
            key={`fvg-${i}`}
            className={`absolute w-8 opacity-30 ${fvg.type === "bullish" ? "bg-accent-green" : "bg-accent-red"}`}
            style={{
              left: `${left - 1}%`,
              top: `${Math.min(topPct, botPct)}%`,
              height: `${Math.abs(topPct - botPct)}%`,
            }}
          />
        );
      })}
    </div>
  );
}
