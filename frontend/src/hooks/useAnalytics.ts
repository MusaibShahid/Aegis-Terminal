import { useEffect, useRef } from "react";
import { useFootprintStore } from "../stores/useFootprintStore";
import { cachedFetch } from "../utils/requestCache";
import type { FootprintData, VPVRData, DeltaData } from "../types";

/**
 * Fetches footprint/delta/VPVR once on mount for instant display.
 * After the initial load, updates come from the WebSocket stream
 * (handled in useWebSocket.ts which calls setFootprint/setVPVR/setDelta
 * on "footprint" / "vpvr" / "delta" message types).
 *
 * Uses cachedFetch with 10s TTL (enough to deduplicate rapid symbol switches)
 * but no localStorage persistence — analytics are ephemeral tick snapshots.
 */
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
          cachedFetch<FootprintData>(`/api/footprint?symbol=${symbol}`, { ttl: 10_000 }),
          cachedFetch<VPVRData>(`/api/vpvr?symbol=${symbol}`, { ttl: 10_000 }),
          cachedFetch<DeltaData>(`/api/delta?symbol=${symbol}`, { ttl: 10_000 }),
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
    // No more 10s REST polling — updates come via WebSocket
    return () => {
      cancelled = true;
    };
  }, [symbol, setFootprint]);
}
