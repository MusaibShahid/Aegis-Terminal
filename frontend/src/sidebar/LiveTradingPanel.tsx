import { useState, useEffect, useRef, useCallback } from "react";
import { sendOrder, closePosition } from "../api/liveTrading";
import { useLiveTradingStore } from "../stores/useLiveTradingStore";
import type { LivePosition } from "../api/liveTrading";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XAUUSD", "BNBUSDT", "EURUSD", "GBPUSD"];

export function LiveTradingPanel() {
  const {
    enabled, bridgeConnected, loading, error,
    accountInfo, positions,
    maxPositionSize, maxDailyLoss, maxDailyTrades, dailyTradeCount,
    fetchAll, setEnabled, fetchPositions, fetchAccountInfo,
  } = useLiveTradingStore();

  const [showEnableConfirm, setShowEnableConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Order form
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [volume, setVolume] = useState("0.01");
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");

  // Refresh interval
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh when enabled (every 5 seconds)
  useEffect(() => {
    if (enabled && bridgeConnected) {
      refreshRef.current = setInterval(() => {
        fetchPositions();
        fetchAccountInfo();
      }, 5000);
    } else {
      if (refreshRef.current) {
        clearInterval(refreshRef.current);
        refreshRef.current = null;
      }
    }
    return () => {
      if (refreshRef.current) {
        clearInterval(refreshRef.current);
        refreshRef.current = null;
      }
    };
  }, [enabled, bridgeConnected, fetchPositions, fetchAccountInfo]);

  // --- Handlers ---

  const handleToggleEnable = useCallback(async () => {
    setShowEnableConfirm(true);
  }, []);

  const handleConfirmEnable = useCallback(async () => {
    setShowEnableConfirm(false);
    setSubmitting(true);
    await setEnabled(true);
    setSubmitting(false);
  }, [setEnabled]);

  const handleConfirmDisable = useCallback(async () => {
    setShowEnableConfirm(false);
    setSubmitting(true);
    await setEnabled(false);
    setSubmitting(false);
  }, [setEnabled]);

  const handleSubmitOrder = useCallback(async () => {
    const v = parseFloat(volume);
    if (isNaN(v) || v <= 0) return;

    setSubmitting(true);
    try {
      const result = await sendOrder({
        symbol: symbol.toUpperCase(),
        side,
        volume: v,
        price: price ? parseFloat(price) : undefined,
        sl: sl ? parseFloat(sl) : undefined,
        tp: tp ? parseFloat(tp) : undefined,
        comment: "aegis_manual",
      });

      if (result.retcode === 10009) {
        // Success — clear form, refresh positions
        setVolume("0.01");
        setPrice("");
        setSl("");
        setTp("");
        fetchPositions();
        fetchAccountInfo();
      } else {
        useLiveTradingStore.setState({ error: result.error || `retcode ${result.retcode}` });
      }
    } catch (err: any) {
      useLiveTradingStore.setState({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [symbol, side, volume, price, sl, tp, fetchPositions, fetchAccountInfo]);

  const handleClosePosition = useCallback(async (pos: LivePosition) => {
    try {
      const result = await closePosition({
        symbol: pos.symbol,
        volume: pos.volume,
        price: pos.price_current,
      });
      if (result.retcode === 10009) {
        fetchPositions();
        fetchAccountInfo();
      }
    } catch (err: any) {
      useLiveTradingStore.setState({ error: err.message });
    }
  }, [fetchPositions, fetchAccountInfo]);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Engine Status Header */}
      <div className={`p-2 border-b shrink-0 transition-colors duration-300 ${
        enabled ? "bg-accent-red/[0.06] border-accent-red/20" : "border-surface-border"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full transition-colors ${
              bridgeConnected
                ? enabled ? "bg-accent-red animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" : "bg-accent-green"
                : "bg-gray-600"
            }`} />
            <div>
              <div className="text-[11px] font-semibold text-text-primary">
                {enabled ? "Live Trading" : "Live Trading"}
              </div>
              <div className="text-[9px] text-text-tertiary">
                {!bridgeConnected ? "MT5 not connected" : enabled ? "Enabled — real trades" : "Disabled — safe"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] ${enabled ? "text-accent-red" : "text-text-tertiary"}`}>
              {dailyTradeCount}/{maxDailyTrades} today
            </span>
            <button
              className={`relative w-8 h-4 rounded-full transition-colors ${
                enabled ? "bg-accent-red/70" : "bg-gray-700"
              }`}
              onClick={handleToggleEnable}
              disabled={!bridgeConnected}
            >
              <span className={`absolute top-[2px] w-3 h-3 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-[18px]" : "translate-x-[2px]"
              }`} />
            </button>
          </div>
        </div>

        {/* Enable/Disable confirmation */}
        {showEnableConfirm && (
          <div className="mt-2 p-2 rounded-lg bg-accent-red/10 border border-accent-red/20 space-y-1.5">
            <div className="text-[9px] text-accent-red font-medium">
              {enabled
                ? "Disable live trading? No real trades will be sent."
                : "⚠ ENABLE LIVE TRADING — Real trades will be executed on your MT5 account!"}
            </div>
            <div className="flex gap-1.5">
              <button
                className="flex-1 py-1 rounded-lg bg-accent-red/20 text-accent-red text-[9px] font-semibold hover:bg-accent-red/30 transition-all"
                onClick={enabled ? handleConfirmDisable : handleConfirmEnable}
              >
                {enabled ? "Disable" : "Enable Live"}
              </button>
              <button
                className="flex-1 py-1 rounded-lg bg-surface-hover text-text-secondary text-[9px] hover:text-text-primary hover:bg-surface-hover transition-all"
                onClick={() => setShowEnableConfirm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Account Info */}
        {accountInfo && !accountInfo.error && (
          <div className="grid grid-cols-4 gap-1 mt-2">
            {[
              { label: "Balance", value: accountInfo.balance != null ? `$${accountInfo.balance.toFixed(2)}` : "—", color: "text-text-primary" },
              { label: "Equity", value: accountInfo.equity != null ? `$${accountInfo.equity.toFixed(2)}` : "—", color: accountInfo.equity != null && accountInfo.balance != null && accountInfo.equity >= accountInfo.balance ? "text-accent-green" : "text-accent-red" },
              { label: "Margin", value: accountInfo.margin != null ? `$${accountInfo.margin.toFixed(2)}` : "—", color: "text-text-primary" },
              { label: "Free", value: accountInfo.margin_free != null ? `$${accountInfo.margin_free.toFixed(2)}` : "—", color: "text-accent-green" },
            ].map((item) => (
              <div key={item.label} className="glass-card rounded-lg p-1.5 text-center">
                <div className="text-text-muted text-[8px] uppercase tracking-widest">{item.label}</div>
                <div className={`font-semibold tabular-nums text-[10px] ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
        {accountInfo?.name && (
          <div className="flex gap-2 mt-1 text-[8px] text-text-muted">
            <span>{accountInfo.name}</span>
            {accountInfo.server && <span>@{accountInfo.server}</span>}
            {accountInfo.currency && <span>{accountInfo.currency}</span>}
          </div>
        )}
      </div>

      {/* Order Form — only show when enabled */}
      {enabled && (
        <div className="p-2 border-b border-accent-red/10 space-y-1.5 shrink-0 bg-accent-red/[0.02]">
          <div className="text-[9px] text-accent-red/60 uppercase tracking-widest font-semibold mb-1">
            Quick Order
          </div>

          {/* Row 1: Symbol + Side */}
          <div className="flex gap-1.5">
            <select
              className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent-red/50 transition-colors"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            >
              {SYMBOLS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-1">
              {(["buy", "sell"] as const).map((s) => (
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

          {/* Row 2: Volume + Price */}
          <div className="flex gap-1.5">
            <input
              className="w-24 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-red/50 transition-colors"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              placeholder="Volume"
              type="number"
              step="0.01"
              min="0.01"
            />
            <input
              className="flex-1 bg-surface-input border border-surface-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-red/50 transition-colors"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price (optional, 0 = market)"
              type="number"
              step="any"
            />
          </div>

          {/* Row 3: SL + TP */}
          <div className="flex gap-1.5">
            <input
              className="flex-1 bg-surface-input border border-accent-red/20 rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-red/50 transition-colors"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="Stop Loss (optional)"
              type="number"
              step="any"
            />
            <input
              className="flex-1 bg-surface-input border border-accent-green/20 rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green/50 transition-colors"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="Take Profit (optional)"
              type="number"
              step="any"
            />
          </div>

          {/* Submit */}
          <button
            className={`w-full py-2 rounded-lg text-xs font-semibold tracking-wider transition-all duration-200 ${
              side === "buy"
                ? "bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30"
                : "bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30"
            } disabled:opacity-30 disabled:cursor-not-allowed`}
            onClick={handleSubmitOrder}
            disabled={submitting || !volume || parseFloat(volume) <= 0}
          >
            {submitting
              ? "Sending..."
              : `${side === "buy" ? "BUY" : "SELL"} ${volume} ${symbol}`}
          </button>

          {/* Error */}
          {error && (
            <div className="text-accent-red text-[9px] bg-accent-red/5 rounded-lg p-2 border border-accent-red/10">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Positions */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {/* Positions header */}
        <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-surface-border sticky top-0 bg-surface/90 backdrop-blur-sm z-10">
          <span className="text-[9px] text-text-tertiary uppercase tracking-widest font-semibold">
            Positions {positions.length > 0 && `(${positions.length})`}
          </span>
          <button
            className="text-[9px] text-text-tertiary hover:text-text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-surface-hover"
            onClick={() => { fetchPositions(); fetchAccountInfo(); }}
            disabled={!bridgeConnected}
          >
            ↻ Refresh
          </button>
        </div>

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-text-tertiary">
            <svg className="w-8 h-8 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span className="text-xs">No MT5 positions</span>
            {!enabled && (
              <span className="text-[9px] text-text-muted mt-1">Enable live trading to view positions</span>
            )}
          </div>
        ) : (
          <div>
            {positions.map((pos) => {
              const isLong = pos.type === 0;
              const pnlColor = pos.profit >= 0 ? "text-accent-green" : "text-accent-red";
              return (
                <div key={pos.ticket} className="px-2.5 py-2 border-b border-surface-border/30 hover:bg-surface-hover transition-colors">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-semibold text-xs">{pos.symbol}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isLong ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                      }`}>
                        {isLong ? "LONG" : "SHORT"}
                      </span>
                      <span className="text-text-tertiary text-[10px]">× {pos.volume.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-mono text-xs font-semibold ${pnlColor}`}>
                        {pos.profit >= 0 ? "+" : ""}${pos.profit.toFixed(2)}
                      </span>
                      {enabled && (
                        <button
                          className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-all text-[9px]"
                          onClick={() => handleClosePosition(pos)}
                          title="Close position"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] text-text-tertiary mt-0.5">
                    <span>${pos.price_open.toFixed(2)} → ${pos.price_current.toFixed(2)}</span>
                    {pos.sl > 0 && <span className="text-accent-red/70">SL: ${pos.sl.toFixed(2)}</span>}
                    {pos.tp > 0 && <span className="text-accent-green/70">TP: ${pos.tp.toFixed(2)}</span>}
                  </div>
                  {pos.comment && (
                    <div className="text-[9px] text-text-muted mt-0.5 italic">{pos.comment}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-surface/60 backdrop-blur-[1px] flex items-center justify-center z-20">
          <div className="w-4 h-4 border-2 border-accent-red/40 border-t-accent-red rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
