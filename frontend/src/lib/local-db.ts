import Dexie, { type Table } from "dexie";

// ─── Table shape types ────────────────────────────────────────────────────────

export interface LocalTransaction {
  id?: number;
  remoteId?: number;
  type: string;
  amount: number;
  accountId?: number;
  category: string;
  note?: string;
  date: string;
  synced: boolean;
}

export interface LocalAccount {
  id?: number;
  remoteId?: number;
  name: string;
  type: string;
  balance: number;
  synced: boolean;
}

export interface LocalGoal {
  id?: number;
  remoteId?: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  synced: boolean;
}

export interface LocalDebt {
  id?: number;
  remoteId?: number;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  synced: boolean;
}

export interface LocalBudget {
  id?: number;
  remoteId?: number;
  category: string;
  allocated: number;
  month: string;
  synced: boolean;
}

export interface LocalCategory {
  id?: number;
  remoteId?: number;
  name: string;
  emoji?: string;
  type: string;
  synced: boolean;
}

export interface XpLog {
  id?: number;
  xp: number;
  reason: string;
  createdAt: number;
  synced: boolean;
}

export interface StreakLog {
  id?: number;
  date: string;
  synced: boolean;
}

export interface OfflineQueueItem {
  id?: number;
  method: string;
  endpoint: string;
  payload: unknown;
  createdAt: number;
}

export interface CacheStoreItem {
  key: string;
  value: unknown;
  updatedAt: number;
}

// Alias used by queryClient.ts (matches the spec's CacheItem name)
export type CacheItem = CacheStoreItem;

// ─── Database class ───────────────────────────────────────────────────────────

class FinancialRadarDatabase extends Dexie {
  transactions!: Table<LocalTransaction, number>;
  accounts!: Table<LocalAccount, number>;
  goals!: Table<LocalGoal, number>;
  debts!: Table<LocalDebt, number>;
  budgets!: Table<LocalBudget, number>;
  categories!: Table<LocalCategory, number>;
  xp_logs!: Table<XpLog, number>;
  streak_logs!: Table<StreakLog, number>;
  offline_queue!: Table<OfflineQueueItem, number>;
  cache_store!: Table<CacheStoreItem, string>;

  constructor() {
    super("FinancialRadarDB");
    this.version(3).stores({
      transactions:  "++id, remoteId, type, date, synced",
      accounts:      "++id, remoteId, type, synced",
      goals:         "++id, remoteId, synced",
      debts:         "++id, remoteId, synced",
      budgets:       "++id, remoteId, month, synced",
      categories:    "++id, remoteId, type, synced",
      xp_logs:       "++id, synced",
      streak_logs:   "++id, date, synced",
      offline_queue: "++id, endpoint, method, createdAt",
      cache_store:   "key, updatedAt",
    });
  }
}

export const localDb = new FinancialRadarDatabase();

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheSet(key: string, value: unknown): Promise<void> {
  await localDb.cache_store.put({ key, value, updatedAt: Date.now() });
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const item = await localDb.cache_store.get(key);
  return item?.value as T | undefined;
}
