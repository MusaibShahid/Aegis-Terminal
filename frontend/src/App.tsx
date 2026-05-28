import { useEffect } from "react";

import { useDependencyStore } from "./stores/useDependencyStore";
import { useDepthStream } from "./hooks/useDepthStream";
import { useWebSocket } from "./hooks/useWebSocket";
import { Workspace } from "./layouts/Workspace";

export default function App() {
  useWebSocket("market");
  useDepthStream(["BTCUSDT", "ETHUSDT"]);

  const fetchDeps = useDependencyStore((s) => s.fetch);

  useEffect(() => {
    fetchDeps();
    const interval = setInterval(fetchDeps, 30000);
    return () => clearInterval(interval);
  }, [fetchDeps]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% -20%, rgba(77,124,255,0.06) 0%, transparent 100%),
          radial-gradient(ellipse 60% 50% at 80% 100%, rgba(155,89,255,0.04) 0%, transparent 100%),
          radial-gradient(ellipse 50% 40% at 20% 100%, rgba(0,217,124,0.03) 0%, transparent 100%),
          #0a0b14
        `,
      }}
    >
      <Workspace />
    </div>
  );
}
