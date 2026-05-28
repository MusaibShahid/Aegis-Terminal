const BASE = "/api/paper";

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

// --- Types matching backend ---

export interface PaperOrderRequest {
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit" | "stop" | "stop_limit";
  quantity: number;
  price?: number;
  stop_price?: number;
  reason?: string;
}

export interface PaperAccountSnapshot {
  balance: number;
  initial_balance: number;
  equity: number;
  total_pnl: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  positions: any[];
  orders: any[];
  closed_trades: any[];
}

// --- Settings types ---

export interface PaperSettings {
  initial_balance: number;
  slippage_bps: number;
  fee_model: "none" | "exchange";
  taker_fee_bps: number;
  maker_fee_bps: number;
}

export interface PaperSettingsUpdate {
  initial_balance?: number;
  slippage_bps?: number;
  fee_model?: "none" | "exchange";
  taker_fee_bps?: number;
  maker_fee_bps?: number;
}

// --- API functions ---

export async function getAccount(): Promise<PaperAccountSnapshot> {
  return request<PaperAccountSnapshot>("/account");
}

export async function createOrder(data: PaperOrderRequest): Promise<any> {
  const params = new URLSearchParams();
  params.set("symbol", data.symbol);
  params.set("side", data.side);
  params.set("order_type", data.order_type);
  params.set("quantity", String(data.quantity));
  if (data.price != null) params.set("price", String(data.price));
  if (data.stop_price != null) params.set("stop_price", String(data.stop_price));
  if (data.reason) params.set("reason", data.reason);
  return request<any>(`/orders?${params.toString()}`, { method: "POST" });
}

export async function listOrders(): Promise<any[]> {
  const res = await request<{ orders: any[] }>("/orders");
  return res.orders;
}

export async function cancelOrder(orderId: number): Promise<any> {
  return request<any>(`/orders/${orderId}`, { method: "DELETE" });
}

export async function listPositions(): Promise<any[]> {
  const res = await request<{ positions: any[] }>("/positions");
  return res.positions;
}

export async function updatePosition(
  positionId: number,
  stopLoss?: number,
  takeProfit?: number
): Promise<any> {
  const params = new URLSearchParams();
  if (stopLoss != null) params.set("stop_loss", String(stopLoss));
  if (takeProfit != null) params.set("take_profit", String(takeProfit));
  return request<any>(`/positions/${positionId}?${params.toString()}`, {
    method: "PUT",
  });
}

export async function closePosition(
  positionId: number,
  exitPrice?: number,
  reason?: string
): Promise<any> {
  const params = new URLSearchParams();
  if (exitPrice != null) params.set("exit_price", String(exitPrice));
  if (reason) params.set("reason", reason);
  return request<any>(`/positions/${positionId}?${params.toString()}`, {
    method: "DELETE",
  });
}

export async function getHistory(): Promise<any[]> {
  const res = await request<{ trades: any[] }>("/history");
  return res.trades;
}

export async function resetAccount(): Promise<any> {
  return request<any>("/reset", { method: "POST" });
}

// --- Settings ---

export async function getSettings(): Promise<PaperSettings> {
  return request<PaperSettings>("/settings");
}

export async function updateSettings(data: PaperSettingsUpdate): Promise<PaperSettings> {
  const params = new URLSearchParams();
  if (data.initial_balance != null) params.set("initial_balance", String(data.initial_balance));
  if (data.slippage_bps != null) params.set("slippage_bps", String(data.slippage_bps));
  if (data.fee_model != null) params.set("fee_model", data.fee_model);
  if (data.taker_fee_bps != null) params.set("taker_fee_bps", String(data.taker_fee_bps));
  if (data.maker_fee_bps != null) params.set("maker_fee_bps", String(data.maker_fee_bps));
  return request<PaperSettings>(`/settings?${params.toString()}`, { method: "PUT" });
}
