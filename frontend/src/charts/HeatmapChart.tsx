import { useFootprintStore } from "../stores/useFootprintStore";

interface Props {
  symbol: string;
}

export function HeatmapChart({ symbol }: Props) {
  const footprint = useFootprintStore((s) => s.footprint[symbol]);

  if (!footprint || !footprint.levels || footprint.levels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-xs">
        Loading heatmap data...
      </div>
    );
  }

  const maxDelta = Math.max(
    ...footprint.levels.map((l: any) => Math.abs((l.buyVolume || 0) - (l.sellVolume || 0))),
    1
  );

  return (
    <div className="h-full overflow-y-auto p-2">
      <div className="text-[10px] font-mono space-y-px">
        {/* Header */}
        <div className="flex items-center gap-2 text-[9px] text-gray-600 uppercase tracking-wider px-1 pb-1 border-b border-surface-border/30 mb-1">
          <span className="w-16">Price</span>
          <span className="flex-1">Heat (Δ)</span>
        </div>

        {footprint.levels.slice(-60).map((level: any, i: number) => {
          const delta = (level.buyVolume || 0) - (level.sellVolume || 0);
          const intensity = Math.abs(delta) / maxDelta;
          const isPositive = delta >= 0;

          // Color gradient based on intensity
          const r = isPositive ? 0 : 255;
          const g = isPositive ? 217 : 71;
          const b = isPositive ? 124 : 87;
          const alpha = Math.min(intensity * 0.6, 0.6);

          return (
            <div key={i} className="flex items-center gap-2 px-1 py-0.5 hover:bg-glass-white-hover rounded transition-colors">
              <span className="w-16 text-gray-400 tabular-nums">{level.price?.toFixed(2) ?? "N/A"}</span>
              <div className="flex-1 h-4 rounded" style={{ backgroundColor: `rgba(${r}, ${g}, ${b}, ${alpha})` }}>
                <span className="px-1 text-[9px] text-white/70 tabular-nums">
                  {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
