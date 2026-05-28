import { useCountdownStore } from "../stores/useCountdownStore";

interface Props {
  symbol: string;
  interval: string;
  price?: number;
}

export function PriceAxisCountdown({ symbol, interval, price }: Props) {
  const countdown = useCountdownStore(
    (s) => s.countdowns[`${symbol}:${interval}`]
  );

  if (!countdown || countdown.remaining_seconds == null) return null;

  const isLow = countdown.remaining_seconds <= 10;

  return (
    <div className="glass-card rounded px-1.5 py-0.5 flex items-center gap-1.5 text-[9px] font-mono animate-fade-in">
      <span className={`w-1.5 h-1.5 rounded-full ${isLow ? "bg-accent-red animate-pulse-slow" : "bg-accent-blue/60"}`} />
      <span className={isLow ? "text-accent-red" : "text-gray-500"}>
        {countdown.remaining_seconds}s
      </span>
      {price != null && (
        <>
          <span className="text-gray-700">|</span>
          <span className="text-gray-500 tabular-nums">
            ${price.toFixed(2)}
          </span>
        </>
      )}
    </div>
  );
}
