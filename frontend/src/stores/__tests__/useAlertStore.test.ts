import { describe, expect, it, beforeEach } from "vitest";

import { useAlertStore } from "../useAlertStore";
import type { AlertConfig } from "../../types";

const mockAlert = (overrides?: Partial<AlertConfig>): AlertConfig => ({
  id: 1,
  name: "Price Alert",
  type: "price",
  condition: { operator: ">", value: 50000 },
  symbol: "BTCUSDT",
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
    useAlertStore.getState().addAlert(mockAlert({ id: 1 }));
    useAlertStore.getState().addAlert(mockAlert({ id: 2 }));
    expect(useAlertStore.getState().alerts).toHaveLength(2);
  });

  it("removeAlert removes by id", () => {
    useAlertStore.getState().addAlert(mockAlert({ id: 1 }));
    useAlertStore.getState().addAlert(mockAlert({ id: 2 }));
    useAlertStore.getState().removeAlert(1);
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(useAlertStore.getState().alerts[0].id).toBe(2);
  });

  it("toggleAlert flips enabled flag", () => {
    useAlertStore.getState().addAlert(mockAlert({ id: 1, enabled: true }));
    useAlertStore.getState().toggleAlert(1);
    expect(useAlertStore.getState().alerts[0].enabled).toBe(false);
    useAlertStore.getState().toggleAlert(1);
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
