import { useState, useEffect, useMemo } from "react";
import { usePaperTradingStore, type BackendPosition, type BackendOrder, type BackendTrade } from "../stores/usePaperTradingStore";

type Tab = "positions" | "orders" | "history" | "metrics";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD", "BNBUSDT"];
const SIDES = ["buy", "sell"] as const;
const ORDER_TYPES = ["market", "limit", "stop", "stop_limit"] as const;

export function PaperTradingPanel() {
  const {
    balance, initialBalance, equity, positions, orders, closedTrades,
    totalPnl, totalTrades, wins, losses, winRate,
    slippageBps, feeModel, takerFeeBps, makerFeeBps, totalFeesPaid,
    backendAvailable, loading, saving, error,
    fetchSnapshot,
    createOrderREST, cancelOrderREST,
    closePositionREST, updatePositionREST, resetAccountREST,
    saveSettings,
    localOpenPosition, localClosePosition, localCancelOrder, localReset,
  } = usePaperTradingStore();

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<string>("market");
  const [price, setPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [qty, setQty] = useState("0.01");
  const [tab, setTab] = useState<Tab>("positions");
  const [submitting, setSubmitting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [editingSLTP, setEditingSLTP] = useState<number | null>(null);
  const [editSL, setEditSL] = useState("");
  const [editTP, setEditTP] = useState("");

  const pnlColor = totalPnl >= 0 ? "text-accent-green" : "text-accent-red";
  const equityColor = equity >= balance ? "text-accent-green" : "text-accent-red";

  const totalPositionValue = useMemo(
    () =>
      positions.reduce((sum, p) => {
        const isLong = p.side === "long";
        const posPnl = isLong
          ? (p.current_price - p.entry_price) * p.quantity
          : (p.entry_price - p.current_price) * p.quantity;
        return sum + p.entry_price * p.quantity + posPnl;
      }, 0),
    [positions]
  );

  const openOrderCount = orders.filter(
    (o) => o.status === "open" || o.status === "partial"
  ).length;

  const pendingOrders = useMemo(
    () => orders.filter((o) => o.status === "open" || o.status === "partial"),
    [orders]
  );

  const handleSubmitOrder = async () => {
    const q = parseFloat(qty);
    const p = price ? parseFloat(price) : undefined;
    const sp = stopPrice ? parseFloat(stopPrice) : undefined;
    if (isNaN(q) || q <= 0) return;

    setSubmitting(true);
    try {
      if (backendAvailable) {
        await createOrderREST({
          symbol: symbol.toUpperCase(),
          side,
          order_type: orderType as any,
          quantity: q,
          price: p,
          stop_price: sp,
        });
      } else {
        if (orderType === "market") {
          localOpenPosition(symbol.toUpperCase(), side === "buy" ? "long" : "short", p || 50000, q);
        }
      }
      setQty("0.01");
      setPrice("");
      setStopPrice("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (backendAvailable) {
      await cancelOrderREST(orderId);
    } else {
      localCancelOrder(orderId);
    }
  };

  const handleClosePosition = async (positionId: number, exitPrice?: number, reason?: string) => {
    if (backendAvailable) {
      await closePositionREST(positionId, exitPrice, reason);
    } else {
      localClosePosition(positionId, exitPrice || 50000);
    }
  };

  const handleSLTPUpdate = async (positionId: number) => {
    const sl = editSL ? parseFloat(editSL) : undefined;
    const tp = editTP ? parseFloat(editTP) : undefined;
    if (backendAvailable) {
      await updatePositionREST(positionId, sl, tp);
    }
    setEditingSLTP(null);
  };

  const handleReset = async () => {
    if (backendAvailable) {
      await resetAccountREST();
    } else {
      localReset();
    }
    setShowResetConfirm(false);
  };

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Account Summary — Glass card */}
      <div className="p-2 border-b border-surface-border bg-gradient-to-r from-accent-blue/[0.03] to-transparent shrink-0">
        <div className="grid grid-cols-4 gap-1.5 text-[10px]">
          {[
            { label: "Balance", value: `$${balance.toFixed(2)}`, color: "text-text-primary" },
            { label: "Equity", value: `$${equity.toFixed(2)}`, color: equityColor },
            { label: "P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: pnlColor },
            { label: "Buying Power", value: `$${Math.max(0, balance * 0.5).toFixed(0)}`, color: "text-text-primary" },
          ].map((item) => (
            <div key={item.label} className="glass-card rounded-lg p-2 text-center">
              <div className="text-text-tertiary text-[9px] uppercase tracking-widest mb-0.5">{item.label}</div>
              <div className={`font-semibold tabular-nums text-sm ${item.color}`}>{item.value}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-text-tertiary">
          <span>Win Rate: <span className="text-accent-green font-medium">{winRate}%</span></span>
          <span className="w-px h-3 bg-surface-hover" />
          <span>Trades: <span className="text-text-primary font-medium">{totalTrades}</span></span>
          <span className="w-px h-3 bg-surface-hover" />
          <span>
            <span className="text-accent-green font-medium">{wins}</span>W / <span className="text-accent-red font-medium">{losses}</span>L
          </span>
          {!backendAvailable && (
            <span className="text-accent-yellow ml-1" title="Backend unavailable — local mode">⚠</span>
          )}
          <button
            className="ml-auto text-text-tertiary hover:text-text-primary transition-colors"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Order Form */}
      <div className="p-2 border-b border-surface-border space-y-1.5 shrink-0 bg-surface-hover/50">
        {/* Row 1: Symbol + Side */}
        <div className="flex gap-1.5">
          <select
            className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-blue/50 transition-colors"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {SIDES.map((s) => (
              <button
                key={s}
                className={`px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-all duration-200 ${
                  side === s
                    ? s === "buy"
                      ? "bg-accent-green/20 text-accent-green shadow-[0_0_12px_rgba(34,197,94,0.15)]"
                      : "bg-accent-red/20 text-accent-red shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                    : "bg-surface-input text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                }`}
                onClick={() => setSide(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Order type */}
        <div className="flex gap-1">
          {ORDER_TYPES.map((ot) => (
            <button
              key={ot}
              className={`flex-1 px-1.5 py-1 rounded-lg text-[9px] uppercase tracking-widest transition-all duration-200 ${
                orderType === ot
                  ? "bg-accent-blue/15 text-accent-blue shadow-[0_0_8px_rgba(59,130,246,0.1)]"
                  : "bg-surface-input text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
              }`}
              onClick={() => setOrderType(ot)}
            >
              {ot === "stop_limit" ? "S/L" : ot}
            </button>
          ))}
        </div>

        {/* Row 3: Price inputs */}
        <div className="flex gap-1.5">
          {(orderType === "limit" || orderType === "stop_limit") && (
            <input
              className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-colors"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder={orderType === "limit" ? "Limit price" : "Limit price"}
              type="number"
              step="any"
            />
          )}
          {(orderType === "stop" || orderType === "stop_limit") && (
            <input
              className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-colors"
              value={stopPrice}
              onChange={(e) => setStopPrice(e.target.value)}
              placeholder="Stop price"
              type="number"
              step="any"
            />
          )}
          {(orderType === "market") && (
            <input
              className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-colors"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price (optional, uses market)"
              type="number"
              step="any"
            />
          )}
          <input
            className="w-20 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-colors"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qty"
            type="number"
            step="any"
            title="Quantity"
          />
        </div>

        {/* Submit */}
        <button
          className={`w-full py-2 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
            side === "buy"
              ? "bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 shadow-[0_0_16px_rgba(34,197,94,0.1)] hover:shadow-[0_0_20px_rgba(34,197,94,0.2)]"
              : "bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 shadow-[0_0_16px_rgba(239,68,68,0.1)] hover:shadow-[0_0_20px_rgba(239,68,68,0.2)]"
          } disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none`}
          onClick={handleSubmitOrder}
          disabled={submitting || !qty || parseFloat(qty) <= 0}
        >
          {submitting
            ? "Submitting..."
            : `${side === "buy" ? "Buy" : "Sell"} ${orderType === "market" ? "" : orderType.toUpperCase()} ${qty || "0"} ${symbol}`}
        </button>

        {/* Error + Reset */}
        <div className="flex items-center justify-between min-h-[18px]">
          {error && <span className="text-accent-red text-[9px] bg-accent-red/5 px-1.5 py-0.5 rounded">{error}</span>}
          {showResetConfirm ? (
            <div className="flex gap-1.5 items-center ml-auto">
              <span className="text-[9px] text-text-secondary">Reset account?</span>
              <button className="text-[9px] text-accent-red hover:text-text-primary px-1.5 py-0.5 rounded bg-accent-red/10 hover:bg-accent-red/20 transition-colors" onClick={handleReset}>Yes</button>
              <button className="text-[9px] text-text-tertiary hover:text-text-primary px-1.5 py-0.5 rounded bg-surface-hover hover:bg-surface-hover transition-colors" onClick={() => setShowResetConfirm(false)}>No</button>
            </div>
          ) : (
            <button
              className="ml-auto text-[9px] text-text-tertiary hover:text-accent-red transition-colors"
              onClick={() => setShowResetConfirm(true)}
            >
              Reset Account
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-border shrink-0">
        {([
          { id: "positions" as Tab, label: "Positions", count: positions.length },
          { id: "orders" as Tab, label: "Orders", count: openOrderCount },
          { id: "history" as Tab, label: "History", count: closedTrades.length },
          { id: "metrics" as Tab, label: "Stats" },
        ]).map((t) => (
          <button
            key={t.id}
            className={`flex-1 px-1.5 py-2 text-[10px] uppercase tracking-widest transition-all duration-200 ${
              tab === t.id
                ? "text-accent-blue border-b-[1.5px] border-accent-blue bg-accent-blue/[0.04]"
                : "text-text-tertiary hover:text-text-primary"
            }`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 text-accent-yellow">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "positions" && (
          <PositionsTab
            positions={positions}
            editingSLTP={editingSLTP}
            editSL={editSL}
            editTP={editTP}
            onClose={handleClosePosition}
            onStartSLTP={(pos) => {
              setEditingSLTP(pos.id);
              setEditSL(pos.stop_loss?.toString() ?? "");
              setEditTP(pos.take_profit?.toString() ?? "");
            }}
            onSLTPChange={{ setEditSL, setEditTP }}
            onSaveSLTP={handleSLTPUpdate}
            onCancelSLTP={() => setEditingSLTP(null)}
          />
        )}

        {tab === "orders" && (
          <OrdersTab
            orders={pendingOrders}
            onCancel={handleCancelOrder}
          />
        )}

        {tab === "history" && (
          <HistoryTab trades={closedTrades} />
        )}

        {tab === "metrics" && (
          <MetricsTab
            balance={balance}
            initialBalance={initialBalance}
            equity={equity}
            totalPnl={totalPnl}
            totalTrades={totalTrades}
            wins={wins}
            losses={losses}
            winRate={winRate}
            positions={positions}
            totalPositionValue={totalPositionValue}
          />
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          initialBalance={initialBalance}
          slippageBps={slippageBps}
          feeModel={feeModel}
          takerFeeBps={takerFeeBps}
          makerFeeBps={makerFeeBps}
          totalFeesPaid={totalFeesPaid}
          saving={saving}
          error={error}
          backendAvailable={backendAvailable}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

function PositionsTab({
  positions,
  editingSLTP,
  editSL,
  editTP,
  onClose,
  onStartSLTP,
  onSLTPChange,
  onSaveSLTP,
  onCancelSLTP,
}: {
  positions: BackendPosition[];
  editingSLTP: number | null;
  editSL: string;
  editTP: string;
  onClose: (id: number, exitPrice?: number, reason?: string) => void;
  onStartSLTP: (pos: BackendPosition) => void;
  onSLTPChange: { setEditSL: (v: string) => void; setEditTP: (v: string) => void };
  onSaveSLTP: (id: number) => void;
  onCancelSLTP: () => void;
}) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
        <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <span className="text-xs">No open positions</span>
      </div>
    );
  }

  return (
    <div>
      {positions.map((pos) => {
        const pnlColor = pos.pnl >= 0 ? "text-accent-green" : "text-accent-red";
        const isEditing = editingSLTP === pos.id;

        return (
          <div key={pos.id} className="border-b border-surface-border/30 hover:bg-surface-hover transition-colors">
            <div className="px-3 py-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary font-semibold text-xs">{pos.symbol}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    pos.side === "long"
                      ? "bg-accent-green/10 text-accent-green"
                      : "bg-accent-red/10 text-accent-red"
                  }`}>
                    {pos.side === "long" ? "LONG" : "SHORT"}
                  </span>
                  <span className="text-text-tertiary text-[10px]">× {pos.quantity.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-xs font-semibold ${pnlColor}`}>
                    {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(2)}
                  </span>
                  <button
                    className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-all text-[9px]"
                    onClick={() => onClose(pos.id, pos.current_price, "manual")}
                    title="Close position"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
                <span>${pos.entry_price.toFixed(2)} → ${pos.current_price.toFixed(2)}</span>
                <span className={`font-mono ${pnlColor}`}>
                  {pos.pnl_pct >= 0 ? "+" : ""}{pos.pnl_pct.toFixed(2)}%
                </span>
              </div>
              <div className="flex gap-3 mt-1.5 text-[9px]">
                {pos.stop_loss != null && (
                  <span className="text-accent-red/80 bg-accent-red/5 px-1.5 py-0.5 rounded">
                    SL: ${pos.stop_loss.toFixed(2)}
                  </span>
                )}
                {pos.take_profit != null && (
                  <span className="text-accent-green/80 bg-accent-green/5 px-1.5 py-0.5 rounded">
                    TP: ${pos.take_profit.toFixed(2)}
                  </span>
                )}
                <button
                  className="text-text-tertiary hover:text-accent-blue ml-auto transition-colors"
                  onClick={() => onStartSLTP(pos)}
                >
                  {pos.stop_loss != null || pos.take_profit != null ? "Edit SL/TP" : "+ SL/TP"}
                </button>
              </div>
            </div>

            {isEditing && (
              <div className="px-3 pb-2 space-y-1.5 bg-surface-hover/50 border-t border-surface-border/30">
                <div className="flex gap-1.5 mt-1.5">
                  <div className="flex-1">
                    <label className="text-[9px] text-accent-red/60 uppercase tracking-wider mb-0.5 block">Stop Loss</label>
                    <input
                      className="w-full bg-surface-input border border-accent-red/20 rounded-lg px-2 py-1 text-[10px] text-text-primary focus:outline-none focus:border-accent-red/50 transition-colors"
                      value={editSL}
                      onChange={(e) => onSLTPChange.setEditSL(e.target.value)}
                      placeholder="Stop loss"
                      type="number"
                      step="any"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[9px] text-accent-green/60 uppercase tracking-wider mb-0.5 block">Take Profit</label>
                    <input
                      className="w-full bg-surface-input border border-accent-green/20 rounded-lg px-2 py-1 text-[10px] text-text-primary focus:outline-none focus:border-accent-green/50 transition-colors"
                      value={editTP}
                      onChange={(e) => onSLTPChange.setEditTP(e.target.value)}
                      placeholder="Take profit"
                      type="number"
                      step="any"
                    />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    className="flex-1 py-1 rounded-lg bg-accent-blue/15 text-accent-blue text-[9px] font-semibold hover:bg-accent-blue/25 transition-all"
                    onClick={() => onSaveSLTP(pos.id)}
                  >
                    Save
                  </button>
                  <button
                    className="px-3 py-1 rounded-lg bg-surface-hover text-text-secondary text-[9px] hover:text-text-primary hover:bg-surface-hover transition-all"
                    onClick={onCancelSLTP}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OrdersTab({ orders, onCancel }: { orders: BackendOrder[]; onCancel: (id: number) => void }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
        <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="text-xs">No open orders</span>
      </div>
    );
  }

  return (
    <div>
      {orders.map((o) => (
        <div key={o.id} className="px-3 py-2 border-b border-surface-border/30 hover:bg-surface-hover transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-text-primary font-semibold text-xs">{o.symbol}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                o.side === "buy" ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
              }`}>
                {o.side.toUpperCase()}
              </span>
              <span className="text-text-secondary text-[10px]">{o.order_type.toUpperCase()}</span>
            </div>
            <button
              className="text-[9px] text-text-tertiary hover:text-accent-red px-1.5 py-0.5 rounded hover:bg-accent-red/10 transition-all"
              onClick={() => onCancel(o.id)}
            >
              Cancel
            </button>
          </div>
          <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
            <span>
              {o.price != null && <>@ ${o.price.toFixed(2)} </>}
              {o.stop_price != null && <>(Stop: ${o.stop_price.toFixed(2)}) </>}
              × {o.quantity.toFixed(4)}
            </span>
            <span className="text-text-secondary">
              {o.filled_quantity > 0 && `Filled: ${o.filled_quantity.toFixed(4)}`}
            </span>
          </div>
          {o.reason && <div className="text-[9px] text-text-muted mt-0.5 italic">{o.reason}</div>}
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ trades }: { trades: BackendTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
        <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs">No closed trades</span>
      </div>
    );
  }

  return (
    <div>
      {trades.slice(0, 100).map((t) => {
        const isWin = t.pnl > 0;
        return (
          <div
            key={t.id}
            className={`px-3 py-2 border-b border-surface-border/30 transition-colors ${
              isWin ? "hover:bg-accent-green/[0.02]" : "hover:bg-accent-red/[0.02]"
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-text-primary font-semibold text-xs">{t.symbol}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.side === "long" ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                }`}>
                  {t.side === "long" ? "L" : "S"}
                </span>
              </div>
              <span className={`font-mono text-xs font-semibold ${isWin ? "text-accent-green" : "text-accent-red"}`}>
                {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-text-tertiary mt-1">
              <span>${t.entry_price.toFixed(2)} → ${t.exit_price.toFixed(2)}</span>
              <span className={`${isWin ? "text-accent-green" : "text-accent-red"}`}>
                {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
              </span>
            </div>
            {(t.entry_reason || t.exit_reason) && (
              <div className="flex gap-2 text-[9px] text-text-muted mt-1">
                {t.entry_reason && <span>Entry: {t.entry_reason}</span>}
                {t.exit_reason && <span>Exit: {t.exit_reason}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingsModal({
  initialBalance, slippageBps, feeModel, takerFeeBps, makerFeeBps, totalFeesPaid,
  saving, error, backendAvailable, onSave, onClose,
}: {
  initialBalance: number; slippageBps: number; feeModel: "none" | "exchange";
  takerFeeBps: number; makerFeeBps: number; totalFeesPaid: number;
  saving: boolean; error: string | null; backendAvailable: boolean;
  onSave: (s: any) => Promise<boolean>; onClose: () => void;
}) {
  const [localBalance, setLocalBalance] = useState(String(initialBalance));
  const [localSlippage, setLocalSlippage] = useState(String(slippageBps));
  const [localFeeModel, setLocalFeeModel] = useState(feeModel);
  const [localTaker, setLocalTaker] = useState(String(takerFeeBps));
  const [localMaker, setLocalMaker] = useState(String(makerFeeBps));

  useEffect(() => {
    setLocalBalance(String(initialBalance));
    setLocalSlippage(String(slippageBps));
    setLocalFeeModel(feeModel);
    setLocalTaker(String(takerFeeBps));
    setLocalMaker(String(makerFeeBps));
  }, [initialBalance, slippageBps, feeModel, takerFeeBps, makerFeeBps]);

  const handleSave = async () => {
    const updates: any = {};
    const b = parseFloat(localBalance);
    if (!isNaN(b) && b > 0 && b !== initialBalance) updates.initial_balance = b;
    const s = parseFloat(localSlippage);
    if (!isNaN(s) && s >= 0 && s !== slippageBps) updates.slippage_bps = s;
    if (localFeeModel !== feeModel) updates.fee_model = localFeeModel;
    const tk = parseFloat(localTaker);
    if (!isNaN(tk) && tk >= 0 && tk !== takerFeeBps) updates.taker_fee_bps = tk;
    const mk = parseFloat(localMaker);
    if (!isNaN(mk) && mk >= 0 && mk !== makerFeeBps) updates.maker_fee_bps = mk;
    if (Object.keys(updates).length === 0) { onClose(); return; }
    const ok = await onSave(updates);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-card border border-surface-border rounded-xl shadow-2xl w-80 max-h-[90vh] overflow-y-auto backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <span className="text-xs text-text-primary font-semibold uppercase tracking-widest">Paper Settings</span>
          <button className="w-6 h-6 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all text-xs" onClick={onClose}>✕</button>
        </div>

        <div className="p-4 space-y-3.5 text-[11px]">
          <div>
            <label className="text-text-tertiary block mb-1 uppercase tracking-wider text-[9px]">Initial Balance ($)</label>
            <input className="w-full bg-surface-input border border-surface-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent-blue/50 transition-colors" value={localBalance} onChange={(e) => setLocalBalance(e.target.value)} type="number" step="1000" min="100" />
          </div>

          <div>
            <label className="text-text-tertiary block mb-1 uppercase tracking-wider text-[9px]">Slippage (bps)</label>
            <input className="w-full bg-surface-input border border-surface-border rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent-blue/50 transition-colors" value={localSlippage} onChange={(e) => setLocalSlippage(e.target.value)} type="number" step="0.1" min="0" />
          </div>

          <div>
            <label className="text-text-tertiary block mb-1 uppercase tracking-wider text-[9px]">Fee Model</label>
            <div className="flex gap-1.5">
              {(["exchange", "none"] as const).map((fm) => (
                <button key={fm} className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all ${
                  localFeeModel === fm ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30" : "bg-surface-input text-text-tertiary hover:text-text-primary border border-surface-border"
                }`} onClick={() => setLocalFeeModel(fm)}>{fm === "exchange" ? "Exchange" : "None"}</button>
              ))}
            </div>
          </div>

          {localFeeModel === "exchange" && (
            <>
              <div>
                <label className="text-text-tertiary block mb-1 uppercase tracking-wider text-[9px]">Taker Fee (bps)</label>
                <input className="w-full bg-surface-input border border-accent-red/20 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent-red/50 transition-colors" value={localTaker} onChange={(e) => setLocalTaker(e.target.value)} type="number" step="0.5" min="0" />
              </div>
              <div>
                <label className="text-text-tertiary block mb-1 uppercase tracking-wider text-[9px]">Maker Fee (bps)</label>
                <input className="w-full bg-surface-input border border-accent-green/20 rounded-lg px-3 py-1.5 text-text-primary focus:outline-none focus:border-accent-green/50 transition-colors" value={localMaker} onChange={(e) => setLocalMaker(e.target.value)} type="number" step="0.5" min="0" />
              </div>
            </>
          )}

          <div className="bg-surface-hover/50 rounded-lg p-2.5 text-[10px] text-text-tertiary leading-relaxed border border-surface-border">
            {localFeeModel === "none" ? "No fees are deducted from trades." : (
              <>Taker fees apply to market & stop orders.<br />Maker fees apply to limit orders.<br /><span className="text-text-secondary font-medium">Total fees paid: ${totalFeesPaid.toFixed(2)}</span></>
            )}
          </div>

          {error && <div className="text-accent-red text-[10px] bg-accent-red/5 rounded-lg p-2 border border-accent-red/10">{error}</div>}

          <div className="flex gap-1.5 pt-1">
            <button className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              backendAvailable ? "bg-accent-blue/15 text-accent-blue border border-accent-blue/30 hover:bg-accent-blue/25" : "bg-surface-hover text-text-tertiary"
            } disabled:opacity-40`} onClick={handleSave} disabled={saving || !backendAvailable}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button className="flex-1 px-3 py-2 rounded-lg text-xs bg-surface-hover text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricsTab({
  balance, initialBalance, equity, totalPnl, totalTrades, wins, losses, winRate, positions, totalPositionValue,
}: {
  balance: number; initialBalance: number; equity: number; totalPnl: number;
  totalTrades: number; wins: number; losses: number; winRate: number;
  positions: BackendPosition[]; totalPositionValue: number;
}) {
  const drawdown = initialBalance > 0 ? ((initialBalance - Math.max(balance, 0)) / initialBalance) * 100 : 0;
  const avgWin = wins > 0 ? totalPnl / totalTrades : 0;
  // Profit factor = gross profit / gross loss (simplified: use win count ratio as approximation)
  const profitFactor = losses > 0 ? (wins / losses) : wins > 0 ? Infinity : 0;

  const metrics = [
    { label: "Initial Balance", value: `$${initialBalance.toFixed(0)}`, color: "" },
    { label: "Current Balance", value: `$${balance.toFixed(2)}`, color: balance >= initialBalance ? "text-accent-green" : "text-accent-red" },
    { label: "Equity", value: `$${equity.toFixed(2)}`, color: "" },
    { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-accent-green" : "text-accent-red" },
    { label: "Position Value", value: `$${totalPositionValue.toFixed(2)}`, color: "" },
    { label: "Drawdown", value: `${Math.max(0, drawdown).toFixed(2)}%`, color: drawdown > 5 ? "text-accent-red" : "text-text-secondary" },
    { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-accent-green" : "text-accent-red" },
    { label: "Total Trades", value: String(totalTrades), color: "" },
    { label: "W / L", value: `${wins} / ${losses}`, color: "" },
    { label: "Avg Win / Loss", value: `$${avgWin.toFixed(2)}`, color: "" },
    { label: "Profit Factor", value: profitFactor === Infinity ? "∞" : profitFactor.toFixed(2), color: profitFactor >= 1.5 ? "text-accent-green" : "text-accent-red" },
    { label: "Open Positions", value: String(positions.length), color: "" },
  ];

  return (
    <div className="p-3 space-y-0.5">
      <div className="text-[9px] text-text-tertiary uppercase tracking-widest mb-2 pb-2 border-b border-surface-border">Account Metrics</div>
      {metrics.map((m) => (
        <div key={m.label} className="flex justify-between text-[10px] py-1 hover:bg-surface-hover px-1.5 rounded transition-colors">
          <span className="text-text-tertiary">{m.label}</span>
          <span className={`${m.color || "text-text-primary font-semibold"} tabular-nums`}>{m.value}</span>
        </div>
      ))}
    </div>
  );
}
