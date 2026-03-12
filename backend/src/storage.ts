/**
 * ===== STORAGE LAYER =====
 * Database access layer using Drizzle ORM.
 *
 * IStorage interface defines all CRUD operations.
 * DatabaseStorage implements IStorage using PostgreSQL via Drizzle.
 *
 * All routes in routes.ts call storage methods — never raw SQL.
 * This makes it easy to swap databases: just change db.ts connection
 * and ensure the new DB supports the same Drizzle schema.
 *
 * Key methods:
 * - updateAccountBalance(): Atomic balance add/subtract with SQL expression
 * - addXp(): Increments XP + auto-levels up based on LEVEL_THRESHOLDS
 * - getDailyFocusList(): Returns all focus missions for a given date
 */
import {
  type Account, type InsertAccount,
  type Transaction, type InsertTransaction,
  type Goal, type InsertGoal,
  type Liability, type InsertLiability,
  type UserProfile, type InsertUserProfile,
  type XpLog, type StreakLog,
  type CustomCategory, type InsertCustomCategory,
  type DailyFocus, type InsertDailyFocus,
  type BadgeRecord, type InsertBadge,
  type UserBadgeRecord, type InsertUserBadge,
  type BudgetAllocation, type InsertBudgetAllocation,
  type BudgetPlan, type InsertBudgetPlan,
  accounts, transactions, goals, liabilities, userProfiles, xpLogs, streakLogs,
  customCategories, dailyFocus, badges, userBadges, budgetAllocations, budgetPlans,
} from "../shared/schema";
import { users } from "../shared/models/auth";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";

// === STORAGE INTERFACE ===
// All CRUD operations used by routes.ts. Add new methods here when adding features.
export interface IStorage {
  getAccountsByUser(userId: string): Promise<Account[]>;
  getAccount(id: number, userId: string): Promise<Account | undefined>;
  createAccount(data: InsertAccount): Promise<Account>;
  updateAccount(id: number, userId: string, data: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: number, userId: string): Promise<void>;
  updateAccountBalance(id: number, amount: string, operation: "add" | "subtract"): Promise<void>;

  getTransactionsByUser(userId: string): Promise<Transaction[]>;
  getTransaction(id: number, userId: string): Promise<Transaction | undefined>;
  createTransaction(data: InsertTransaction): Promise<Transaction>;
  deleteTransaction(id: number, userId: string): Promise<void>;
  getTransactionsByDateRange(userId: string, startDate: string, endDate: string): Promise<Transaction[]>;
  getTodayTransactionCount(userId: string, date: string): Promise<number>;
  getAllTransactionsCount(): Promise<number>;

  getGoalsByUser(userId: string): Promise<Goal[]>;
  getGoal(id: number, userId: string): Promise<Goal | undefined>;
  createGoal(data: InsertGoal): Promise<Goal>;
  updateGoal(id: number, userId: string, data: { name?: string; targetAmount?: string; deadline?: string; accountId?: number | null }): Promise<Goal | undefined>;
  updateGoalAmount(id: number, amount: string): Promise<void>;
  deleteGoal(id: number, userId: string): Promise<void>;
  getLastActiveGoal(userId: string): Promise<Goal | undefined>;
  hasDepositToday(userId: string, date: string): Promise<boolean>;

  getLiabilitiesByUser(userId: string): Promise<Liability[]>;
  getLiability(id: number, userId: string): Promise<Liability | undefined>;
  createLiability(data: InsertLiability): Promise<Liability>;
  deleteLiability(id: number, userId: string): Promise<void>;
  payLiability(id: number, userId: string, amount: string): Promise<void>;

  getProfile(userId: string): Promise<UserProfile | undefined>;
  upsertProfile(data: InsertUserProfile): Promise<UserProfile>;
  updateProfile(userId: string, data: Partial<Record<string, any>>): Promise<void>;
  addXp(userId: string, amount: number, reason: string): Promise<void>;
  getXpLogsByUser(userId: string): Promise<XpLog[]>;
  updateStreak(userId: string, count: number, lastActive: string): Promise<void>;
  useRevive(userId: string): Promise<void>;
  resetRevives(userId: string): Promise<void>;

  logStreak(userId: string, action: string, date: string): Promise<void>;
  getStreakLogForDate(userId: string, date: string): Promise<StreakLog | undefined>;
  getStreakLogs(userId: string): Promise<StreakLog[]>;

  getAllUsersWithProfiles(): Promise<any[]>;
  setUserLevel(userId: string, level: number): Promise<void>;

  getCustomCategoriesByUser(userId: string): Promise<CustomCategory[]>;
  createCustomCategory(data: InsertCustomCategory): Promise<CustomCategory>;
  deleteCustomCategory(id: number, userId: string): Promise<void>;

  getDailyFocus(userId: string, date: string): Promise<DailyFocus | undefined>;
  getDailyFocusList(userId: string, date: string): Promise<DailyFocus[]>;
  createDailyFocus(data: InsertDailyFocus): Promise<DailyFocus>;
  completeDailyFocus(id: number, userId: string): Promise<void>;

  getAllBadges(): Promise<BadgeRecord[]>;
  getUserBadges(userId: string): Promise<(UserBadgeRecord & { badge: BadgeRecord })[]>;
  awardBadge(userId: string, badgeId: number): Promise<UserBadgeRecord>;
  hasUserBadge(userId: string, badgeId: number): Promise<boolean>;
  seedBadges(badgeList: InsertBadge[]): Promise<void>;

  getBudgetAllocationsByMonth(userId: string, month: string): Promise<BudgetAllocation[]>;
  upsertBudgetAllocation(data: InsertBudgetAllocation): Promise<BudgetAllocation>;
  deleteBudgetAllocation(id: number, userId: string): Promise<void>;

  getBudgetPlan(userId: string, month: string): Promise<BudgetPlan | undefined>;
  upsertBudgetPlan(data: InsertBudgetPlan): Promise<BudgetPlan>;
  deleteBudgetPlan(userId: string, month: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getAccountsByUser(userId: string): Promise<Account[]> {
    return db.select().from(accounts).where(eq(accounts.userId, userId)).orderBy(desc(accounts.createdAt));
  }

  async getAccount(id: number, userId: string): Promise<Account | undefined> {
    const [account] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
    return account;
  }

  async createAccount(data: InsertAccount): Promise<Account> {
    const [account] = await db.insert(accounts).values(data).returning();
    return account;
  }

  async updateAccount(id: number, userId: string, data: Partial<InsertAccount>): Promise<Account | undefined> {
    const [account] = await db.update(accounts).set(data).where(and(eq(accounts.id, id), eq(accounts.userId, userId))).returning();
    return account;
  }

  async deleteAccount(id: number, userId: string): Promise<void> {
    await db.update(transactions).set({ fromAccountId: null })
      .where(eq(transactions.fromAccountId, id));
    await db.update(transactions).set({ toAccountId: null })
      .where(eq(transactions.toAccountId, id));
    await db.update(goals).set({ accountId: null })
      .where(eq(goals.accountId, id));
    await db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.userId, userId)));
  }

  async updateAccountBalance(id: number, amount: string, operation: "add" | "subtract"): Promise<void> {
    if (operation === "add") {
      await db.update(accounts).set({
        balance: sql`${accounts.balance}::numeric + ${amount}::numeric`,
      }).where(eq(accounts.id, id));
    } else {
      await db.update(accounts).set({
        balance: sql`${accounts.balance}::numeric - ${amount}::numeric`,
      }).where(eq(accounts.id, id));
    }
  }

  async getTransactionsByUser(userId: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date), desc(transactions.createdAt));
  }

  async getAllTransactionsCount(): Promise<number> {
    const [result] = await db.select({ count: count() }).from(transactions);
    return result?.count ?? 0;
  }

  async getTransaction(id: number, userId: string): Promise<Transaction | undefined> {
    const [tx] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    return tx;
  }

  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    const [tx] = await db.insert(transactions).values(data).returning();
    return tx;
  }

  async deleteTransaction(id: number, userId: string): Promise<void> {
    await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  }

  async getTransactionsByDateRange(userId: string, startDate: string, endDate: string): Promise<Transaction[]> {
    return db.select().from(transactions).where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, startDate),
        lte(transactions.date, endDate)
      )
    ).orderBy(desc(transactions.date));
  }

  async getGoalsByUser(userId: string): Promise<Goal[]> {
    return db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.createdAt));
  }

  async getGoal(id: number, userId: string): Promise<Goal | undefined> {
    const [goal] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
    return goal;
  }

  async createGoal(data: InsertGoal): Promise<Goal> {
    const [goal] = await db.insert(goals).values(data).returning();
    return goal;
  }

  async getTodayTransactionCount(userId: string, date: string): Promise<number> {
    const result = await db.select().from(transactions).where(
      and(eq(transactions.userId, userId), eq(transactions.date, date))
    );
    return result.length;
  }

  async updateGoal(id: number, userId: string, data: { name?: string; targetAmount?: string; deadline?: string; accountId?: number | null }): Promise<Goal | undefined> {
    const setData: Record<string, any> = {};
    if (data.name !== undefined) setData.name = data.name;
    if (data.targetAmount !== undefined) setData.targetAmount = data.targetAmount;
    if (data.deadline !== undefined) setData.deadline = data.deadline;
    if (data.accountId !== undefined) setData.accountId = data.accountId;
    const [updated] = await db.update(goals).set(setData).where(and(eq(goals.id, id), eq(goals.userId, userId))).returning();
    return updated;
  }

  async updateGoalAmount(id: number, amount: string): Promise<void> {
    await db.update(goals).set({
      currentAmount: sql`${goals.currentAmount}::numeric + ${amount}::numeric`,
    }).where(eq(goals.id, id));
  }

  async deleteGoal(id: number, userId: string): Promise<void> {
    await db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  }

  async getLastActiveGoal(userId: string): Promise<Goal | undefined> {
    const allGoals = await db.select().from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(desc(goals.createdAt));
    const active = allGoals.filter(g => parseFloat(String(g.currentAmount)) < parseFloat(String(g.targetAmount)));
    if (active.length === 0) return undefined;

    const deposited = active.filter(g => parseFloat(String(g.currentAmount)) > 0);
    if (deposited.length > 0) {
      return deposited[0];
    }
    return active[0];
  }

  async hasDepositToday(userId: string, date: string): Promise<boolean> {
    const todayTxs = await db.select().from(transactions).where(
      and(
        eq(transactions.userId, userId),
        eq(transactions.date, date),
        eq(transactions.type, "income")
      )
    );
    return todayTxs.length > 0;
  }

  async getLiabilitiesByUser(userId: string): Promise<Liability[]> {
    return db.select().from(liabilities).where(eq(liabilities.userId, userId)).orderBy(desc(liabilities.createdAt));
  }

  async getLiability(id: number, userId: string): Promise<Liability | undefined> {
    const [liability] = await db.select().from(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.userId, userId)));
    return liability;
  }

  async createLiability(data: InsertLiability): Promise<Liability> {
    const [liability] = await db.insert(liabilities).values(data).returning();
    return liability;
  }

  async deleteLiability(id: number, userId: string): Promise<void> {
    await db.delete(liabilities).where(and(eq(liabilities.id, id), eq(liabilities.userId, userId)));
  }

  async payLiability(id: number, userId: string, amount: string): Promise<void> {
    await db.update(liabilities)
      .set({ amount: sql`GREATEST(${liabilities.amount}::numeric - ${amount}::numeric, 0)` })
      .where(and(eq(liabilities.id, id), eq(liabilities.userId, userId)));
  }

  async getProfile(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async upsertProfile(data: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db.insert(userProfiles).values(data)
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: data,
      })
      .returning();
    return profile;
  }

  async updateProfile(userId: string, data: Partial<Record<string, any>>): Promise<void> {
    await db.update(userProfiles).set(data).where(eq(userProfiles.userId, userId));
  }

  async getXpLogsByUser(userId: string): Promise<XpLog[]> {
    return db.select().from(xpLogs).where(eq(xpLogs.userId, userId)).orderBy(desc(xpLogs.createdAt));
  }

  async addXp(userId: string, amount: number, reason: string): Promise<void> {
    await db.update(userProfiles).set({
      xp: sql`${userProfiles.xp} + ${amount}`,
    }).where(eq(userProfiles.userId, userId));

    await db.insert(xpLogs).values({ userId, amount, reason });

    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    if (profile) {
      const newLevel = this.calculateLevel(profile.xp);
      if (newLevel !== profile.level) {
        await db.update(userProfiles).set({ level: newLevel }).where(eq(userProfiles.userId, userId));
      }
    }
  }

  private calculateLevel(xp: number): number {
    const thresholds = [0, 50, 120, 220, 350, 520, 730, 1000, 1350, 1800];
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (xp >= thresholds[i]) return i + 1;
    }
    return 1;
  }

  async updateStreak(userId: string, count: number, lastActive: string): Promise<void> {
    await db.update(userProfiles).set({
      streakCount: count,
      streakLastActive: lastActive,
    }).where(eq(userProfiles.userId, userId));
  }

  async useRevive(userId: string): Promise<void> {
    await db.update(userProfiles).set({
      reviveRemaining: sql`${userProfiles.reviveRemaining} - 1`,
    }).where(eq(userProfiles.userId, userId));
  }

  async resetRevives(userId: string): Promise<void> {
    await db.update(userProfiles).set({
      reviveRemaining: 3,
      reviveResetDate: new Date().toISOString().split("T")[0],
    }).where(eq(userProfiles.userId, userId));
  }

  async logStreak(userId: string, action: string, date: string): Promise<void> {
    await db.insert(streakLogs).values({ userId, action, date });
  }

  async getStreakLogForDate(userId: string, date: string): Promise<StreakLog | undefined> {
    const [log] = await db.select().from(streakLogs).where(
      and(eq(streakLogs.userId, userId), eq(streakLogs.date, date))
    );
    return log;
  }

  async getStreakLogs(userId: string): Promise<StreakLog[]> {
    return db.select().from(streakLogs).where(eq(streakLogs.userId, userId)).orderBy(desc(streakLogs.createdAt));
  }

  async getAllUsersWithProfiles(): Promise<any[]> {
    const result = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        createdAt: users.createdAt,
        xp: userProfiles.xp,
        level: userProfiles.level,
        streakCount: userProfiles.streakCount,
        isAdmin: userProfiles.isAdmin,
      })
      .from(users)
      .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
      .orderBy(desc(users.createdAt));
    return result;
  }

  async setUserLevel(userId: string, level: number): Promise<void> {
    await db.update(userProfiles).set({ level }).where(eq(userProfiles.userId, userId));
  }

  async getCustomCategoriesByUser(userId: string): Promise<CustomCategory[]> {
    return db.select().from(customCategories).where(eq(customCategories.userId, userId)).orderBy(desc(customCategories.createdAt));
  }

  async createCustomCategory(data: InsertCustomCategory): Promise<CustomCategory> {
    const [cat] = await db.insert(customCategories).values(data).returning();
    return cat;
  }

  async deleteCustomCategory(id: number, userId: string): Promise<void> {
    await db.delete(customCategories).where(and(eq(customCategories.id, id), eq(customCategories.userId, userId)));
  }

  async getDailyFocus(userId: string, date: string): Promise<DailyFocus | undefined> {
    const [focus] = await db.select().from(dailyFocus).where(
      and(eq(dailyFocus.userId, userId), eq(dailyFocus.date, date))
    );
    return focus;
  }

  async getDailyFocusList(userId: string, date: string): Promise<DailyFocus[]> {
    return db.select().from(dailyFocus).where(
      and(eq(dailyFocus.userId, userId), eq(dailyFocus.date, date))
    );
  }

  async createDailyFocus(data: InsertDailyFocus): Promise<DailyFocus> {
    const [focus] = await db.insert(dailyFocus).values(data).returning();
    return focus;
  }

  async completeDailyFocus(id: number, userId: string): Promise<void> {
    await db.update(dailyFocus).set({ completed: true }).where(
      and(eq(dailyFocus.id, id), eq(dailyFocus.userId, userId))
    );
  }

  async getAllBadges(): Promise<BadgeRecord[]> {
    return db.select().from(badges).orderBy(badges.sortOrder);
  }

  async getUserBadges(userId: string): Promise<(UserBadgeRecord & { badge: BadgeRecord })[]> {
    const result = await db
      .select({
        id: userBadges.id,
        userId: userBadges.userId,
        badgeId: userBadges.badgeId,
        unlockedAt: userBadges.unlockedAt,
        badge: badges,
      })
      .from(userBadges)
      .innerJoin(badges, eq(userBadges.badgeId, badges.id))
      .where(eq(userBadges.userId, userId))
      .orderBy(badges.sortOrder);
    return result.map(r => ({
      id: r.id,
      userId: r.userId,
      badgeId: r.badgeId,
      unlockedAt: r.unlockedAt,
      badge: r.badge,
    }));
  }

  async awardBadge(userId: string, badgeId: number): Promise<UserBadgeRecord> {
    const [ub] = await db.insert(userBadges).values({ userId, badgeId }).returning();
    return ub;
  }

  async hasUserBadge(userId: string, badgeId: number): Promise<boolean> {
    const [existing] = await db.select().from(userBadges).where(
      and(eq(userBadges.userId, userId), eq(userBadges.badgeId, badgeId))
    );
    return !!existing;
  }

  async seedBadges(badgeList: InsertBadge[]): Promise<void> {
    const existing = await db.select().from(badges);
    if (existing.length === 0) {
      await db.insert(badges).values(badgeList);
    }
  }

  async getBudgetAllocationsByMonth(userId: string, month: string): Promise<BudgetAllocation[]> {
    return db.select().from(budgetAllocations).where(
      and(eq(budgetAllocations.userId, userId), eq(budgetAllocations.month, month))
    ).orderBy(desc(budgetAllocations.createdAt));
  }

  async upsertBudgetAllocation(data: InsertBudgetAllocation): Promise<BudgetAllocation> {
    const existing = await db.select().from(budgetAllocations).where(
      and(
        eq(budgetAllocations.userId, data.userId),
        eq(budgetAllocations.category, data.category),
        eq(budgetAllocations.month, data.month)
      )
    );
    if (existing.length > 0) {
      const [updated] = await db.update(budgetAllocations)
        .set({ budgetLimit: data.budgetLimit, note: data.note })
        .where(eq(budgetAllocations.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(budgetAllocations).values(data).returning();
    return created;
  }

  async deleteBudgetAllocation(id: number, userId: string): Promise<void> {
    await db.delete(budgetAllocations).where(
      and(eq(budgetAllocations.id, id), eq(budgetAllocations.userId, userId))
    );
  }

  async getBudgetPlan(userId: string, month: string): Promise<BudgetPlan | undefined> {
    const [plan] = await db.select().from(budgetPlans).where(
      and(eq(budgetPlans.userId, userId), eq(budgetPlans.month, month))
    );
    return plan;
  }

  async upsertBudgetPlan(data: InsertBudgetPlan): Promise<BudgetPlan> {
    const existing = await db.select().from(budgetPlans).where(
      and(eq(budgetPlans.userId, data.userId), eq(budgetPlans.month, data.month))
    );
    if (existing.length > 0) {
      const [updated] = await db.update(budgetPlans)
        .set({
          income: data.income,
          strategy: data.strategy,
          needsAmount: data.needsAmount,
          wantsAmount: data.wantsAmount,
          savingsAmount: data.savingsAmount,
          investmentAmount: data.investmentAmount,
          cycleType: data.cycleType,
          cycleStartDay: data.cycleStartDay,
          cycleStartDate: data.cycleStartDate,
        })
        .where(eq(budgetPlans.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(budgetPlans).values(data).returning();
    return created;
  }

  async deleteBudgetPlan(userId: string, month: string): Promise<void> {
    await db.delete(budgetPlans).where(
      and(eq(budgetPlans.userId, userId), eq(budgetPlans.month, month))
    );
  }
}

export const storage = new DatabaseStorage();
