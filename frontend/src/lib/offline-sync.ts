import { localDb } from "@/lib/local-db";
import { clearPendingLocalTransactions } from "@/lib/offline-transactions";
import { toast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_URL as string) ?? "";

function resolveUrl(url: string): string {
  return url.startsWith("/") ? `${API_BASE}${url}` : url;
}

// ─── Query-cache invalidation hook (avoids circular dep with queryClient.ts) ──
type Invalidator = () => void;
let _invalidate: Invalidator | null = null;

/**
 * Call this once at startup (e.g. main.tsx) to wire in React Query invalidation.
 * Keeps offline-sync.ts free of a direct queryClient import.
 */
export function setQueryInvalidator(fn: Invalidator): void {
  _invalidate = fn;
}

// ─── Save an offline action to the queue ─────────────────────────────────────

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

// Legacy alias used by indexeddb.ts consumers
export { saveOfflineAction as enqueueOfflineAction };

// ─── Sync queue to server ─────────────────────────────────────────────────────

export async function syncOfflineQueue(): Promise<void> {
  if (!navigator.onLine) return;

  const items = await localDb.offline_queue.orderBy("createdAt").toArray();
  if (items.length === 0) return;

  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const isDelete = item.method === "DELETE";
      const res = await fetch(resolveUrl(item.endpoint), {
        method: item.method,
        headers: isDelete ? {} : { "Content-Type": "application/json" },
        body: isDelete || !item.payload ? undefined : JSON.stringify(item.payload),
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

  if (synced > 0) {
    // Clear local pending transaction placeholders — server now has the real records.
    // The _invalidate() call below will refetch /api/transactions with real IDs.
    await clearPendingLocalTransactions();

    // Refresh all queries so UI reflects server state
    _invalidate?.();

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
 * Returns how many actions are pending in the offline queue.
 */
export async function getOfflineQueueCount(): Promise<number> {
  return localDb.offline_queue.count();
}
