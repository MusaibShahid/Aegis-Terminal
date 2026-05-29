import { useDOMStore } from "../stores/useDOMStore";

interface Props {
  symbol: string;
}

export function DOMLadder({ symbol }: Props) {
  const depth = useDOMStore((s) => s.depth[symbol]);

  if (!depth || (!depth.bids.length && !depth.asks.length)) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        Loading depth data...
      </div>
    );
  }

  const maxVol = Math.max(
    ...depth.bids.map((b) => b.volume),
    ...depth.asks.map((a) => a.volume),
    1
  );

  const spread = depth.asks.length > 0 && depth.bids.length > 0
    ? ((depth.asks[0].price - depth.bids[0].price) / depth.bids[0].price) * 100
    : 0;

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="text-[10px] font-mono space-y-px">
        {/* Header */}
        <div className="flex items-center justify-between text-[9px] text-text-muted uppercase tracking-wider px-1 pb-1 border-b border-surface-border/30 mb-1">
          <span>Price</span>
          <span>Volume</span>
          <span>Total</span>
        </div>

        {/* Asks (reversed so lowest ask is at bottom) */}
        {[...depth.asks].reverse().map((ask, i) => (
          <div key={i} className="flex items-center justify-between px-1 py-0.5 relative group hover:bg-glass-white-hover rounded transition-colors">
            <div className="absolute right-0 top-0 bottom-0 bg-accent-red/10 rounded" style={{ width: `${(ask.volume / maxVol) * 100}%` }} />
            <span className="text-accent-red font-mono text-[10px] tabular-nums relative z-10">{ask.price.toFixed(2)}</span>
            <span className="text-text-secondary font-mono text-[10px] tabular-nums relative z-10">{ask.volume.toFixed(4)}</span>
            <span className="text-text-muted font-mono text-[9px] tabular-nums relative z-10">{(ask.volume * ask.price).toFixed(2)}</span>
          </div>
        ))}

        {/* Spread */}
        {depth.asks.length > 0 && depth.bids.length > 0 && (
          <div className="text-center text-[9px] text-text-muted py-1 border-y border-surface-border/30 my-0.5 font-mono">
            Spread: {spread.toFixed(3)}%
          </div>
        )}

        {/* Bids */}
        {depth.bids.map((bid, i) => (
          <div key={i} className="flex items-center justify-between px-1 py-0.5 relative group hover:bg-glass-white-hover rounded transition-colors">
            <div className="absolute right-0 top-0 bottom-0 bg-accent-green/10 rounded" style={{ width: `${(bid.volume / maxVol) * 100}%` }} />
            <span className="text-accent-green font-mono text-[10px] tabular-nums relative z-10">{bid.price.toFixed(2)}</span>
            <span className="text-text-secondary font-mono text-[10px] tabular-nums relative z-10">{bid.volume.toFixed(4)}</span>
            <span className="text-text-muted font-mono text-[9px] tabular-nums relative z-10">{(bid.volume * bid.price).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
