import { useEffect, useState } from "react";
import { useAlertStore } from "../stores/useAlertStore";
import type { AlertConfig } from "../types";

export function AlertPanel() {
  const alerts = useAlertStore((s) => s.alerts);
  const triggered = useAlertStore((s) => s.triggered);
  const setAlerts = useAlertStore((s) => s.setAlerts);
  const toggleAlert = useAlertStore((s) => s.toggleAlert);
  const removeAlert = useAlertStore((s) => s.removeAlert);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", symbol: "BTCUSDT", type: "price" as const, field: "close", operator: ">", value: 0 });

  useEffect(() => {
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAlerts(data);
      })
      .catch(() => {});
  }, [setAlerts]);

  const handleCreate = async () => {
    try {
      const resp = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name || `${form.type}_alert`,
          type: form.type,
          condition: { field: form.field, operator: form.operator, value: form.value },
          symbol: form.symbol,
        }),
      });
      const data = await resp.json();
      if (data.id) {
        useAlertStore.getState().addAlert({ ...form, id: data.id, condition: { field: form.field, operator: form.operator, value: form.value }, enabled: true });
        setShowForm(false);
      }
    } catch {}
  };

  const handleToggle = async (id: number) => {
    try {
      await fetch(`/api/alerts/${id}/toggle`, { method: "POST" });
      toggleAlert(id);
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      removeAlert(id);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1 border-b border-surface-border shrink-0">
        <span className="text-gray-400">Alerts ({alerts.length})</span>
        <button className="text-accent-blue hover:text-white" onClick={() => setShowForm(!showForm)}>+ New</button>
      </div>

      {showForm && (
        <div className="p-2 border-b border-surface-border space-y-1 bg-surface-alt">
          <input className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
          <select className="w-full bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
            <option value="price">Price</option><option value="volume">Volume</option><option value="delta">Delta</option>
          </select>
          <div className="flex gap-1">
            <select className="flex-1 bg-surface border border-surface-border rounded px-1 py-1 text-xs text-white" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })}>
              <option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option>
            </select>
            <input className="flex-1 bg-surface border border-surface-border rounded px-2 py-1 text-xs text-white" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: parseFloat(e.target.value) || 0 })} />
          </div>
          <button className="w-full bg-accent-blue text-white rounded py-1 text-xs hover:bg-accent-blue/80" onClick={handleCreate}>Create Alert</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 && <div className="text-gray-500 p-2 text-center">No alerts</div>}
        {alerts.map((a) => (
          <div key={a.id} className={`flex items-center justify-between px-2 py-1.5 border-b border-surface-border/30 ${a.enabled ? "" : "opacity-40"}`}>
            <div className="flex-1 min-w-0">
              <div className="text-gray-300 truncate">{a.name}</div>
              <div className="text-gray-500">{a.symbol} {a.condition?.operator} {a.condition?.value}</div>
            </div>
            <div className="flex gap-1">
              <button className={`w-5 h-5 flex items-center justify-center rounded text-xs ${a.enabled ? "text-accent-green" : "text-gray-600"}`} onClick={() => handleToggle(a.id!)}>
                {a.enabled ? "ON" : "OFF"}
              </button>
              <button className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-accent-red" onClick={() => handleDelete(a.id!)}>x</button>
            </div>
          </div>
        ))}
      </div>

      {triggered.length > 0 && (
        <div className="border-t border-surface-border">
          <div className="px-2 py-1 text-gray-400 text-[10px] uppercase">Triggered</div>
          {triggered.slice(-5).map((t, i) => (
            <div key={i} className="px-2 py-1 text-accent-yellow text-[10px]">
              {t.alert.name} @ {new Date(t.time).toLocaleTimeString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
