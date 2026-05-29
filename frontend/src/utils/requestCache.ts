/**
 * requestCache — shared HTTP request cache for the frontend.
 *
 * Features:
 * - **In-flight deduplication**: concurrent requests for the same URL share one promise.
 * - **Stale-while-revalidate**: cached data is returned immediately while a
 *   background refresh fetches fresh data.
 * - **localStorage persistence**: key data (e.g. candle history) survives page reloads.
 * - **TTL per entry**: entries expire after a configurable period.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry<T = unknown> {
  data: T;
  cachedAt: number; // Date.now() when cached
  ttl: number; // milliseconds
}

export interface CacheOptions {
  /** Time-to-live in milliseconds (default 30000). */
  ttl?: number;
  /** If true, persist to localStorage under the given key prefix. */
  persistKey?: string;
  /** Max age in ms for persisted data before it's considered stale (default 5 min). */
  maxPersistAge?: number;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, CacheEntry>();
const inFlightMap = new Map<string, Promise<unknown>>();

/** Default TTL per store section — exported so tests can tweak */
export const DEFAULT_TTL: Record<string, number> = {
  history: 15_000, // 15s — candles update frequently
  analytics: 10_000, // 10s — footprint/delta/vpvr
  default: 30_000, // 30s fallback
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function now() {
  return Date.now();
}

function storageKey(persistKey: string, url: string) {
  return `rc:${persistKey}:${url}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch a URL with caching, deduplication, and optional localStorage persistence.
 *
 * ```ts
 * const data = await cachedFetch("/api/history?symbol=BTCUSDT", { ttl: 15000 });
 * ```
 */
export async function cachedFetch<T = unknown>(
  url: string,
  options: CacheOptions = {},
): Promise<T> {
  const { ttl = DEFAULT_TTL.default, persistKey, maxPersistAge = 300_000 } = options;

  // 1. Check in-memory cache
  const memEntry = memoryCache.get(url) as CacheEntry<T> | undefined;
  const memFresh = memEntry && now() - memEntry.cachedAt < memEntry.ttl;
  const memStale = memEntry && !memFresh;

  // 2. Check localStorage (if persistKey given)
  let persisted: T | undefined;
  let persistStale = true;
  if (persistKey && !memEntry) {
    try {
      const raw = localStorage.getItem(storageKey(persistKey, url));
      if (raw) {
        const entry: CacheEntry<T> = JSON.parse(raw);
        if (entry && typeof entry.cachedAt === "number") {
          persisted = entry.data;
          persistStale = now() - entry.cachedAt > maxPersistAge;
        }
      }
    } catch {
      // Corrupted entry — ignore
    }
  }

  // 3. If we have fresh in-memory data, return immediately (no background refresh)
  if (memFresh) {
    return memEntry!.data;
  }

  // 4. Stale data available → return it and fire a background refresh
  const staleData = memStale ? memEntry!.data : persisted;
  if (staleData !== undefined) {
    // Fire-and-forget refresh
    _fetchAndCache(url, ttl, persistKey).catch(() => {});
    return staleData;
  }

  // 5. No cache hit → fetch (deduplicated)
  return _fetchAndCache<T>(url, ttl, persistKey);
}

/**
 * Invalidate a cached URL (both memory and localStorage).
 */
export function invalidateCache(url: string, persistKey?: string): void {
  memoryCache.delete(url);
  inFlightMap.delete(url);
  if (persistKey) {
    try {
      localStorage.removeItem(storageKey(persistKey, url));
    } catch {
      // ignore
    }
  }
}

/**
 * Clear all cached data (memory + optional localStorage).
 */
export function clearAllCache(persistPrefix?: string): void {
  memoryCache.clear();
  inFlightMap.clear();
  if (persistPrefix) {
    try {
      const prefix = `rc:${persistPrefix}:`;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix)) keysToRemove.push(key);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function _fetchAndCache<T>(url: string, ttl: number, persistKey?: string): Promise<T> {
  // Deduplicate in-flight requests
  const inFlight = inFlightMap.get(url) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const promise = _doFetch<T>(url);
  inFlightMap.set(url, promise);

  try {
    const data = await promise;

    // Store in memory
    memoryCache.set(url, { data, cachedAt: now(), ttl });

    // Optionally persist to localStorage
    if (persistKey) {
      try {
        localStorage.setItem(
          storageKey(persistKey, url),
          JSON.stringify({ data, cachedAt: now(), ttl }),
        );
      } catch {
        // localStorage full or blocked — silently ignore
      }
    }

    return data;
  } finally {
    inFlightMap.delete(url);
  }
}

async function _doFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}
