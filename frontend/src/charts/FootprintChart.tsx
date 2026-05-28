import { useFootprintStore } from "../stores/useFootprintStore";

interface Props {
  symbol: string;
}

export function FootprintChart({ symbol }: Props) {
  const footprint = useFootprintStore((s) => s.footprint[symbol]);

  if (!footprint || !footprint.levels || footprint.levels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        Loading footprint data...
      </div>
    );
  }

  const maxVolume = Math.max(...footprint.levels.map((l: any) => Math.max(l.buyVolume || 0, l.sellVolume || 0)), 1);

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="text-[10px] font-mono space-y-px">
        {/* Header */}
        <div className="flex items-center gap-3 text-[9px] text-gray-600 uppercase tracking-wider px-1 pb-1 border-b border-surface-border/30 mb-1">
          <span className="w-16">Price</span>
          <span className="w-12 text-right">Buy</span>
          <span className="w-12 text-right">Sell</span>
          <span className="w-12 text-right">Delta</span>
        </div>

        {footprint.levels.slice(-50).map((level: any, i: number) => {
          const delta = (level.buyVolume || 0) - (level.sellVolume || 0);
          return (
            <div key={i} className="flex items-center gap-3 px-1 py-0.5 hover:bg-glass-white-hover rounded transition-colors">
              <span className="w-16 text-gray-300 tabular-nums">{level.price?.toFixed(2) ?? "N/A"}</span>
              <div className="w-12 h-4 relative">
                <div className="absolute right-0 top-0 bottom-0 bg-accent-green/20 rounded" style={{ width: `${((level.buyVolume || 0) / maxVolume) * 100}%` }} />
                <span className="relative z-10 text-right block text-accent-green text-[9px] tabular-nums">{(level.buyVolume || 0).toFixed(2)}</span>
              </div>
              <div className="w-12 h-4 relative">
                <div className="absolute left-0 top-0 bottom-0 bg-accent-red/20 rounded" style={{ width: `${((level.sellVolume || 0) / maxVolume) * 100}%` }} />
                <span className="relative z-10 text-left block text-accent-red text-[9px] tabular-nums">{(level.sellVolume || 0).toFixed(2)}</span>
              </div>
              <span className={`w-12 text-right text-[9px] tabular-nums ${delta >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
