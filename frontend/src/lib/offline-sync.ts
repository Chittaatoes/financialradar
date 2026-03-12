import { localDb } from "@/lib/local-db";
import { toast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

// Which method string maps to a real HTTP method for queued items
const METHOD_MAP: Record<string, string> = {
  POST: "POST",
  PATCH: "PATCH",
  PUT: "PUT",
  DELETE: "DELETE",
};

/**
 * Save a mutation to the offline queue so it can be replayed when online.
 */
export async function saveOfflineAction(
  method: string,
  endpoint: string,
  payload: unknown,
): Promise<void> {
  await localDb.offline_queue.add({
    method: method.toUpperCase(),
    endpoint,
    payload,
    createdAt: Date.now(),
  });
}

/**
 * Replay all queued offline actions against the server.
 * Called automatically when the browser goes back online.
 */
export async function syncOfflineQueue(): Promise<void> {
  if (!navigator.onLine) return;

  const items = await localDb.offline_queue.orderBy("createdAt").toArray();
  if (items.length === 0) return;

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const httpMethod = METHOD_MAP[item.method] ?? "POST";
      const res = await fetch(resolveUrl(item.endpoint), {
        method: httpMethod,
        headers:
          httpMethod !== "DELETE"
            ? { "Content-Type": "application/json" }
            : {},
        body:
          httpMethod !== "DELETE" && item.payload
            ? JSON.stringify(item.payload)
            : undefined,
        credentials: "include",
      });

      if (res.ok) {
        if (item.id !== undefined) {
          await localDb.offline_queue.delete(item.id);
        }
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  // Refresh all data after sync so the UI reflects server state
  if (synced > 0) {
    const { queryClient } = await import("@/lib/queryClient");
    queryClient.invalidateQueries();
    toast.success(
      failed > 0
        ? `${synced} tindakan offline disinkronkan. ${failed} gagal — akan dicoba lagi.`
        : `${synced} tindakan offline berhasil disinkronkan.`,
    );
  } else if (failed > 0) {
    toast.warning(`${failed} tindakan offline gagal disinkronkan. Akan dicoba lagi.`);
  }
}

/**
 * Returns the number of items currently in the offline queue.
 */
export async function getOfflineQueueCount(): Promise<number> {
  return localDb.offline_queue.count();
}

// Legacy export for network-status.ts compatibility
export { saveOfflineAction as enqueueOfflineAction };
