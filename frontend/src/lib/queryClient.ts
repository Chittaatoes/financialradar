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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
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

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401 }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetch(resolveUrl(queryKey.join("/") as string), {
        credentials: "include",
        cache: "no-store",
      });

      if (on401 === "returnNull" && res.status === 401) {
        return null as T;
      }

      if (!res.ok) {
        return null as T;
      }

      return await res.json();
    } catch {
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
    buster: "financialradar-v1", // change when schema changes
  });
}
