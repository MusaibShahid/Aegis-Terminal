import { useFootprintStore } from "../stores/useFootprintStore";
import { formatPrice } from "../utils/format";

interface Props {
  symbol: string;
}

export function FootprintChart({ symbol }: Props) {
  const fp = useFootprintStore((s) => s.footprint[symbol]);
  if (!fp || !fp.levels?.length) {
    return <div className="text-xs text-gray-500 p-2">Waiting for footprint data...</div>;
  }

  const maxVol = fp.max_volume || 1;

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center gap-4 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0 text-xs">
        <span className="text-gray-400">Footprint — {symbol}</span>
        <span className="text-accent-green">Bid</span>
        <span className="text-accent-red">Ask</span>
        <span className="text-accent-yellow">Delta</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {fp.levels.slice(-25).map((lvl, i) => (
          <div
            key={i}
            className="flex items-center h-[18px] px-1 border-b border-surface-border/30"
          >
            <span className="w-20 text-right text-gray-300">{formatPrice(lvl.price, 2)}</span>
            <div className="flex-1 flex items-center gap-0.5 ml-2">
              <div className="flex items-center h-3 relative flex-1">
                <div
                  className="h-full bg-accent-green/40 absolute right-1/2"
                  style={{ width: `${(lvl.bid_volume / maxVol) * 50}%`, right: `${50 - (lvl.bid_volume / maxVol) * 25}%` }}
                />
                <div
                  className="h-full bg-accent-red/40 absolute left-1/2"
                  style={{ width: `${(lvl.ask_volume / maxVol) * 50}%`, left: `${50 - (lvl.ask_volume / maxVol) * 25}%` }}
                />
              </div>
              <span className={`w-14 text-right ${
                lvl.delta > 0 ? "text-accent-green" : lvl.delta < 0 ? "text-accent-red" : "text-gray-500"
              }`}>
                {lvl.delta > 0 ? "+" : ""}{lvl.delta.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
