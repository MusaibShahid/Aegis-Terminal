import { useFootprintStore } from "../stores/useFootprintStore";

interface Props {
  symbol: string;
}

export function VPVRChart({ symbol }: Props) {
  const vpvr = useFootprintStore((s) => s.vpvr[symbol]);

  if (!vpvr || !vpvr.levels || vpvr.levels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        Loading VPVR data...
      </div>
    );
  }

  const maxVolume = Math.max(...vpvr.levels.map((l: any) => l.volume || 0), 1);
  const poc = vpvr.levels.reduce((max: any, l: any) => (l.volume > (max?.volume || 0) ? l : max), null);

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="text-[10px] font-mono space-y-px">
        {/* Header */}
        <div className="flex items-center gap-3 text-[9px] text-gray-600 uppercase tracking-wider px-1 pb-1 border-b border-surface-border/30 mb-1">
          <span className="w-16">Price</span>
          <span className="w-20 text-right">Volume</span>
          <span className="w-8" />
        </div>

        {vpvr.levels.map((level: any, i: number) => {
          const pct = maxVolume > 0 ? (level.volume / maxVolume) * 100 : 0;
          const isPoc = poc && level.price === poc.price;
          return (
            <div key={i} className="flex items-center gap-3 px-1 py-0.5 hover:bg-glass-white-hover rounded transition-colors relative">
              <span className={`w-16 tabular-nums ${isPoc ? "text-white font-semibold" : "text-gray-400"}`}>
                {level.price?.toFixed(2) ?? "N/A"}
              </span>
              <div className="flex-1 h-4 relative">
                <div className={`absolute left-0 top-0 bottom-0 rounded ${isPoc ? "bg-accent-blue/30" : "bg-accent-blue/10"}`} style={{ width: `${pct}%` }} />
                <span className="relative z-10 text-right block text-gray-500 text-[9px] tabular-nums">{level.volume?.toFixed(2) ?? "0"}</span>
              </div>
              {isPoc && (
                <span className="text-[8px] text-accent-blue font-semibold">POC</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {poc && (
        <div className="mt-2 pt-2 border-t border-surface-border/30 flex gap-3 text-[9px] text-gray-600 font-mono">
          <span>POC: <span className="text-white tabular-nums">${poc.price?.toFixed(2)}</span></span>
          <span>VA: <span className="text-white tabular-nums">${(vpvr.value_area_high || 0).toFixed(2)}</span> - <span className="text-white tabular-nums">${(vpvr.value_area_low || 0).toFixed(2)}</span></span>
        </div>
      )}
    </div>
  );
}
