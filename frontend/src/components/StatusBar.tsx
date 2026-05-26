import { useConnectionStore } from "../stores/useConnectionStore";

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const latency = useConnectionStore((s) => s.latency);

  const statusColor =
    status === "connected"
      ? "bg-accent-green"
      : status === "connecting"
        ? "bg-accent-yellow"
        : "bg-accent-red";

  return (
    <div className="h-7 bg-surface-alt border-t border-surface-border flex items-center px-3 text-xs text-gray-400 gap-4 shrink-0">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${statusColor}`} />
        <span>{status}</span>
      </div>
      {latency !== null && <span>{latency}ms</span>}
      <span className="ml-auto">Aegis Terminal v0.1.0</span>
    </div>
  );
}
