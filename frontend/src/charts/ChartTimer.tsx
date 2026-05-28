import { useCountdownStore } from "../stores/useCountdownStore";

interface Props {
  symbol: string;
  interval: string;
}

export function ChartTimer({ symbol, interval }: Props) {
  const countdown = useCountdownStore(
    (s) => s.countdowns[`${symbol}:${interval}`]
  );

  if (!countdown || countdown.remaining_seconds == null) return null;

  const total = intervalToSeconds(interval);
  const remaining = countdown.remaining_seconds;
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = remaining <= 10;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        <div className="w-14 h-1.5 bg-surface-border rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ease-linear ${
              isLow ? "bg-accent-red shadow-[0_0_4px_rgba(255,71,87,0.5)]" : "bg-accent-blue/60"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`font-mono text-[10px] tabular-nums min-w-[28px] text-right ${
          isLow ? "text-accent-red" : "text-gray-500"
        }`}>
          {remaining}s
        </span>
      </div>
      {countdown.price != null && (
        <span className="font-mono text-[10px] text-gray-600 tabular-nums">
          ${countdown.price.toFixed(2)}
        </span>
      )}
    </div>
  );
}

function intervalToSeconds(iv: string): number {
  const map: Record<string, number> = {
    "1m": 60, "3m": 180, "5m": 300, "15m": 900, "30m": 1800,
    "1h": 3600, "2h": 7200, "4h": 14400, "1d": 86400, "1w": 604800,
  };
  return map[iv] ?? 60;
}
