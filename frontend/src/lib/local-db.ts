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

  constructor() {
    super("FinancialRadarDB");
    this.version(2).stores({
      transactions: "++id, remoteId, type, date, synced",
      accounts:     "++id, remoteId, type, synced",
      goals:        "++id, remoteId, synced",
      debts:        "++id, remoteId, synced",
      budgets:      "++id, remoteId, month, synced",
      categories:   "++id, remoteId, type, synced",
      xp_logs:      "++id, synced",
      streak_logs:  "++id, date, synced",
      offline_queue: "++id, endpoint, method, createdAt",
    });
  }
}

export const localDb = new FinancialRadarDatabase();
