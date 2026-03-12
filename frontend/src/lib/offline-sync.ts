import { db } from "@/lib/indexeddb";
import { toast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

export async function enqueueOfflineAction(action: string, payload: unknown): Promise<void> {
  await db.offline_queue.add({
    action,
    payload,
    createdAt: Date.now(),
  });
}

export async function syncOfflineQueue(): Promise<void> {
  if (!navigator.onLine) return;

  const items = await db.offline_queue.toArray();
  if (items.length === 0) return;

  let syncedCount = 0;

  for (const item of items) {
    try {
      const res = await fetch(resolveUrl(item.action), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
        credentials: "include",
      });

      if (res.ok) {
        if (item.id !== undefined) {
          await db.offline_queue.delete(item.id);
        }
        syncedCount++;
      }
    } catch {
      // Leave in queue to retry later
    }
  }

  if (syncedCount > 0) {
    toast.success(`${syncedCount} transaksi offline berhasil disinkronkan.`);
  }
}

export async function withOfflineFallback<T>(
  url: string,
  data: unknown,
  optimisticResponse: T,
): Promise<T> {
  if (!navigator.onLine) {
    await enqueueOfflineAction(url, data);
    return optimisticResponse;
  }

  const res = await fetch(resolveUrl(url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`${res.status}: ${res.statusText}`);
  }

  return res.json();
}
