import { useEffect, useRef } from "react";

import { useAlertStore } from "../stores/useAlertStore";
import { useBotStore } from "../stores/useBotStore";
import { useConnectionStore } from "../stores/useConnectionStore";
import { useCountdownStore } from "../stores/useCountdownStore";
import { useFootprintStore } from "../stores/useFootprintStore";
import { useMarketStore } from "../stores/useMarketStore";
import type { BotSignal, Candle, CountdownMessage, Quote, WsMessage } from "../types";
import { WSClient } from "../websocket/client";

export function useWebSocket(channel: string = "market") {
  const clientRef = useRef<WSClient | null>(null);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const addCandle = useMarketStore((s) => s.addCandle);
  const updateQuote = useMarketStore((s) => s.updateQuote);
  const setFootprint = useFootprintStore((s) => s.setFootprint);
  const setVPVR = useFootprintStore((s) => s.setVPVR);
  const setDelta = useFootprintStore((s) => s.setDelta);
  const addSignal = useBotStore((s) => s.addSignal);
  const addTriggered = useAlertStore((s) => s.addTriggered);
  const updateCountdown = useCountdownStore((s) => s.update);

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

    setStatus("connecting");
    client.onOpen = () => setStatus("connected");
    client.connect();

    return () => {
      client.disconnect();
      setStatus("disconnected");
    };
  }, [channel, setStatus, addCandle, updateQuote, setFootprint, setVPVR, setDelta, addSignal, addTriggered]);

  return {
    client: clientRef.current,
    subscribe: (symbols: string[], intervals: string[]) =>
      clientRef.current?.subscribe(symbols, intervals),
  };
}
