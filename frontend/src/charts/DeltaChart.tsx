import { useFootprintStore } from "../stores/useFootprintStore";

interface Props {
  symbol: string;
}

export function DeltaChart({ symbol }: Props) {
  const delta = useFootprintStore((s) => s.delta[symbol]);

  if (!delta || !delta.delta_series || delta.delta_series.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-xs">
        Loading delta data...
      </div>
    );
  }

  const series = delta.delta_series.slice(-100);
  const values = series.map((d: any) => d.cumulative_delta || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, -1);
  const range = Math.max(max - min, 1);

  return (
    <div className="h-full flex flex-col p-2">
      {/* Summary */}
      <div className="flex items-center gap-3 mb-2 text-[10px] font-mono">
        <div className="glass-card rounded px-2 py-1">
          <span className="text-text-muted">Candle Δ: </span>
          <span className={delta.candle_delta.delta >= 0 ? "text-accent-green tabular-nums" : "text-accent-red tabular-nums"}>
            {delta.candle_delta.delta >= 0 ? "+" : ""}{delta.candle_delta.delta.toFixed(2)}
          </span>
        </div>
        <div className="glass-card rounded px-2 py-1">
          <span className="text-text-muted">Cum Δ: </span>
          <span className={delta.cumulative_delta >= 0 ? "text-accent-green tabular-nums" : "text-accent-red tabular-nums"}>
            {delta.cumulative_delta >= 0 ? "+" : ""}{delta.cumulative_delta?.toFixed(2) ?? "0"}
          </span>
        </div>
      </div>

      {/* Bar chart */}
      <div className="flex-1 flex items-end gap-[2px] pr-1">
        {series.map((d: any, i: number) => {
          const val = d.cumulative_delta || 0;
          const h = Math.abs(val) / range * 100;
          const isPositive = val >= 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end min-w-0" style={{ height: "100%" }}>
              <div
                className={`w-full rounded-t-sm transition-all duration-200 ${isPositive ? "bg-accent-green/60" : "bg-accent-red/60"}`}
                style={{ height: `${Math.max(h, 3)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
