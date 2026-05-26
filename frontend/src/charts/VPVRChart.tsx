import { useFootprintStore } from "../stores/useFootprintStore";
import { formatPrice } from "../utils/format";

interface Props {
  symbol: string;
}

export function VPVRChart({ symbol }: Props) {
  const vpvr = useFootprintStore((s) => s.vpvr[symbol]);
  if (!vpvr || !vpvr.levels?.length) {
    return <div className="text-xs text-gray-500 p-2">Waiting for VPVR data...</div>;
  }

  const maxVol = Math.max(...vpvr.levels.map((l) => l.volume), 1);

  return (
    <div className="h-full flex flex-col text-[10px] font-mono">
      <div className="flex items-center gap-2 px-2 py-1 bg-surface-alt border-b border-surface-border shrink-0 text-xs">
        <span className="text-gray-400">VPVR — {symbol}</span>
        <span className="text-accent-yellow">POC: {formatPrice(vpvr.poc, 2)}</span>
        <span className="text-accent-blue">VAH: {formatPrice(vpvr.vah, 2)}</span>
        <span className="text-accent-blue">VAL: {formatPrice(vpvr.val, 2)}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {vpvr.levels.slice(-30).map((lvl, i) => (
          <div
            key={i}
            className={`flex items-center h-4 px-1 border-b border-surface-border/30 ${
              lvl.in_value_area ? "bg-accent-blue/5" : ""
            }`}
          >
            <span className="w-20 text-right text-gray-300">{formatPrice(lvl.price, 2)}</span>
            <div className="flex-1 h-3 ml-2 relative">
              <div
                className={`h-full ${lvl.is_poc ? "bg-accent-yellow/60" : lvl.in_value_area ? "bg-accent-blue/30" : "bg-gray-600/20"}`}
                style={{ width: `${(lvl.volume / maxVol) * 100}%` }}
              />
            </div>
            {lvl.is_poc && <span className="text-accent-yellow ml-1">POC</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
