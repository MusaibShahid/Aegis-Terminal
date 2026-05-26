import { useFootprintStore } from "../stores/useFootprintStore";

interface Props {
  symbol: string;
}

export function DeltaChart({ symbol }: Props) {
  const delta = useFootprintStore((s) => s.delta[symbol]);
  if (!delta) {
    return <div className="text-xs text-gray-500 p-2">Waiting for delta data...</div>;
  }

  const series = delta.delta_series || [];
  const cumDelta = delta.cumulative_delta || 0;
  const cd = delta.candle_delta || { buy_volume: 0, sell_volume: 0, delta: 0, total_volume: 0 };

  const maxAbs = Math.max(
    ...series.map((s) => Math.abs(s.cumulative_delta)),
    1
  );

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center gap-3 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0 text-xs">
        <span className="text-gray-400">Delta — {symbol}</span>
        <span className={cd.delta >= 0 ? "text-accent-green" : "text-accent-red"}>
          {cd.delta >= 0 ? "+" : ""}{cd.delta.toFixed(4)}
        </span>
        <span className="text-gray-400">
          Cum: <span className={cumDelta >= 0 ? "text-accent-green" : "text-accent-red"}>
            {cumDelta >= 0 ? "+" : ""}{cumDelta.toFixed(4)}
          </span>
        </span>
      </div>
      <div className="flex-1 flex items-end gap-px px-1 py-2">
        {series.slice(-100).map((s, i) => {
          const h = Math.abs((s.cumulative_delta / maxAbs) * 100);
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <div
                className={`w-full ${s.cumulative_delta >= 0 ? "bg-accent-green/50" : "bg-accent-red/50"}`}
                style={{ height: `${Math.max(h, 1)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
