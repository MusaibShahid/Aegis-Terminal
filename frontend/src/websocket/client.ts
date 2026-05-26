import type { Candle, WsMessage } from "../types";

type MessageHandler = (msg: WsMessage) => void;
type CandleHandler = (candle: Candle) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnect = 10;
  private baseDelay = 1000;
  private messageHandlers = new Map<string, Set<MessageHandler>>();
  private candleHandlers = new Map<string, Set<CandleHandler>>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  public onOpen: (() => void) | null = null;

  constructor(channel: string) {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    this.url = `${proto}://${window.location.host}/ws/${channel}`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        this.dispatch(msg);
      } catch {
        /* ignore malformed */
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.reconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private reconnect() {
    if (this.reconnectAttempts >= this.maxReconnect) return;
    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 30_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(msg: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(symbols: string[], intervals: string[]) {
    this.send({ type: "subscribe", symbols, intervals });
  }

  onMessage(type: string, handler: MessageHandler) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
    return () => this.messageHandlers.get(type)?.delete(handler);
  }

  onCandle(symbol: string, interval: string, handler: CandleHandler) {
    const key = `${symbol}:${interval}`;
    if (!this.candleHandlers.has(key)) {
      this.candleHandlers.set(key, new Set());
    }
    this.candleHandlers.get(key)!.add(handler);
    return () => this.candleHandlers.get(key)?.delete(handler);
  }

  private dispatch(msg: WsMessage) {
    const handlers = this.messageHandlers.get(msg.type);
    handlers?.forEach((h) => h(msg));

    if (msg.type === "candle") {
      const key = `${msg.symbol}:${msg.interval}`;
      const candleHandlers = this.candleHandlers.get(key);
      candleHandlers?.forEach((h) => h(msg as unknown as Candle));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    this.reconnectAttempts = this.maxReconnect;
    this.ws?.close();
    this.ws = null;
  }
}
