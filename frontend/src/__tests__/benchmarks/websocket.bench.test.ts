import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { WSClient } from "../../websocket/client";
import { getBudgets, benchmarkScenario } from "./benchmarkUtils";
import type { WsMessage } from "../../types";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  /** Track the most recent instance for benchmark access */
  static last: MockWebSocket | null = null;

  url: string;
  readyState = 1;
  onopen: ((ev: any) => any) | null = null;
  onclose: ((ev: any) => any) | null = null;
  onmessage: ((ev: any) => any) | null = null;
  close = vi.fn();
  send = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.last = this;
  }

  _triggerOpen() {
    this.readyState = 1;
    this.onopen?.({} as any);
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", MockWebSocket);
  Object.defineProperty(window, "location", {
    value: { protocol: "http:", host: "localhost:5173" },
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Benchmark suites
// ---------------------------------------------------------------------------

describe("benchmark: WebSocket message processing", () => {
  const budgets = getBudgets();
  const ITERATIONS = 10_000;

  it("JSON parse + dispatch — 10 000 messages to 1 handler", () => {
    const client = new WSClient("market");
    const handler = vi.fn();
    client.onMessage("candle", handler);

    client.connect();
    // Trigger open so the client's internal onmessage pipeline is live
    MockWebSocket.last?._triggerOpen();

    // Build pre-serialized messages
    const messages: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      messages.push(
        JSON.stringify({
          type: "candle",
          symbol: "BTCUSDT",
          interval: "1m",
          time: 1_000_000_000 + i,
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000 + i,
        } satisfies WsMessage & { time: number }),
      );
    }

    let idx = 0;
    benchmarkScenario(
      "WS parse + dispatch × 10 000",
      () => {
        const ws = MockWebSocket.last;
        if (ws?.onmessage) {
          ws.onmessage({ data: messages[idx++ % ITERATIONS] } as any);
        }
      },
      ITERATIONS,
      budgets.wsJsonParseDispatch,
    );

    expect(handler).toHaveBeenCalled();
    client.disconnect();
  });

  it("handler fan-out — 10 000 dispatches to 5 listeners", () => {
    const client = new WSClient("market");
    const handlers = Array.from({ length: 5 }, () => vi.fn());
    handlers.forEach((h) => client.onMessage("quote", h));

client.connect();
    MockWebSocket.last?._triggerOpen();

    // Pre-serialize the message
    const message = JSON.stringify({
      type: "quote",
      symbol: "BTCUSDT",
      bid: 50000,
      ask: 50001,
    });

    benchmarkScenario(
      "WS handler fan-out (5 hds) × 10 000",
      () => {
        const ws = MockWebSocket.last;
        if (ws?.onmessage) {
          ws.onmessage({ data: message } as any);
        }
      },
      ITERATIONS,
      budgets.wsHandlerFanout,
    );

    handlers.forEach((h) => expect(h).toHaveBeenCalled());
    client.disconnect();
  });

  it("subscribe message serialization — 10 000 subscribe calls", () => {
    const client = new WSClient("market");
    const sendSpy = vi.spyOn(client, "send" as any);

    const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    const intervals = ["1m", "5m", "15m", "1h"];

    benchmarkScenario(
      "WS subscribe serialize × 10 000",
      () => {
        client.subscribe(symbols, intervals);
      },
      ITERATIONS,
      budgets.wsSubscribeSerialize,
    );

    expect(sendSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
    client.disconnect();
  });

  it("candle dispatch via onCandle — 10 000 candle messages", () => {
    const client = new WSClient("market");
    const candleHandler = vi.fn();
    client.onCandle("BTCUSDT", "1m", candleHandler);

    client.connect();
    MockWebSocket.last?._triggerOpen();

    // Pre-serialize messages so serialization time isn't in the measurement
    const messages: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      messages.push(
        JSON.stringify({
          type: "candle" as const,
          symbol: "BTCUSDT",
          interval: "1m",
          time: 1_000_000_000 + i,
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 1000,
        }),
      );
    }

    let idx = 0;
    benchmarkScenario(
      "WS candle dispatch × 10 000",
      () => {
        const ws = MockWebSocket.last;
        if (ws?.onmessage) {
          ws.onmessage({ data: messages[idx++ % ITERATIONS] } as any);
        }
      },
      ITERATIONS,
      budgets.wsJsonParseDispatch,
    );

    expect(candleHandler).toHaveBeenCalled();
    client.disconnect();
  });
});
