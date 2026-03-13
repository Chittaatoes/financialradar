// import { QueryClient, QueryFunction, onlineManager } from "@tanstack/react-query";
// import { persistQueryClient } from "@tanstack/react-query-persist-client";
// import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

// function resolveUrl(url: string): string {
//   return url.startsWith("/") ? `${API_BASE}${url}` : url;
// }

// async function throwIfResNotOk(res: Response) {
//   if (!res.ok) {
//     const text = (await res.text()) || res.statusText;
//     throw new Error(`${res.status}: ${text}`);
//   }
// }

// export async function apiRequest(
//   method: string,
//   url: string,
//   data?: unknown | undefined,
// ): Promise<Response> {
//   const res = await fetch(resolveUrl(url), {
//     method,
//     headers: data ? { "Content-Type": "application/json" } : {},
//     body: data ? JSON.stringify(data) : undefined,
//     credentials: "include",
//   });

//   await throwIfResNotOk(res);
//   return res;
// }

// type UnauthorizedBehavior = "returnNull" | "throw";
// export const getQueryFn: <T>(options: {
//   on401: UnauthorizedBehavior;
// }) => QueryFunction<T> =
//   ({ on401: unauthorizedBehavior }) =>
//   async ({ queryKey }) => {
//     const res = await fetch(resolveUrl(queryKey.join("/") as string), {
//       credentials: "include",
//     });

//     if (unauthorizedBehavior === "returnNull" && res.status === 401) {
//       return null;
//     }

//     await throwIfResNotOk(res);
//     return await res.json();
//   };

// onlineManager.setEventListener((setOnline) => {
//   const onlineHandler = () => setOnline(true);
//   const offlineHandler = () => setOnline(false);
//   window.addEventListener("online", onlineHandler);
//   window.addEventListener("offline", offlineHandler);
//   return () => {
//     window.removeEventListener("online", onlineHandler);
//     window.removeEventListener("offline", offlineHandler);
//   };
// });

// export const queryClient = new QueryClient({
//   defaultOptions: {
//     queries: {
//   queryFn: getQueryFn({ on401: "throw" }),
//     refetchInterval: false,
//     refetchOnWindowFocus: false,
//     refetchOnReconnect: false,
//     staleTime: 1000 * 60 * 5,
//     gcTime: 1000 * 60 * 30,
//     retry: false,
//   },
//     mutations: {
//       retry: false,
//     },
//   },
// });

// if (typeof window !== "undefined") {
//   const persister = createSyncStoragePersister({
//     storage: window.localStorage,
//   });

//   persistQueryClient({
//     queryClient,
//     persister,
//     maxAge: 1000 * 60 * 60 * 24,
//   });
// }

import {
  QueryClient,
  QueryFunction,
  onlineManager,
} from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { saveOfflineAction } from "@/lib/offline-sync";
import { cacheSet, cacheGet } from "@/lib/local-db";
import { getPendingLocalTransactions } from "@/lib/offline-transactions";

const API_BASE = import.meta.env.VITE_API_URL || "";

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Endpoints excluded from offline mutation queuing (auth / admin flows)
const OFFLINE_EXCLUDE = ["/api/auth/", "/api/guest-login", "/api/admin/"];

function shouldQueueOffline(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(m)) return false;
  const path = url.startsWith("/") ? url : `/${url}`;
  return !OFFLINE_EXCLUDE.some((prefix) => path.startsWith(prefix));
}

function makeFakeResponse(data: unknown = { offline: true }): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Endpoints cached in IndexedDB for offline reads ─────────────────────────
// IMPORTANT: /api/auth/user is included so bootstrap succeeds while offline.
const CACHEABLE_ENDPOINTS = [
  "/api/auth/user",
  "/api/profile",
  "/api/dashboard",
  "/api/transactions",
  "/api/accounts",
  "/api/goals",
  "/api/budget",
  "/api/budget-plan",
  "/api/budget/summary",
  "/api/daily-focus",
  "/api/badges",
  "/api/debt-health",
  "/api/net-worth",
  "/api/spending-insight",
  "/api/custom-categories",
  "/api/finance-score",
  "/api/smart-save",
];

function isCacheable(url: string): boolean {
  return CACHEABLE_ENDPOINTS.some((ep) => url.startsWith(ep));
}

// ─── apiRequest ───────────────────────────────────────────────────────────────
// Used for mutations (POST/PATCH/PUT/DELETE). Handles:
// - Offline GET guard: serves from IndexedDB cache
// - Offline mutation guard: queues to IndexedDB offline queue
// - Online: executes fetch and caches cacheable GET-like responses
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  const m = method.toUpperCase();

  // Offline: serve cached data for read-like calls
  if (!navigator.onLine && m === "GET") {
    if (isCacheable(url)) {
      const cached = await cacheGet(url);
      if (cached != null) {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error("Offline and no cache available");
  }

  // Offline: queue mutations and return a fake OK response
  if (!navigator.onLine && shouldQueueOffline(method, url)) {
    await saveOfflineAction(m, url, data ?? null);
    return makeFakeResponse();
  }

  const res = await fetch(resolveUrl(url), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    cache: "no-store",
  });

  await throwIfResNotOk(res);

  // Cache successful responses for offline use
  if (res.ok && isCacheable(url)) {
    try {
      const cloned = res.clone();
      cloned.json().then((d) => cacheSet(url, d)).catch(() => {});
    } catch {}
  }

  return res;
}

// ─── getQueryFn ───────────────────────────────────────────────────────────────
// Used by all useQuery calls. Handles offline-first reads + cache writing.
type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;

    // Offline: serve from IndexedDB cache immediately
    if (!navigator.onLine && isCacheable(url)) {
      const cached = await cacheGet<T>(url);
      if (cached !== undefined && cached !== null) return cached;
      // No cache available — fall through to fetch attempt (will fail, caught below)
    }

    try {
      const res = await fetch(resolveUrl(url), {
        credentials: "include",
        cache: "no-store",
      });

      if (on401 === "returnNull" && res.status === 401) {
        return null as T;
      }

      if (!res.ok) {
        // Network error or non-200 — try cached data as graceful fallback
        if (isCacheable(url)) {
          const cached = await cacheGet<T>(url);
          if (cached !== undefined && cached !== null) return cached;
        }
        return null as T;
      }

      const responseData = await res.json();

      // Cache every successful response for offline use
      if (isCacheable(url)) {
        cacheSet(url, responseData).catch(() => {});
      }

      // For /api/transactions: prepend any pending (unsynced) local transactions
      // so they remain visible during the race between refetchOnReconnect and syncOfflineQueue.
      // After sync, clearPendingLocalTransactions() removes these before _invalidate() fires,
      // so they won't appear here when the server already has the real records.
      if (url === "/api/transactions" && Array.isArray(responseData)) {
        try {
          const pending = await getPendingLocalTransactions();
          if (pending.length > 0) {
            return [...pending, ...responseData] as T;
          }
        } catch {}
      }

      return responseData;
    } catch {
      // Network failure — try IndexedDB cache as last resort
      if (isCacheable(url)) {
        const cached = await cacheGet<T>(url);
        if (cached !== undefined && cached !== null) return cached;
      }
      return null as T;
    }
  };

// ─── Online/Offline manager ───────────────────────────────────────────────────
onlineManager.setEventListener((setOnline) => {
  const onlineHandler = () => setOnline(true);
  const offlineHandler = () => setOnline(false);

  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);

  return () => {
    window.removeEventListener("online", onlineHandler);
    window.removeEventListener("offline", offlineHandler);
  };
});

// ─── QueryClient ──────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),

      // Cache behavior
      staleTime: 1000 * 60 * 5,   // 5 minutes — don't refetch if data is fresh
      gcTime: 1000 * 60 * 30,     // 30 minutes — keep in memory

      // Refetch behavior
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,   // ← CRITICAL: refetch when network returns

      // Offline: allow queries to run even without network (serves cache)
      networkMode: "offlineFirst",

      retry: false,               // Don't retry failed requests automatically
    },
    mutations: {
      retry: false,
      networkMode: "offlineFirst",
    },
  },
});

// ─── Persist cache to localStorage ───────────────────────────────────────────
// Restores React Query cache across page refreshes.
if (typeof window !== "undefined") {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    buster: "financialradar-v2",  // bump this when cache schema changes
  });
}
