export function formatPrice(price: number, decimals = 2): string {
  return price.toFixed(decimals);
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(2)}K`;
  return vol.toFixed(2);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US");
}

export function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
    "1w": 604_800_000,
  };
  return map[interval] ?? 60_000;
}
