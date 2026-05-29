import { useState, useEffect } from "react";

interface Props {
  symbol: string;
  interval: string;
}

export function SMCOverlay({ symbol, interval }: Props) {
  const [data, setData] = useState<{ type: string; price: number; time: number; label?: string }[]>([]);

  useEffect(() => {
    fetch(`/api/smc/signals?symbol=${symbol}&interval=${interval}`)
      .then((r) => r.ok ? r.json() : [])
      .then((signals) => setData(Array.isArray(signals) ? signals : []))
      .catch(() => setData([]));
  }, [symbol, interval]);

  if (!data || data.length === 0) return null;

  return (
    <div className="absolute top-2 right-2 z-20 animate-fade-in">
      <div className="glass-card rounded-lg px-2 py-1.5 space-y-1 text-[9px] font-mono min-w-[100px]">
        <div className="text-[8px] text-text-muted uppercase tracking-wider mb-1">SMC Signals</div>
        {data.slice(-5).map((signal, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className={`${
              signal.type === "bos" ? "text-accent-green" :
              signal.type === "choch" ? "text-accent-red" :
              signal.type === "liquidity" ? "text-accent-yellow" :
              signal.type === "fvg" ? "text-accent-blue" :
              "text-text-secondary"
            }`}>
              {signal.type.toUpperCase()}
            </span>
            <span className="text-text-tertiary tabular-nums">${signal.price?.toFixed(2) ?? "N/A"}</span>
            {signal.label && (
              <span className="text-text-muted text-[8px]">{signal.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
