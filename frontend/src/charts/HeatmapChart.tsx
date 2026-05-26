import { useDOMStore } from "../stores/useDOMStore";

interface Props {
  symbol: string;
}

export function HeatmapChart({ symbol }: Props) {
  const depth = useDOMStore((s) => s.depth[symbol]);
  if (!depth || !depth.bids?.length || !depth.asks?.length) {
    return <div className="text-xs text-gray-500 p-2">Waiting for depth data...</div>;
  }

  const allLevels = [
    ...depth.bids.map((b) => ({ price: b.price, vol: b.volume, side: "bid" as const })),
    ...depth.asks.map((a) => ({ price: a.price, vol: a.volume, side: "ask" as const })),
  ].sort((a, b) => a.price - b.price);

  const maxVol = Math.max(...allLevels.map((l) => l.vol), 1);

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center gap-2 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0 text-xs">
        <span className="text-gray-400">Heatmap — {symbol}</span>
        <span className="text-accent-green">Bid</span>
        <span className="text-accent-red">Ask</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {allLevels.map((lvl, i) => {
          const intensity = lvl.vol / maxVol;
          const bgColor =
            lvl.side === "bid"
              ? `rgba(34, 197, 94, ${0.05 + intensity * 0.4})`
              : `rgba(239, 68, 68, ${0.05 + intensity * 0.4})`;
          return (
            <div
              key={i}
              className="flex items-center h-5 px-3 border-b border-surface-border/20"
              style={{ backgroundColor: bgColor }}
            >
              <span className="w-24 text-gray-300">{lvl.price.toFixed(2)}</span>
              <div className="flex-1 h-3 ml-2 relative">
                <div
                  className={`h-full ${lvl.side === "bid" ? "bg-accent-green/30" : "bg-accent-red/30"}`}
                  style={{ width: `${intensity * 100}%` }}
                />
              </div>
              <span className="w-16 text-right text-gray-400 ml-2">{lvl.vol.toFixed(4)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
