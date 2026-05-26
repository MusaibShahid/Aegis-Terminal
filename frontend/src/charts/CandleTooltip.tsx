import { useEffect, useMemo, useState } from "react";
import type { CandleMeta } from "../types";

interface Props {
  visible: boolean;
  x: number;
  y: number;
  candle: { time: number; open: number; high: number; low: number; close: number; volume: number };
  meta?: CandleMeta;
  remainingSeconds?: number;
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
}

function fmtTimeFull(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

const MARKET_COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444"];

function sessionColor(session: string): string {
  const idx = ["asian", "london", "new_york", "closed"].indexOf(session.toLowerCase());
  return MARKET_COLORS[idx >= 0 ? idx : 3];
}

function countdownColor(remaining: number): string {
  if (remaining < 10) return "text-accent-red";
  if (remaining < 20) return "text-accent-yellow";
  return "text-gray-300";
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CandleTooltip({ visible, x, y, candle, meta, remainingSeconds }: Props) {
  const body = useMemo(() => Math.abs(candle.close - candle.open), [candle]);
  const range = candle.high - candle.low;
  const isUp = candle.close >= candle.open;
  const [localRemaining, setLocalRemaining] = useState(remainingSeconds ?? 0);

  useEffect(() => {
    if (remainingSeconds !== undefined) setLocalRemaining(remainingSeconds);
  }, [remainingSeconds]);

  useEffect(() => {
    if (!visible || remainingSeconds === undefined) return;
    const intervalId = setInterval(() => {
      setLocalRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [visible, remainingSeconds]);

  if (!visible) return null;

  return (
    <div
      className="absolute z-50 bg-surface border border-surface-border rounded shadow-lg p-2 text-[10px] font-mono pointer-events-none"
      style={{ left: x + 12, top: y - 80, minWidth: 150 }}
    >
      <div className="text-gray-400 mb-1">{fmtTime(candle.time)}</div>

      <div className="space-y-0.5">
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">O</span>
          <span className="text-white">{candle.open.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">H</span>
          <span className="text-accent-blue">{candle.high.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">L</span>
          <span className="text-accent-blue">{candle.low.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">C</span>
          <span className={isUp ? "text-accent-green" : "text-accent-red"}>
            {candle.close.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Vol</span>
          <span className="text-white">{candle.volume.toFixed(1)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Body</span>
          <span className="text-white">{body.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Range</span>
          <span className="text-white">{range.toFixed(2)}</span>
        </div>
      </div>

      {/* Countdown row */}
      {remainingSeconds !== undefined && (
        <>
          <div className="border-t border-surface-border my-1" />
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Close in</span>
            <span className={`font-semibold ${countdownColor(localRemaining)}`}>
              {formatCountdown(localRemaining)}
            </span>
          </div>
        </>
      )}

      {meta && (
        <>
          <div className="border-t border-surface-border my-1" />
          <div className="space-y-0.5">
            {meta.session && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Session</span>
                <span className="text-white" style={{ color: sessionColor(meta.session) }}>
                  {meta.session}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">TZ</span>
              <span className="text-white">{meta.timezone || "UTC"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Close at</span>
              <span className="text-gray-300">
                {meta.close_time ? fmtTimeFull(meta.close_time) : "--"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Ticks</span>
              <span className="text-white">{meta.tick_count}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Buy</span>
              <span className="text-accent-green">{meta.buy_volume.toFixed(1)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Sell</span>
              <span className="text-accent-red">{meta.sell_volume.toFixed(1)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Final</span>
              <span className={meta.is_final ? "text-accent-green" : "text-accent-yellow"}>
                {meta.is_final ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
