import { describe, expect, it, beforeEach } from "vitest";

import { useConnectionStore } from "../useConnectionStore";

beforeEach(() => {
  useConnectionStore.setState({ status: "disconnected", latency: null });
});

describe("useConnectionStore", () => {
  it("starts disconnected with null latency", () => {
    const state = useConnectionStore.getState();
    expect(state.status).toBe("disconnected");
    expect(state.latency).toBeNull();
  });

  it("setStatus updates the connection status", () => {
    useConnectionStore.getState().setStatus("connecting");
    expect(useConnectionStore.getState().status).toBe("connecting");

    useConnectionStore.getState().setStatus("connected");
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("setLatency updates the latency value", () => {
    useConnectionStore.getState().setLatency(42);
    expect(useConnectionStore.getState().latency).toBe(42);

    useConnectionStore.getState().setLatency(100);
    expect(useConnectionStore.getState().latency).toBe(100);
  });

  it("setLatency accepts zero", () => {
    useConnectionStore.getState().setLatency(0);
    expect(useConnectionStore.getState().latency).toBe(0);
  });

  it("handles rapid status transitions", () => {
    const store = useConnectionStore.getState();
    store.setStatus("connecting");
    store.setStatus("disconnected");
    store.setStatus("connecting");
    store.setStatus("connected");
    expect(useConnectionStore.getState().status).toBe("connected");
  });
});
