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

const API_BASE = import.meta.env.VITE_API_URL || "";

function resolveUrl(url: string): string {
  if (url.startsWith("http")) return url;
  if (!API_BASE) return url;
  return `${API_BASE}${url}`;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Endpoints excluded from offline queuing (auth / admin flows)
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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  // Offline interception: queue mutations and return a fake OK response
  if (!navigator.onLine && shouldQueueOffline(method, url)) {
    await saveOfflineAction(method.toUpperCase(), url, data ?? null);
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
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

// API endpoints worth caching in IndexedDB for offline reads
const CACHEABLE_ENDPOINTS = [
  "/api/dashboard",
  "/api/transactions",
  "/api/accounts",
  "/api/goals",
  "/api/budget",
  "/api/budget-plan",
  "/api/budget/summary",
  "/api/profile",
  "/api/daily-focus",
  "/api/badges",
  "/api/debt-health",
  "/api/net-worth",
  "/api/spending-insight",
  "/api/custom-categories",
  "/api/macro-radar/events",
  "/api/macro-radar/indicators",
];

function isCacheable(url: string): boolean {
  return CACHEABLE_ENDPOINTS.some((ep) => url.startsWith(ep));
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;

    // If offline, serve from IndexedDB cache first
    if (!navigator.onLine && isCacheable(url)) {
      const cached = await cacheGet<T>(url);
      if (cached !== undefined) return cached;
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
        // Try cached data as fallback
        if (isCacheable(url)) {
          const cached = await cacheGet<T>(url);
          if (cached !== undefined) return cached;
        }
        return null as T;
      }

      const data = await res.json();

      // Cache successful responses for offline use
      if (isCacheable(url)) {
        cacheSet(url, data).catch(() => {});
      }

      return data;
    } catch {
      // Network error: try IndexedDB cache
      if (isCacheable(url)) {
        const cached = await cacheGet<T>(url);
        if (cached !== undefined) return cached;
      }
      return null as T;
    }
  };

// Detect online / offline
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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "returnNull" }),

      // React Query behavior
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,

      // Offline friendly
      networkMode: "offlineFirst",

      // Cache strategy
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes

      retry: false,
    },
    mutations: {
      retry: false,
      networkMode: "offlineFirst",
    },
  },
});

// Persist cache to localStorage (offline support)
if (typeof window !== "undefined") {
  const persister = createSyncStoragePersister({
    storage: window.localStorage,
  });

  persistQueryClient({
    queryClient,
    persister,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    buster: "financialradar-v2", // change when schema changes
  });
}
