import { useEffect, useState } from "react";
import { useCountdownStore } from "../stores/useCountdownStore";

interface Props {
  symbol: string;
  interval: string;
  price?: number;
}

function countdownColor(remaining: number): string {
  if (remaining <= 0) return "text-gray-500";
  if (remaining < 10) return "text-accent-red";
  if (remaining < 20) return "text-accent-yellow";
  return "text-gray-400";
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PriceAxisCountdown({ symbol, interval, price }: Props) {
  const countdowns = useCountdownStore((s) => s.countdowns);
  const lastTick = useCountdownStore((s) => s.lastTick);
  const [remaining, setRemaining] = useState(0);

  const key = `${symbol}:${interval}`;
  const cd = countdowns[key];

  // Local ticking for smooth per-second countdown even between WS messages
  useEffect(() => {
    if (!cd) return;
    setRemaining(cd.remaining_seconds);
    const intervalId = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [cd?.close_time, cd?.remaining_seconds, lastTick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cd && !remaining) return null;

  const seconds = cd?.remaining_seconds ?? remaining;
  const displaySeconds = seconds > 0 ? seconds : 0;

  return (
    <div className="flex flex-col items-end leading-tight pointer-events-none select-none">
      {price !== undefined && (
        <span className="text-xs font-mono text-white tabular-nums">
          {price.toFixed(2)}
        </span>
      )}
      <span className={`text-[10px] font-mono tabular-nums ${countdownColor(displaySeconds)}`}>
        {formatCountdown(displaySeconds)}
      </span>
    </div>
  );
}
