/**
 * ===== DATABASE SCHEMA =====
 * All Drizzle ORM table definitions for Financial Radar.
 *
 * Tables:
 * - accounts: User's financial accounts (cash, bank, e-wallet) with balances
 * - transactions: Income/expense/transfer records with account references
 * - goals: Savings goals with target amounts and deadlines
 * - liabilities: Debt records for debt health analysis
 * - userProfiles: XP, level, streak, unlocked features, admin flag
 * - xpLogs: History of XP earned (for audit/tracking)
 * - streakLogs: Daily interaction records (one per day per user)
 * - customCategories: User-defined transaction categories
 * - dailyFocus: Daily missions (3 random per day, from FOCUS_TYPES pool)
 *
 * All monetary fields use numeric(15,2) for precision.
 * All tables reference users.id (varchar) as foreign key.
 *
 * MIGRATION NOTE: If switching databases (e.g. to Supabase/PlanetScale),
 * update db.ts connection and run `npm run db:push` to sync schema.
 */
export * from "./models/auth";

import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, numeric, timestamp, date, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// === ENUM TYPES ===
export const accountTypeEnum = pgEnum("account_type", ["cash", "bank", "ewallet"]);
export const transactionTypeEnum = pgEnum("transaction_type", ["income", "expense", "transfer"]);

// === ACCOUNTS TABLE ===
// Types: cash, bank, ewallet. Balance auto-updated on transaction create/delete.
export const accounts = pgTable("accounts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  balance: numeric("balance", { precision: 15, scale: 2 }).notNull().default("0"),
  color: text("color"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === TRANSACTIONS TABLE ===
// income: toAccountId receives money. expense: fromAccountId loses money.
// transfer: fromAccountId→toAccountId. Amount always positive.
export const transactions = pgTable("transactions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  fromAccountId: integer("from_account_id").references(() => accounts.id),
  toAccountId: integer("to_account_id").references(() => accounts.id),
  category: text("category"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === GOALS TABLE ===
// Savings goals with deadline. currentAmount updated via /api/goals/:id/deposit.
// Smart Save calculates daily suggestion = remaining / daysLeft.
export const goals = pgTable("goals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 15, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  deadline: date("deadline").notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// === LIABILITIES TABLE ===
// Debt records. Used by /api/debt-health to calculate debt ratio.
// debtType: "one_time" (simple debt) or "installment" (recurring payments).
// For installment: remainingBalance = monthlyPayment * remainingMonths.
// debtRatio = totalRemainingLiabilities / totalAssets * 100
export const liabilities = pgTable("liabilities", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  debtType: text("debt_type").notNull().default("other"),
  totalLoanAmount: numeric("total_loan_amount", { precision: 15, scale: 2 }),
  monthlyPayment: numeric("monthly_payment", { precision: 15, scale: 2 }),
  remainingMonths: integer("remaining_months"),
  dueDay: integer("due_day"),
  interestRate: numeric("interest_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// === USER PROFILES TABLE ===
// XP/Level/Streak gamification data. Level determines feature unlocks:
// Level 1: core, Level 3: weekly_insight, Level 5: debt_health, Level 7: net_worth
// Revives: 3 per week, used to recover broken streaks.
export const userProfiles = pgTable("user_profiles", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  streakCount: integer("streak_count").notNull().default(0),
  streakLastActive: date("streak_last_active"),
  reviveRemaining: integer("revive_remaining").notNull().default(3),
  reviveResetDate: date("revive_reset_date"),
  unlockedFeatures: text("unlocked_features").array().notNull().default(sql`ARRAY[]::text[]`),
  isAdmin: boolean("is_admin").notNull().default(false),
  riskProfile: text("risk_profile").notNull().default("moderate"),
  monthlyIncome: numeric("monthly_income", { precision: 15, scale: 2 }),
  primaryGoal: text("primary_goal"),
  habitType: text("habit_type"),
  focusAreas: text("focus_areas").array().default(sql`ARRAY[]::text[]`),
  scoreBonusToday: integer("score_bonus_today").notNull().default(0),
  scoreBonusDate: date("score_bonus_date"),
});

// === XP LOGS TABLE ===
// Audit trail: every XP gain is logged with reason (transaction, no_spending, daily_focus, etc.)
export const xpLogs = pgTable("xp_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === STREAK LOGS TABLE ===
// One entry per day per user. Existence = user interacted today (transaction or no_spending).
// Used to determine todayInteracted and calculate streak continuity.
export const streakLogs = pgTable("streak_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  date: date("date").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// === CUSTOM CATEGORIES TABLE ===
// User-created categories that appear alongside default categories in transaction form.
export const customCategories = pgTable("custom_categories", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  emoji: text("emoji").default("📌"),
  type: text("type").notNull().default("expense"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === DAILY FOCUS TABLE ===
// 3 random missions generated per day from FOCUS_TYPES pool (in routes.ts).
// Types: log_transaction, save_money, check_debt_health, review_goals.
// "no_expense" was removed — "Spend Nothing Today" button is always visible instead.
export const dailyFocus = pgTable("daily_focus", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: date("date").notNull(),
  type: text("type").notNull(),
  conditionValue: numeric("condition_value", { precision: 15, scale: 2 }),
  rewardXp: integer("reward_xp").notNull().default(10),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// === BADGES TABLE ===
// Predefined badges that users can unlock through XP, streaks, or milestones.
// Categories: discipline, debt, wealth, smart_money
export const badges = pgTable("badges", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(), // discipline | debt | wealth | smart_money
  icon: text("icon").notNull(),
  unlockConditionType: text("unlock_condition_type").notNull(), // xp | streak | milestone
  unlockConditionValue: text("unlock_condition_value").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// === USER BADGES TABLE ===
// Tracks which badges each user has unlocked and when.
export const userBadges = pgTable("user_badges", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeId: integer("badge_id").notNull().references(() => badges.id),
  unlockedAt: timestamp("unlocked_at").defaultNow(),
});

// === TABLE RELATIONS ===
// Drizzle ORM relation definitions for query builder joins.
export const usersRelations = relations(users, ({ many, one }) => ({
  accounts: many(accounts),
  transactions: many(transactions),
  goals: many(goals),
  liabilities: many(liabilities),
  profile: one(userProfiles, { fields: [users.id], references: [userProfiles.userId] }),
  xpLogs: many(xpLogs),
  streakLogs: many(streakLogs),
  customCategories: many(customCategories),
  dailyFocuses: many(dailyFocus),
  userBadges: many(userBadges),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  goals: many(goals),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  fromAccount: one(accounts, { fields: [transactions.fromAccountId], references: [accounts.id], relationName: "fromAccount" }),
  toAccount: one(accounts, { fields: [transactions.toAccountId], references: [accounts.id], relationName: "toAccount" }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
  account: one(accounts, { fields: [goals.accountId], references: [accounts.id] }),
}));

export const liabilitiesRelations = relations(liabilities, ({ one }) => ({
  user: one(users, { fields: [liabilities.userId], references: [users.id] }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));

export const xpLogsRelations = relations(xpLogs, ({ one }) => ({
  user: one(users, { fields: [xpLogs.userId], references: [users.id] }),
}));

export const streakLogsRelations = relations(streakLogs, ({ one }) => ({
  user: one(users, { fields: [streakLogs.userId], references: [users.id] }),
}));

export const customCategoriesRelations = relations(customCategories, ({ one }) => ({
  user: one(users, { fields: [customCategories.userId], references: [users.id] }),
}));

export const dailyFocusRelations = relations(dailyFocus, ({ one }) => ({
  user: one(users, { fields: [dailyFocus.userId], references: [users.id] }),
}));

export const badgesRelations = relations(badges, ({ many }) => ({
  userBadges: many(userBadges),
}));

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
}));

// === ZOD SCHEMAS & TYPES ===
// Insert schemas: used for request validation (omit auto-generated fields).
// Select types: used for API response typing on both frontend and backend.
export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, createdAt: true });
export const insertGoalSchema = createInsertSchema(goals).omit({ id: true, createdAt: true });
export const insertLiabilitySchema = createInsertSchema(liabilities).omit({ id: true, createdAt: true });
export const insertUserProfileSchema = createInsertSchema(userProfiles);
export const insertCustomCategorySchema = createInsertSchema(customCategories).omit({ id: true, createdAt: true });
export const insertDailyFocusSchema = createInsertSchema(dailyFocus).omit({ id: true, createdAt: true });
export const insertBadgeSchema = createInsertSchema(badges).omit({ id: true });
export const insertUserBadgeSchema = createInsertSchema(userBadges).omit({ id: true });

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Liability = typeof liabilities.$inferSelect;
export type InsertLiability = z.infer<typeof insertLiabilitySchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type XpLog = typeof xpLogs.$inferSelect;
export type StreakLog = typeof streakLogs.$inferSelect;
export type CustomCategory = typeof customCategories.$inferSelect;
export type InsertCustomCategory = z.infer<typeof insertCustomCategorySchema>;
export type DailyFocus = typeof dailyFocus.$inferSelect;
export type InsertDailyFocus = z.infer<typeof insertDailyFocusSchema>;
export type BadgeRecord = typeof badges.$inferSelect;
export type InsertBadge = z.infer<typeof insertBadgeSchema>;
export type UserBadgeRecord = typeof userBadges.$inferSelect;
export type InsertUserBadge = z.infer<typeof insertUserBadgeSchema>;

export const budgetAllocations = pgTable("budget_allocations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  category: text("category").notNull(),
  budgetLimit: numeric("budget_limit", { precision: 15, scale: 2 }).notNull().default("0"),
  month: text("month").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBudgetAllocationSchema = createInsertSchema(budgetAllocations).omit({ id: true, createdAt: true });
export type BudgetAllocation = typeof budgetAllocations.$inferSelect;
export type InsertBudgetAllocation = z.infer<typeof insertBudgetAllocationSchema>;

export const budgetPlans = pgTable("budget_plans", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: varchar("user_id").notNull().references(() => users.id),
  month: text("month").notNull(),
  income: numeric("income", { precision: 15, scale: 2 }).notNull().default("0"),
  strategy: text("strategy").notNull().default("percentage"),
  needsAmount: numeric("needs_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  wantsAmount: numeric("wants_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  savingsAmount: numeric("savings_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  investmentAmount: numeric("investment_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBudgetPlanSchema = createInsertSchema(budgetPlans).omit({ id: true, createdAt: true });
export type BudgetPlan = typeof budgetPlans.$inferSelect;
export type InsertBudgetPlan = z.infer<typeof insertBudgetPlanSchema>;
