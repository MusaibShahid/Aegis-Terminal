import { useDOMStore } from "../stores/useDOMStore";
import { formatPrice } from "../utils/format";

interface Props {
  symbol: string;
}

export function DOMLadder({ symbol }: Props) {
  const depth = useDOMStore((s) => s.depth[symbol]);
  if (!depth) return <div className="text-xs text-gray-500 p-2">Waiting for depth data...</div>;

  const maxBid = Math.max(...depth.bids.map((b) => b.volume), 1);
  const maxAsk = Math.max(...depth.asks.map((a) => a.volume), 1);
  const maxVol = Math.max(maxBid, maxAsk);
  const spread = depth.asks.length && depth.bids.length
    ? depth.asks[0].price - depth.bids[0].price
    : 0;
  const mid = depth.asks.length && depth.bids.length
    ? (depth.asks[0].price + depth.bids[0].price) / 2
    : 0;

  return (
    <div className="h-full flex flex-col text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0">
        <span className="text-gray-400">DOM — {symbol}</span>
        <span className="text-gray-500">
          Spread: {formatPrice(spread, 2)} | Mid: {formatPrice(mid, 2)}
        </span>
      </div>

      {/* Asks */}
      <div className="flex-1 overflow-y-auto flex flex-col-reverse">
        {depth.asks.slice(-15).map((a, i) => (
          <div key={`ask-${i}`} className="flex items-center h-5 px-2 relative">
            <div
              className="absolute right-0 top-0 h-full bg-accent-red/15"
              style={{ width: `${(a.volume / maxVol) * 100}%` }}
            />
            <span className="relative z-10 text-accent-red w-24 text-right">{formatPrice(a.price, 2)}</span>
            <span className="relative z-10 text-gray-400 w-16 text-right ml-auto">{a.volume.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Mid line */}
      <div className="border-t border-b border-surface-border py-0.5 text-center text-gray-500 bg-surface-alt text-[10px]">
        {formatPrice(mid, 2)}
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-y-auto">
        {depth.bids.slice(0, 15).map((b, i) => (
          <div key={`bid-${i}`} className="flex items-center h-5 px-2 relative">
            <div
              className="absolute left-0 top-0 h-full bg-accent-green/15"
              style={{ width: `${(b.volume / maxVol) * 100}%` }}
            />
            <span className="relative z-10 text-accent-green w-24">{formatPrice(b.price, 2)}</span>
            <span className="relative z-10 text-gray-400 w-16 text-right ml-auto">{b.volume.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
