// Re-export from local-db for backward compatibility.
export { localDb as db } from "@/lib/local-db";
export type {
  OfflineQueueItem,
  LocalTransaction as OfflineTransaction,
} from "@/lib/local-db";
