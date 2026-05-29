import { describe, expect, it, beforeEach } from "vitest";

import { useAlertStore } from "../useAlertStore";
import type { PriceAlert } from "../useAlertStore";

const mockAlert = (overrides?: Partial<PriceAlert>): PriceAlert => ({
  id: 1,
  symbol: "BTCUSDT",
  condition: ">",
  price: 50000,
  enabled: true,
  ...overrides,
});

beforeEach(() => {
  useAlertStore.setState({ alerts: [], triggered: [] });
});

describe("useAlertStore", () => {
  it("starts with empty alerts and triggered", () => {
    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
    expect(state.triggered).toEqual([]);
  });

  it("setAlerts replaces all alerts", () => {
    useAlertStore.getState().setAlerts([mockAlert({ id: 1 }), mockAlert({ id: 2 })]);
    expect(useAlertStore.getState().alerts).toHaveLength(2);
  });

  it("addAlert appends an alert", () => {
    useAlertStore.getState().addAlert({ symbol: "BTCUSDT", condition: ">", price: 50000 });
    useAlertStore.getState().addAlert({ symbol: "ETHUSDT", condition: "<", price: 2000 });
    expect(useAlertStore.getState().alerts).toHaveLength(2);
  });

  it("removeAlert removes by id", () => {
    useAlertStore.getState().addAlert({ symbol: "BTCUSDT", condition: ">", price: 50000 });
    const firstId = useAlertStore.getState().alerts[0].id;
    useAlertStore.getState().addAlert({ symbol: "ETHUSDT", condition: "<", price: 2000 });
    useAlertStore.getState().removeAlert(firstId);
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(useAlertStore.getState().alerts[0].symbol).toBe("ETHUSDT");
  });

  it("toggleAlert flips enabled flag", () => {
    useAlertStore.getState().addAlert({ symbol: "BTCUSDT", condition: ">", price: 50000 });
    const id = useAlertStore.getState().alerts[0].id;
    expect(useAlertStore.getState().alerts[0].enabled).toBe(true);
    useAlertStore.getState().toggleAlert(id);
    expect(useAlertStore.getState().alerts[0].enabled).toBe(false);
    useAlertStore.getState().toggleAlert(id);
    expect(useAlertStore.getState().alerts[0].enabled).toBe(true);
  });

  it("addTriggered adds with a timestamp and caps at 50", () => {
    for (let i = 0; i < 55; i++) {
      useAlertStore.getState().addTriggered(mockAlert({ id: i }));
    }
    expect(useAlertStore.getState().triggered).toHaveLength(50);
  });

  it("clearTriggered empties triggered list", () => {
    useAlertStore.getState().addTriggered(mockAlert());
    useAlertStore.getState().clearTriggered();
    expect(useAlertStore.getState().triggered).toEqual([]);
  });
});
