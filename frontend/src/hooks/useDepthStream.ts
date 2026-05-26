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
      client.disconnect();
    };
  }, [setDepth, symbols]);
}
