import { useEffect, useState } from "react";
import { Wifi, WifiOff, Clock, Activity } from "lucide-react";
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

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="h-7 bg-surface-alt border-t border-surface-border flex items-center px-3 text-[11px] text-text-secondary gap-4 shrink-0 select-none">
      {/* Connection */}
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
          isConnected ? "bg-accent-green shadow-glow-green" :
          isConnecting ? "bg-accent-yellow animate-pulse" :
          "bg-accent-red shadow-glow-red"
        }`} />
        <span className="text-[10px] text-text-secondary hidden sm:inline">
          {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Disconnected"}
        </span>
        {isConnected ? <Wifi size={10} className="text-accent-green opacity-60" /> : <WifiOff size={10} className="text-accent-red opacity-60" />}
      </div>

      {/* Latency */}
      {latency !== null && (
        <div className="flex items-center gap-1 text-[10px] font-mono text-text-tertiary hidden sm:flex">
          <Activity size={10} />
          <span>{latency}<span className="text-text-muted">ms</span></span>
        </div>
      )}

      {/* Clock */}
      <div className="flex items-center gap-1 text-[10px] font-mono text-text-tertiary">
        <Clock size={10} />
        <span className="tabular-nums">{clock}</span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* WS indicator */}
      <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
        <span className={`w-1 h-1 rounded-full ${isConnected ? "bg-accent-green animate-pulse-slow" : "bg-text-muted"}`} />
        <span className="hidden sm:inline">WS</span>
      </div>

      {/* Mobile latency */}
      {latency !== null && responsive.isMobile && (
        <span className="text-[9px] font-mono text-text-muted">{latency}ms</span>
      )}

      {/* Version */}
      <span className="text-[10px] text-text-muted font-mono">v0.2.0</span>
    </div>
  );
}
