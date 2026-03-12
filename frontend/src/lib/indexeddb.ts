import Dexie, { type Table } from "dexie";

export interface OfflineTransaction {
  id?: number;
  amount: number;
  category: string;
  merchant?: string;
  date: string;
  synced: boolean;
}

export interface OfflineQueueItem {
  id?: number;
  action: string;
  payload: unknown;
  createdAt: number;
}

class FinancialRadarDB extends Dexie {
  transactions!: Table<OfflineTransaction, number>;
  offline_queue!: Table<OfflineQueueItem, number>;

  constructor() {
    super("FinancialRadarDB");
    this.version(1).stores({
      transactions: "++id, amount, category, merchant, date, synced",
      offline_queue: "++id, action, createdAt",
    });
  }
}

export const db = new FinancialRadarDB();
