import { useEffect, useState } from "react";
import { useConnectionStore } from "../stores/useConnectionStore";
import { useResponsive } from "../hooks/useResponsive";

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const latency = useConnectionStore((s) => s.latency);
  const [clock, setClock] = useState("");
  const responsive = useResponsive();

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toLocaleTimeString("en-US", { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const statusConfig = {
    connected: { color: "bg-accent-green", glow: "shadow-glow-green", label: "Connected" },
    connecting: { color: "bg-accent-yellow", glow: "shadow-[0_0_6px_rgba(255,197,61,0.5)]", label: "Connecting" },
    disconnected: { color: "bg-accent-red", glow: "shadow-[0_0_6px_rgba(255,71,87,0.5)]", label: "Disconnected" },
  } as const;

  const cfg = statusConfig[status] || statusConfig.disconnected;

  return (
    <div className="h-6 lg:h-7 bg-surface-alt/60 backdrop-blur-sm border-t border-surface-border flex items-center px-1.5 lg:px-3 text-[10px] lg:text-xs text-gray-500 gap-1.5 lg:gap-3 shrink-0 select-none">
      {/* Connection status */}
      <div className="flex items-center gap-1 lg:gap-1.5 group">
        <span className={`w-1.5 lg:w-2 h-1.5 lg:h-2 rounded-full ${cfg.color} ${cfg.glow} transition-all duration-300`} />
        <span className="text-[9px] lg:text-[10px] text-gray-400 group-hover:text-white transition-colors hidden sm:inline">{cfg.label}</span>
      </div>

      {/* Latency */}
      {latency !== null && (
        <span className="text-[9px] lg:text-[10px] font-mono text-gray-500 hidden sm:inline">
          <span className="text-gray-600">⏱</span> {latency}<span className="text-gray-600">ms</span>
        </span>
      )}

      {/* Clock */}
      <span className="text-[9px] lg:text-[10px] font-mono text-gray-600">
        {clock}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Feature indicators */}
      <div className="flex items-center gap-1.5 lg:gap-2 text-[8px] lg:text-[9px] text-gray-600">
        <span className={`inline-block w-1 lg:w-1.5 h-1 lg:h-1.5 rounded-full ${status === "connected" ? "bg-accent-green animate-pulse-slow" : "bg-gray-700"}`} />
        <span className="hidden sm:inline">WS</span>
      </div>

      {/* Latency badge — always visible on small screens */}
      {latency !== null && responsive.isMobile && (
        <span className="text-[9px] font-mono text-gray-600">{latency}ms</span>
      )}

      {/* Version */}
      <span className="text-[9px] lg:text-[10px] text-gray-600 font-mono">v0.2.0</span>
    </div>
  );
}
