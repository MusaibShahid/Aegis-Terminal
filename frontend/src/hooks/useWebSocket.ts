import { useEffect, useRef } from "react";

import { useAlertStore } from "../stores/useAlertStore";
import { useBotStore } from "../stores/useBotStore";
import { useConnectionStore } from "../stores/useConnectionStore";
import { useCountdownStore } from "../stores/useCountdownStore";
import { useFootprintStore } from "../stores/useFootprintStore";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useMarketStore } from "../stores/useMarketStore";
import { usePaperTradingStore } from "../stores/usePaperTradingStore";
import type { BotSignal, Candle, CountdownMessage, Quote, WsMessage } from "../types";
import { WSClient } from "../websocket/client";

const paperStore = () => usePaperTradingStore.getState();

export function useWebSocket(channel: string = "market") {
  const clientRef = useRef<WSClient | null>(null);
  const prevSubKeyRef = useRef("");
  const setStatus = useConnectionStore((s) => s.setStatus);
  const addCandle = useMarketStore((s) => s.addCandle);
  const updateQuote = useMarketStore((s) => s.updateQuote);
  const setFootprint = useFootprintStore((s) => s.setFootprint);
  const setVPVR = useFootprintStore((s) => s.setVPVR);
  const setDelta = useFootprintStore((s) => s.setDelta);
  const addSignal = useBotStore((s) => s.addSignal);
  const addTriggered = useAlertStore((s) => s.addTriggered);
  const updateCountdown = useCountdownStore((s) => s.update);
  const replaceSnapshot = usePaperTradingStore((s) => s.replaceSnapshot);

  // Subscribe to pane symbols/intervals and clear stale candles
  const panes = useLayoutStore((s) => s.panes);
  const clearCandles = useMarketStore((s) => s.clearCandles);

  useEffect(() => {
    const client = new WSClient(channel);
    clientRef.current = client;

    client.onMessage("candle", (msg: WsMessage) => {
      addCandle(
        msg.symbol as string,
        msg.interval as string,
        msg as unknown as Candle
      );
    });

    client.onMessage("quote", (msg: WsMessage) => {
      updateQuote(msg.symbol as string, msg as unknown as Quote);
    });

    client.onMessage("footprint", (msg: WsMessage) => {
      setFootprint(msg.symbol as string, msg as any);
    });

    client.onMessage("vpvr", (msg: WsMessage) => {
      setVPVR(msg.symbol as string, msg as any);
    });

    client.onMessage("delta", (msg: WsMessage) => {
      setDelta(msg.symbol as string, msg as any);
    });

    client.onMessage("bot_signal", (msg: WsMessage) => {
      addSignal(msg as unknown as BotSignal);
    });

    client.onMessage("alert_triggered", (msg: WsMessage) => {
      addTriggered(msg as any);
    });

    client.onMessage("candle_time", (msg: WsMessage) => {
      updateCountdown(msg as unknown as CountdownMessage);
    });

    // Paper trading event handlers
    client.onMessage("paper_snapshot", (msg: WsMessage) => {
      paperStore().replaceSnapshot(msg as any);
    });

    client.onMessage("paper_order_created", (msg: any) => {
      if (msg.data) paperStore().addWsOrder(msg.data);
    });

    client.onMessage("paper_order_filled", (msg: any) => {
      if (msg.data) paperStore().handleOrderFilled(msg.data);
    });

    client.onMessage("paper_order_cancelled", (msg: any) => {
      if (msg.data) paperStore().removeWsOrder(msg.data.id);
    });

    client.onMessage("paper_position_opened", (msg: any) => {
      if (msg.data) paperStore().addWsPosition(msg.data);
    });

    client.onMessage("paper_position_closed", (msg: any) => {
      if (msg.data) paperStore().handleWsPositionClosed(msg.data);
    });

    client.onMessage("paper_position_updated", (msg: any) => {
      if (msg.data) paperStore().updateWsPosition(msg.data);
    });

    client.onMessage("paper_reset_done", (msg: WsMessage) => {
      paperStore().replaceSnapshot(msg as any);
    });

    client.onMessage("paper_error", (msg: any) => {
      console.warn("Paper trading WS error:", msg.message);
    });

    setStatus("connecting");
    client.onOpen = () => {
      setStatus("connected");
      // Request paper trading snapshot
      client.send({ type: "paper_get_snapshot" });
    };
    client.connect();

    return () => {
      client.disconnect();
      setStatus("disconnected");
    };
  }, [channel, setStatus, addCandle, updateQuote, setFootprint, setVPVR, setDelta, addSignal, addTriggered, replaceSnapshot]);

  // Watch pane changes to sync WebSocket subscriptions & clear stale candle data
  useEffect(() => {
    const client = clientRef.current;
    if (!client) return;

    const symbols = new Set<string>();
    const intervals = new Set<string>();
    const currentKeys = panes.map((p) => `${p.symbol}:${p.interval}`);

    for (const p of panes) {
      symbols.add(p.symbol);
      intervals.add(p.interval);
    }

    // Only re-subscribe if the set changed
    const subKey = [...symbols].sort().join(",") + "|" + [...intervals].sort().join(",");
    if (subKey !== prevSubKeyRef.current) {
      client.subscribe([...symbols], [...intervals]);
      prevSubKeyRef.current = subKey;
    }

    // Clear candle data for keys not used by any pane
    const allStoredKeys = Object.keys(useMarketStore.getState().candles);
    const staleKeys = allStoredKeys.filter((k) => !currentKeys.includes(k));
    if (staleKeys.length > 0) {
      clearCandles(staleKeys);
    }
  }, [panes, clearCandles]);

  return {
    client: clientRef.current,
    subscribe: (symbols: string[], intervals: string[]) =>
      clientRef.current?.subscribe(symbols, intervals),
  };
}
