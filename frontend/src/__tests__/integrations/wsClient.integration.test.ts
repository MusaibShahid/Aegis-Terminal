import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { WSClient } from "../../websocket/client";

// ---------------------------------------------------------------------------
// Mock WebSocket — proper class with static properties
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 1;
  onopen: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;
  onerror: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "close" } as any);
  });
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  _triggerOpen() {
    this.readyState = 1;
    this.onopen?.({} as any);
  }

  _triggerClose(code = 1000, reason = "close") {
    this.readyState = 3;
    this.onclose?.({ code, reason } as any);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function getLatestWs() {
  expect(MockWebSocket.instances.length).toBeGreaterThan(0);
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WSClient integration", () => {
  let client: WSClient;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      value: { protocol: "http:", host: "localhost:5173" },
      writable: true,
    });
    client = new WSClient("market");
  });

  afterEach(() => {
    client.disconnect();
  });

  // -----------------------------------------------------------------------
  // URL construction
  // -----------------------------------------------------------------------

  it("constructs correct WebSocket URL", () => {
    expect((client as any).url).toBe("ws://localhost:5173/ws/market");
  });

  it("uses wss:// for https pages", () => {
    Object.defineProperty(window, "location", {
      value: { protocol: "https:", host: "example.com" },
      writable: true,
    });
    const secureClient = new WSClient("admin");
    expect((secureClient as any).url).toBe("wss://example.com/ws/admin");
    secureClient.disconnect();
  });

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  it("connect() creates WebSocket and triggers onOpen", () => {
    const onOpen = vi.fn();
    client.onOpen = onOpen;
    client.connect();

    const ws = getLatestWs();
    expect(ws.url).toBe("ws://localhost:5173/ws/market");

    ws._triggerOpen();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate connect() calls", () => {
    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    client.connect(); // second call — ws is OPEN, should no-op

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it("disconnect() closes the WebSocket", () => {
    client.connect();
    const ws = getLatestWs();
    client.disconnect();
    expect(ws.close).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // send() — queues when not connected, flushes on open
  // -----------------------------------------------------------------------

  it("send() queues messages when not connected and drains on open", () => {
    client.send({ type: "test", value: 42 });

    client.connect();
    const ws = getLatestWs();

    // Before open: messages are queued, not sent yet
    expect(ws.send).not.toHaveBeenCalled();

    // On open: pending queue is drained
    ws._triggerOpen();

    // The queue should be drained — message should be sent
    const sentJson = ws.send.mock.calls.map((c: any) => c[0]);
    expect(sentJson).toContain(JSON.stringify({ type: "test", value: 42 }));
  });

  it("send() sends immediately when connected", () => {
    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    client.send({ type: "ping" });
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "ping" }));
  });

  // -----------------------------------------------------------------------
  // subscribe()
  // -----------------------------------------------------------------------

  it("subscribe() sends subscribe message", () => {
    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    client.subscribe(["BTCUSDT"], ["1m", "5m"]);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe", symbols: ["BTCUSDT"], intervals: ["1m", "5m"] })
    );
  });

  // -----------------------------------------------------------------------
  // onMessage handler dispatch
  // -----------------------------------------------------------------------

  it("onMessage dispatches to registered handlers by type", () => {
    const candleHandler = vi.fn();
    const quoteHandler = vi.fn();

    client.onMessage("candle", candleHandler);
    client.onMessage("quote", quoteHandler);

    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    ws.onmessage!({ data: JSON.stringify({ type: "candle", close: 50000 }) } as any);
    expect(candleHandler).toHaveBeenCalledTimes(1);
    expect(quoteHandler).not.toHaveBeenCalled();

    ws.onmessage!({ data: JSON.stringify({ type: "quote", bid: 100 }) } as any);
    expect(quoteHandler).toHaveBeenCalledTimes(1);
  });

  it("onMessage returns an unsubscribe function", () => {
    const handler = vi.fn();
    const unsubscribe = client.onMessage("candle", handler);

    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    ws.onmessage!({ data: JSON.stringify({ type: "candle" }) } as any);
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    ws.onmessage!({ data: JSON.stringify({ type: "candle" }) } as any);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // onCandle handler dispatch
  // -----------------------------------------------------------------------

  it("onCandle dispatches to symbol:interval specific handlers", () => {
    const btcHandler = vi.fn();
    const ethHandler = vi.fn();

    client.onCandle("BTCUSDT", "1m", btcHandler);
    client.onCandle("ETHUSDT", "5m", ethHandler);

    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    ws.onmessage!({
      data: JSON.stringify({ type: "candle", symbol: "BTCUSDT", interval: "1m", close: 50000 }),
    } as any);
    expect(btcHandler).toHaveBeenCalledTimes(1);
    expect(ethHandler).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Reconnection
  // -----------------------------------------------------------------------

  it("reconnects on close with exponential backoff", () => {
    vi.useFakeTimers();
    client.connect();
    const ws1 = getLatestWs();

    // Close the connection — triggers reconnect with delay
    ws1._triggerClose();

    // First attempt: 1s delay
    vi.advanceTimersByTime(1000);
    expect(MockWebSocket.instances.length).toBe(2);

    // Close again — second attempt: 2s delay
    MockWebSocket.instances[1]._triggerClose();
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances.length).toBe(3);

    vi.useRealTimers();
  });

  it("stops reconnecting after maxReconnect attempts", () => {
    vi.useFakeTimers();
    client.connect(); // WS #1

    // Trigger 10 close-reconnect cycles.
    // Exponential backoff: delays are 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s, 256s, 512s.
    // Advance by 600s each iteration — well past the 512s max delay.
    for (let i = 0; i < 10; i++) {
      const ws = getLatestWs();
      ws._triggerClose();
      vi.advanceTimersByTime(600_000);
    }

    // Initial + 10 reconnects = 11 instances
    expect(MockWebSocket.instances.length).toBe(11);

    // One more close — should NOT create a new instance
    const lastWs = getLatestWs();
    lastWs._triggerClose();
    vi.advanceTimersByTime(600_000);
    expect(MockWebSocket.instances.length).toBe(11);

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Re-subscription on reconnect
  // -----------------------------------------------------------------------

  it("re-subscribes last subscription on reconnect", () => {
    vi.useFakeTimers();
    client.connect();
    const ws1 = getLatestWs();
    ws1._triggerOpen();

    // Subscribe
    client.subscribe(["BTCUSDT"], ["1m"]);
    expect(ws1.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe", symbols: ["BTCUSDT"], intervals: ["1m"] })
    );

    // Close and reconnect
    ws1._triggerClose();
    vi.advanceTimersByTime(1100);

    const ws2 = getLatestWs();
    ws2._triggerOpen();

    // Should re-subscribe on the new connection
    const subscribeCalls = ws2.send.mock.calls.filter(
      (call: any) => typeof call[0] === "string" && call[0].includes("subscribe")
    );
    expect(subscribeCalls.length).toBe(1);
    expect(subscribeCalls[0][0]).toContain("BTCUSDT");

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Malformed messages
  // -----------------------------------------------------------------------

  it("ignores malformed JSON messages gracefully", () => {
    const handler = vi.fn();
    client.onMessage("candle", handler);

    client.connect();
    const ws = getLatestWs();

    expect(() => {
      ws.onmessage!({ data: "{not valid json}" } as any);
    }).not.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Multiple handlers for same type
  // -----------------------------------------------------------------------

  it("supports multiple handlers for the same message type", () => {
    const h1 = vi.fn();
    const h2 = vi.fn();

    client.onMessage("quote", h1);
    client.onMessage("quote", h2);

    client.connect();
    const ws = getLatestWs();
    ws._triggerOpen();

    ws.onmessage!({ data: JSON.stringify({ type: "quote", bid: 100 }) } as any);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
