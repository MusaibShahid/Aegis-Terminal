const BASE = "/api/live";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// --- Types ---

export interface LiveStatus {
  enabled: boolean;
  bridge_connected: boolean;
  max_position_size: number;
  max_daily_loss: number;
  max_leverage: number;
  cooldown_seconds: number;
  daily_pnl: number;
  daily_trade_count: number;
  max_daily_trades: number;
}

export interface LiveAccountInfo {
  balance?: number;
  equity?: number;
  margin?: number;
  margin_free?: number;
  margin_level?: number;
  currency?: string;
  name?: string;
  server?: string;
  error?: string;
}

export interface LivePosition {
  ticket: number;
  symbol: string;
  type: number; // 0=buy, 1=sell
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  price_current: number;
  profit: number;
  swap: number;
  time: number;
  comment?: string;
}

export interface LiveOrderResult {
  retcode: number;
  error?: string;
  deal?: number;
  order?: number;
}

export interface LiveRiskParams {
  max_position_size: number;
  max_daily_loss: number;
  max_leverage: number;
  cooldown_seconds: number;
  daily_pnl: number;
  daily_trade_count: number;
  max_daily_trades: number;
}

// --- API functions ---

export async function getStatus(): Promise<LiveStatus> {
  return request<LiveStatus>("/status");
}

export async function setEnabled(enabled: boolean): Promise<{ ok: boolean } & LiveStatus> {
  return request<{ ok: boolean } & LiveStatus>(`/enable?enabled=${enabled}`, { method: "POST" });
}

export async function sendOrder(data: {
  symbol: string;
  side: string;
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  deviation?: number;
  comment?: string;
}): Promise<LiveOrderResult> {
  const params = new URLSearchParams();
  params.set("symbol", data.symbol);
  params.set("side", data.side);
  params.set("volume", String(data.volume));
  if (data.price != null) params.set("price", String(data.price));
  if (data.sl != null) params.set("sl", String(data.sl));
  if (data.tp != null) params.set("tp", String(data.tp));
  if (data.deviation != null) params.set("deviation", String(data.deviation));
  if (data.comment) params.set("comment", data.comment);
  return request<LiveOrderResult>(`/orders?${params.toString()}`, { method: "POST" });
}

export async function closePosition(data: {
  symbol: string;
  volume: number;
  price: number;
  deviation?: number;
}): Promise<LiveOrderResult> {
  const params = new URLSearchParams();
  params.set("symbol", data.symbol);
  params.set("volume", String(data.volume));
  params.set("price", String(data.price));
  if (data.deviation != null) params.set("deviation", String(data.deviation));
  return request<LiveOrderResult>(`/close?${params.toString()}`, { method: "POST" });
}

export async function getPositions(): Promise<{ positions: LivePosition[]; count: number }> {
  return request<{ positions: LivePosition[]; count: number }>("/positions");
}

export async function getAccountInfo(): Promise<LiveAccountInfo> {
  return request<LiveAccountInfo>("/account");
}

export async function getRiskParams(): Promise<LiveRiskParams> {
  return request<LiveRiskParams>("/risk-params");
}

export async function updateRiskParams(data: Partial<LiveRiskParams>): Promise<{ ok: boolean } & LiveRiskParams> {
  return request<{ ok: boolean } & LiveRiskParams>("/risk-params", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function resetDaily(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/reset-daily", { method: "POST" });
}
