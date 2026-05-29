import { useEffect, useRef } from "react";
import { useDOMStore } from "../stores/useDOMStore";
import { WSClient } from "../websocket/client";

export function useDepthStream(symbols: string[]) {
  const setDepth = useDOMStore((s) => s.setDepth);
  const clientRef = useRef<WSClient | null>(null);

  useEffect(() => {
    const client = new WSClient("depth");
    clientRef.current = client;
    client.connect();

    // Subscribe to depth data for the requested symbols
    const subscribeHandler = () => {
      if (symbols.length > 0) {
        client.send({ type: "subscribe", channel: "depth", symbols });
      }
    };
    // Use onOpen callback to subscribe when connected
    client.onOpen = subscribeHandler;
    // Also try after a delay in case connection is already open
    const timer = setTimeout(subscribeHandler, 500);

    client.onMessage("depth", (msg: any) => {
      if (msg.symbol) {
        setDepth(msg.symbol, {
          symbol: msg.symbol,
          bids: (msg.bids || []).map((b: number[]) => ({ price: b[0], volume: b[1] })),
          asks: (msg.asks || []).map((a: number[]) => ({ price: a[0], volume: a[1] })),
          timestamp: msg.timestamp,
        });
      }
    });

    return () => {
      clearTimeout(timer);
      client.disconnect();
    };
  }, [setDepth]);
}
