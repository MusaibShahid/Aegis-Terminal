import { useEffect, useRef } from "react";
import { useFootprintStore } from "../stores/useFootprintStore";

export function useFootprint(symbol: string) {
  const setFootprint = useFootprintStore((s) => s.setFootprint);
  const prevRef = useRef("");

  useEffect(() => {
    if (symbol === prevRef.current) return;
    prevRef.current = symbol;

    let cancelled = false;
    const fetchData = async () => {
      try {
        const [fp, vp, dl] = await Promise.all([
          fetch(`/api/footprint?symbol=${symbol}`).then((r) => r.json()),
          fetch(`/api/vpvr?symbol=${symbol}`).then((r) => r.json()),
          fetch(`/api/delta?symbol=${symbol}`).then((r) => r.json()),
        ]);
        if (!cancelled) {
          setFootprint(symbol, fp);
          useFootprintStore.getState().setVPVR(symbol, vp);
          useFootprintStore.getState().setDelta(symbol, dl);
        }
      } catch {
        // ignore
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, setFootprint]);
}
