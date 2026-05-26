import { useDepthStream } from "./hooks/useDepthStream";
import { useWebSocket } from "./hooks/useWebSocket";
import { Workspace } from "./layouts/Workspace";

export default function App() {
  useWebSocket("market");
  useDepthStream(["BTCUSDT", "ETHUSDT"]);

  return (
    <div className="h-screen w-screen flex flex-col bg-surface text-sm">
      <Workspace />
    </div>
  );
}
