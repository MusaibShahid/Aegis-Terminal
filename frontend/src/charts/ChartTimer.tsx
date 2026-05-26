import { useEffect, useState } from "react";
import { useCountdownStore } from "../stores/useCountdownStore";

interface Props {
  symbol: string;
  interval: string;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const SESSION_LABELS: Record<string, string> = {
  asian: "Asian",
  london: "London",
  new_york: "NY",
  closed: "Closed",
};

const SESSION_COLORS: Record<string, string> = {
  asian: "text-accent-yellow",
  london: "text-accent-blue",
  new_york: "text-accent-green",
  closed: "text-gray-500",
};

export function ChartTimer({ symbol, interval }: Props) {
  const countdowns = useCountdownStore((s) => s.countdowns);
  const globalSession = useCountdownStore((s) => s.globalSession);
  const lastTick = useCountdownStore((s) => s.lastTick);
  const [remaining, setRemaining] = useState(0);

  const key = `${symbol}:${interval}`;
  const cd = countdowns[key];

  useEffect(() => {
    if (!cd) return;
    setRemaining(cd.remaining_seconds);
    const intervalId = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [cd?.close_time, cd?.remaining_seconds, lastTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const seconds = cd?.remaining_seconds ?? remaining;
  const displaySession = cd?.session || globalSession || "unknown";

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono shrink-0">
      {/* Session badge */}
      <span className={`${SESSION_COLORS[displaySession] || "text-gray-400"} uppercase tracking-wider text-[9px]`}>
        {SESSION_LABELS[displaySession] || displaySession}
      </span>
      {/* Countdown */}
      <span className="text-gray-300 tabular-nums">
        {formatCountdown(seconds > 0 ? seconds : 0)}
      </span>
      {/* Interval badge */}
      <span className="text-gray-500 bg-surface-alt px-1 rounded">{interval}</span>
    </div>
  );
}
