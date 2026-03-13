import { localDb } from "@/lib/local-db";
import type { Transaction } from "@shared/schema";
import type { QueryClient } from "@tanstack/react-query";

export type PendingTransaction = Transaction & { _pending: true };

export interface OfflineTxPayload {
  type: string;
  amount: string | number;
  date: string;
  category?: string | null;
  note?: string | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
}

/**
 * Saves a transaction to IndexedDB (synced=false) and immediately
 * prepends it to the React Query "/api/transactions" cache as a pending entry.
 * Call this from mutation onSuccess when !navigator.onLine.
 */
export async function saveLocalTransaction(
  payload: OfflineTxPayload,
  qc: QueryClient,
): Promise<void> {
  const now = Date.now();

  const localId = await localDb.transactions.add({
    type: payload.type,
    amount: Number(payload.amount),
    date: payload.date,
    category: payload.category ?? "",
    note: payload.note ?? undefined,
    fromAccountId: payload.fromAccountId ?? undefined,
    toAccountId: payload.toAccountId ?? undefined,
    createdAt: now,
    synced: false,
  });

  const pendingTx: PendingTransaction = {
    id: -(localId as number),
    userId: 0,
    type: payload.type as Transaction["type"],
    amount: String(payload.amount),
    category: payload.category ?? null,
    note: payload.note ?? null,
    fromAccountId: payload.fromAccountId ?? null,
    toAccountId: payload.toAccountId ?? null,
    date: payload.date,
    createdAt: new Date(now).toISOString(),
    _pending: true,
  };

  qc.setQueryData<Transaction[]>(["/api/transactions"], (old) => {
    if (!old) return [pendingTx];
    return [pendingTx, ...old.filter((tx) => tx.id !== pendingTx.id)];
  });
}

/**
 * Returns all transactions saved locally that haven't been synced yet.
 * Used by getQueryFn to merge pending transactions into the server list.
 */
export async function getPendingLocalTransactions(): Promise<PendingTransaction[]> {
  const rows = await localDb.transactions.where("synced").equals(0).toArray();
  return rows.map((r) => ({
    id: -(r.id!),
    userId: 0,
    type: r.type as Transaction["type"],
    amount: String(r.amount),
    category: r.category ?? null,
    note: r.note ?? null,
    fromAccountId: r.fromAccountId ?? null,
    toAccountId: r.toAccountId ?? null,
    date: r.date,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    _pending: true,
  }));
}

/**
 * Clears all local pending (unsynced) transactions from IndexedDB.
 * Called after syncOfflineQueue completes so the server's real records
 * (with real IDs) replace the local placeholders.
 */
export async function clearPendingLocalTransactions(): Promise<void> {
  await localDb.transactions.where("synced").equals(0).delete();
}
