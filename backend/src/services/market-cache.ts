// ─── Shared in-memory market cache ───────────────────────────────────────────
// Singleton so both the route handlers AND the health-endpoint warmup
// share the exact same cache object.

export const marketCache: Record<string, { data: unknown; ts: number }> = {};
export const CACHE_TTL = 5 * 60 * 1000;  // 5 minutes

export function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = marketCache[key];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data as T);
  return fn().then(data => {
    marketCache[key] = { data, ts: Date.now() };
    return data;
  });
}

// Warmup function — registered by registerRoutes(), called by health endpoint
let _warmup: (() => Promise<void>) | undefined;

export function registerWarmup(fn: () => Promise<void>): void {
  _warmup = fn;
}

/** Fire-and-forget cache warm.  Never throws — safe to call without await. */
export async function runWarmup(): Promise<void> {
  if (_warmup) await _warmup().catch(() => {});
}
