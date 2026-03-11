/**
 * ===== API ROUTES =====
 * All Express API endpoints for Financial Radar.
 *
 * Route groups:
 * - /api/profile         — User profile (XP, level, streak)
 * - /api/dashboard       — Aggregated dashboard data (assets, goals, interaction status)
 * - /api/accounts        — CRUD for financial accounts (cash/bank/ewallet)
 * - /api/transactions    — CRUD for income/expense/transfer + auto balance updates
 * - /api/no-spending     — Record "no spending today" interaction (+5 XP)
 * - /api/goals           — CRUD for savings goals + deposit
 * - /api/smart-save      — AI-like savings recommendation calculator
 * - /api/liabilities     — CRUD for debt records
 * - /api/debt-health     — Debt ratio analysis (unlock at Level 5)
 * - /api/net-worth       — Net worth tracking (unlock at Level 7)
 * - /api/spending-insight — Weekly/monthly spending breakdown with chart data
 * - /api/streak/revive   — Use one weekly revive to recover broken streak
 * - /api/daily-focus     — Daily missions (3 per day, auto-checked on access)
 * - /api/custom-categories — User-defined categories
 * - /api/admin/*         — Admin-only routes (user management)
 *
 * Key helpers:
 * - ensureProfile(): Creates profile if first login
 * - processInteraction(): Awards XP + updates streak
 * - checkFocusCompletion(): Auto-checks if a daily focus mission is done
 */
import type { Express } from "express";
import { storage } from "../storage";
import { setupAuth, isAuthenticated, isAdmin } from "../auth";
import { format, subDays, startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { users } from "../../shared/models/auth";
import { userProfiles } from "../../shared/schema";
import { eq, sql, count } from "drizzle-orm";

// === REQUEST VALIDATION SCHEMAS ===
// Zod schemas for validating POST/PATCH request bodies before database operations.
const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["cash", "bank", "ewallet"]),
  balance: z.union([z.string(), z.number()]).transform(String),
});

const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.union([z.string(), z.number()]).transform(String),
  date: z.string().min(1, "Date is required"),
  fromAccountId: z.number().nullable().optional(),
  toAccountId: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const goalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetAmount: z.union([z.string(), z.number()]).transform(String),
  deadline: z.string().min(1, "Deadline is required"),
  accountId: z.number().nullable().optional(),
});

const liabilitySchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.union([z.string(), z.number()]).transform(String),
  debtType: z.enum(["credit_card", "personal_loan", "mortgage", "business_loan", "other"]).default("other"),
  totalLoanAmount: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  monthlyPayment: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  remainingMonths: z.number().int().min(1).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  interestRate: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
});

// === DAILY FOCUS MISSION POOL ===
// Each day, 3 random missions are picked from this pool.
// "no_expense" removed — the "Spend Nothing Today" button is always visible on dashboard instead.
const FOCUS_TYPES = [
  { type: "log_transaction", rewardXp: 10 },
  { type: "save_money", rewardXp: 12 },
  { type: "check_debt_health", rewardXp: 8 },
  { type: "review_goals", rewardXp: 8 },
];

const BADGE_SEED_DATA = [
  { name: "first_step", description: "Record your first transaction", category: "discipline", icon: "footprints", unlockConditionType: "milestone", unlockConditionValue: "first_transaction", sortOrder: 1 },
  { name: "steady_start", description: "Reach a 3-day streak", category: "discipline", icon: "flame", unlockConditionType: "streak", unlockConditionValue: "3", sortOrder: 2 },
  { name: "week_warrior", description: "Reach a 7-day streak", category: "discipline", icon: "shield", unlockConditionType: "streak", unlockConditionValue: "7", sortOrder: 3 },
  { name: "habit_builder", description: "Reach a 14-day streak", category: "discipline", icon: "brick-wall", unlockConditionType: "streak", unlockConditionValue: "14", sortOrder: 4 },
  { name: "iron_discipline", description: "Reach a 30-day streak", category: "discipline", icon: "crown", unlockConditionType: "streak", unlockConditionValue: "30", sortOrder: 5 },
  { name: "xp_collector", description: "Earn 500 XP total", category: "discipline", icon: "sparkles", unlockConditionType: "xp", unlockConditionValue: "500", sortOrder: 6 },
  { name: "xp_master", description: "Earn 2000 XP total", category: "discipline", icon: "star", unlockConditionType: "xp", unlockConditionValue: "2000", sortOrder: 7 },
  { name: "debt_tracker", description: "Add your first liability", category: "debt", icon: "file-text", unlockConditionType: "milestone", unlockConditionValue: "first_liability", sortOrder: 8 },
  { name: "debt_reducer", description: "Pay off one liability completely", category: "debt", icon: "check-circle", unlockConditionType: "milestone", unlockConditionValue: "payoff_liability", sortOrder: 9 },
  { name: "healthy_ratio", description: "Achieve DSR below 30%", category: "debt", icon: "heart-pulse", unlockConditionType: "milestone", unlockConditionValue: "dsr_below_30", sortOrder: 10 },
  { name: "debt_free", description: "Clear all liabilities", category: "debt", icon: "trophy", unlockConditionType: "milestone", unlockConditionValue: "zero_liabilities", sortOrder: 11 },
  { name: "first_goal", description: "Create your first savings goal", category: "wealth", icon: "target", unlockConditionType: "milestone", unlockConditionValue: "first_goal", sortOrder: 12 },
  { name: "goal_achiever", description: "Complete one savings goal", category: "wealth", icon: "flag", unlockConditionType: "milestone", unlockConditionValue: "complete_goal", sortOrder: 13 },
  { name: "net_positive", description: "Achieve positive net worth", category: "wealth", icon: "trending-up", unlockConditionType: "milestone", unlockConditionValue: "positive_net_worth", sortOrder: 14 },
  { name: "wealth_milestone", description: "Total assets exceed Rp 10.000.000", category: "wealth", icon: "gem", unlockConditionType: "milestone", unlockConditionValue: "assets_10m", sortOrder: 15 },
  { name: "budget_conscious", description: "Use 'No Spending Today' 5 times", category: "smart_money", icon: "wallet", unlockConditionType: "milestone", unlockConditionValue: "no_spend_5", sortOrder: 16 },
  { name: "multi_account", description: "Create 3 or more accounts", category: "smart_money", icon: "layers", unlockConditionType: "milestone", unlockConditionValue: "accounts_3", sortOrder: 17 },
  { name: "diversified", description: "Have all 3 account types (Cash, Bank, E-Wallet)", category: "smart_money", icon: "shuffle", unlockConditionType: "milestone", unlockConditionValue: "all_account_types", sortOrder: 18 },
  { name: "category_master", description: "Use 5+ different expense categories", category: "smart_money", icon: "layout-grid", unlockConditionType: "milestone", unlockConditionValue: "expense_categories_5", sortOrder: 19 },
];

export async function registerRoutes(
  app: Express
): Promise<void> {
  await setupAuth(app);
// registerAuthRoutes sudah tidak dipakai

  await storage.seedBadges(BADGE_SEED_DATA);

  // === HELPER: Extract user ID from session ===
  // === GOOGLE AUTH (ACTIVE) ===
  function getUserId(req: any): string {
    return (req.session as any)?.user?.id;
  }
  // === GOOGLE AUTH END ===



  // === HELPER: Create profile on first login, or return existing ===
  async function ensureProfile(userId: string) {
    let profile = await storage.getProfile(userId);
    if (!profile) {
      profile = await storage.upsertProfile({
        userId,
        xp: 0,
        level: 1,
        streakCount: 0,
        streakLastActive: null,
        reviveRemaining: 3,
        reviveResetDate: null,
        unlockedFeatures: ["core"],
        isAdmin: false,
      });
    }
    return profile;
  }

  function getUserRole(req: any): string {
    return (req.session as any)?.user?.role || "user";
  }

  async function checkAndAwardBadges(userId: string) {
    const profile = await storage.getProfile(userId);
    if (!profile) return [];

    const allBadges = await storage.getAllBadges();
    const newlyAwarded: any[] = [];

    for (const badge of allBadges) {
      const has = await storage.hasUserBadge(userId, badge.id);
      if (has) continue;

      let shouldAward = false;

      if (badge.unlockConditionType === "xp") {
        shouldAward = profile.xp >= parseInt(badge.unlockConditionValue);
      } else if (badge.unlockConditionType === "streak") {
        shouldAward = profile.streakCount >= parseInt(badge.unlockConditionValue);
      } else if (badge.unlockConditionType === "milestone") {
        const val = badge.unlockConditionValue;
        if (val === "first_transaction") {
          const txns = await storage.getTransactionsByUser(userId);
          shouldAward = txns.length > 0;
        } else if (val === "first_liability") {
          const libs = await storage.getLiabilitiesByUser(userId);
          shouldAward = libs.length > 0;
        } else if (val === "payoff_liability") {
          const libs = await storage.getLiabilitiesByUser(userId);
          shouldAward = libs.some((l: any) => l.status === "paid_off");
        } else if (val === "dsr_below_30") {
          const libs = await storage.getLiabilitiesByUser(userId);
          if (libs.length > 0 && profile.monthlyIncome && Number(profile.monthlyIncome) > 0) {
            const totalMonthlyDebt = libs.reduce((sum: number, l: any) => sum + Number(l.monthlyPayment || 0), 0);
            const dsr = (totalMonthlyDebt / Number(profile.monthlyIncome)) * 100;
            shouldAward = dsr < 30;
          }
        } else if (val === "zero_liabilities") {
          const libs = await storage.getLiabilitiesByUser(userId);
          shouldAward = libs.length > 0 && libs.every((l: any) => l.status === "paid_off");
        } else if (val === "first_goal") {
          const goalsList = await storage.getGoalsByUser(userId);
          shouldAward = goalsList.length > 0;
        } else if (val === "complete_goal") {
          const goalsList = await storage.getGoalsByUser(userId);
          shouldAward = goalsList.some((g: any) => Number(g.currentAmount) >= Number(g.targetAmount));
        } else if (val === "positive_net_worth") {
          const accts = await storage.getAccountsByUser(userId);
          const libs = await storage.getLiabilitiesByUser(userId);
          const goals = await storage.getGoalsByUser(userId);
          const totalAssets = accts.reduce((s: number, a: any) => s + Number(a.balance), 0) + goals.reduce((s: number, g: any) => s + Number(g.currentAmount), 0);
          const totalLiab = libs.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
          shouldAward = totalAssets > totalLiab && totalAssets > 0;
        } else if (val === "assets_10m") {
          const accts = await storage.getAccountsByUser(userId);
          const goals = await storage.getGoalsByUser(userId);
          const totalAssets = accts.reduce((s: number, a: any) => s + Number(a.balance), 0) + goals.reduce((s: number, g: any) => s + Number(g.currentAmount), 0);
          shouldAward = totalAssets >= 10000000;
        } else if (val === "no_spend_5") {
          const streakHistory = await storage.getStreakLogs(userId);
          const noSpendCount = streakHistory.filter((l: any) => l.action === "no_spending").length;
          shouldAward = noSpendCount >= 5;
        } else if (val === "accounts_3") {
          const accts = await storage.getAccountsByUser(userId);
          shouldAward = accts.length >= 3;
        } else if (val === "all_account_types") {
          const accts = await storage.getAccountsByUser(userId);
          const types = new Set(accts.map((a: any) => a.type));
          shouldAward = types.has("cash") && types.has("bank") && types.has("ewallet");
        } else if (val === "expense_categories_5") {
          const txns = await storage.getTransactionsByUser(userId);
          const expenseCats = new Set(txns.filter((t: any) => t.type === "expense").map((t: any) => t.category));
          shouldAward = expenseCats.size >= 5;
        }
      }

      if (shouldAward) {
        await storage.awardBadge(userId, badge.id);
        newlyAwarded.push(badge);
      }
    }

    return newlyAwarded;
  }

  // === HELPER: Process daily interaction ===
  // Awards XP, updates streak count, logs streak entry.
  // Called on: transaction create, no-spending button press.
  // Streak logic: consecutive days increment; missed day resets to 1.
  // Bonus: +20 XP every 7-day streak milestone.
  async function processInteraction(userId: string, xpAmount: number, reason: string) {
    const profile = await ensureProfile(userId);
    const today = format(new Date(), "yyyy-MM-dd");

    await storage.addXp(userId, xpAmount, reason);

    const existingLog = await storage.getStreakLogForDate(userId, today);
    if (!existingLog) {
      const lastActive = profile.streakLastActive;
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

      let newStreak = profile.streakCount;

      if (!lastActive || lastActive === yesterday) {
        newStreak = profile.streakCount + 1;
      } else if (lastActive === today) {
        newStreak = profile.streakCount;
      } else {
        newStreak = 1;
      }

      await storage.updateStreak(userId, newStreak, today);
      await storage.logStreak(userId, reason, today);

      if (newStreak > 0 && newStreak % 7 === 0) {
        await storage.addXp(userId, 20, "7_day_streak");
      }
    }
  }

  app.get("/api/profile", isAuthenticated, async (req, res) => {
    const userId = getUserId(req);
    const profile = await storage.getProfile(userId);
    const userRole = (req.session as any)?.user?.role || "user";

    res.json({
      ...profile,
      role: userRole,
      isAdmin: userRole === "admin",
    });
  });

  app.patch("/api/user/name", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { firstName } = req.body;
      if (!firstName || typeof firstName !== "string" || !firstName.trim()) {
        return res.status(400).json({ message: "firstName is required" });
      }
      const trimmed = firstName.trim().slice(0, 50);
      await db.update(users).set({ firstName: trimmed }).where(eq(users.id, userId));
      res.json({ success: true, firstName: trimmed });
    } catch (error) {
      console.error("Error updating user name:", error);
      res.status(500).json({ message: "Failed to update name" });
    }
  });


  // ===== DASHBOARD DATA =====
  // Returns aggregated financial summary for the main dashboard card.
  app.get("/api/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accts = await storage.getAccountsByUser(userId);
      const allGoals = await storage.getGoalsByUser(userId);
      const today = format(new Date(), "yyyy-MM-dd");

      const totalCash = accts.filter(a => a.type === "cash").reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const totalBank = accts.filter(a => a.type === "bank").reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const totalEwallet = accts.filter(a => a.type === "ewallet").reduce((s, a) => s + parseFloat(String(a.balance)), 0);

      const activeGoals = allGoals.filter(g => parseFloat(String(g.currentAmount)) < parseFloat(String(g.targetAmount)));
      const totalSaving = allGoals.reduce((s, g) => s + parseFloat(String(g.currentAmount)), 0);
      const totalAssets = totalCash + totalBank + totalEwallet + totalSaving;
      const totalTarget = allGoals.reduce((s, g) => s + parseFloat(String(g.targetAmount)), 0);
      const goalProgress = totalTarget > 0 ? Math.min((totalSaving / totalTarget) * 100, 100) : 0;

      const lastActiveGoal = await storage.getLastActiveGoal(userId);

      const existingLog = await storage.getStreakLogForDate(userId, today);

      res.json({
        totalAssets,
        totalCash,
        totalBank,
        totalEwallet,
        totalSaving,
        totalTarget,
        goalProgress,
        todayInteracted: !!existingLog,
        lastActiveGoal: lastActiveGoal || null,
      });
    } catch (error) {
      console.error("Error fetching dashboard:", error);
      res.status(500).json({ message: "Failed to fetch dashboard" });
    }
  });

  // ===== ACCOUNTS CRUD =====
  app.get("/api/accounts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accts = await storage.getAccountsByUser(userId);
      res.json(accts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

    app.post("/api/accounts", isAuthenticated, async (req, res) => {
  try {
    const userId = getUserId(req);
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: parsed.error.errors[0].message });

    const { name, type, balance } = parsed.data;

    const account = await storage.createAccount({
      userId,
      name,
      type,
      balance: balance || "0",
    });

    const allAccounts = await storage.getAccountsByUser(userId);
    if (allAccounts.length === 1) {
      await storage.addXp(userId, 20, "first_account");
    }

    res.json(account);
  } catch (error) {
    console.error("Error creating account:", error);
    res.status(500).json({ message: "Failed to create account" });
  }
});


  app.patch("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const { name, type, balance, color, note } = req.body;
      const updated = await storage.updateAccount(id, userId, {
        name,
        type,
        balance: String(balance),
        ...(color !== undefined && { color }),
        ...(note !== undefined && { note }),
      });
      if (!updated) return res.status(404).json({ message: "Account not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating account:", error);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  app.delete("/api/accounts/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteAccount(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // ===== TRANSACTIONS =====
  // DELETE: Reverses balance changes before removing transaction.
  app.delete("/api/transactions/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const tx = await storage.getTransaction(id, userId);
      if (!tx) return res.status(404).json({ message: "Transaction not found" });

      if (tx.type === "expense" && tx.fromAccountId) {
        await storage.updateAccountBalance(tx.fromAccountId, String(tx.amount), "add");
      } else if (tx.type === "income" && tx.toAccountId) {
        await storage.updateAccountBalance(tx.toAccountId, String(tx.amount), "subtract");
      } else if (tx.type === "transfer") {
        if (tx.fromAccountId) await storage.updateAccountBalance(tx.fromAccountId, String(tx.amount), "add");
        if (tx.toAccountId) await storage.updateAccountBalance(tx.toAccountId, String(tx.amount), "subtract");
      }

      if (tx.category === "Savings" && tx.note?.startsWith("Deposit to ")) {
        const goalName = tx.note.replace("Deposit to ", "");
        const userGoals = await storage.getGoalsByUser(userId);
        const matchedGoal = userGoals.find(g => g.name === goalName);
        if (matchedGoal) {
          await storage.updateGoalAmount(matchedGoal.id, `-${tx.amount}`);
        }
      }

      await storage.deleteTransaction(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting transaction:", error);
      res.status(500).json({ message: "Failed to delete transaction" });
    }
  });

  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const txs = await storage.getTransactionsByUser(userId);
      res.json(txs);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // POST: Creates transaction, updates account balances, awards XP (+5 base, +3 if complete fields).
app.post("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = transactionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { type, amount, date, fromAccountId, toAccountId, category, note } = parsed.data;

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }

      if ((type === "expense" || type === "transfer") && !fromAccountId) {
        return res.status(400).json({ message: "Source account is required for expense and transfer transactions" });
      }
      if ((type === "income" || type === "transfer") && !toAccountId) {
        return res.status(400).json({ message: "Destination account is required for income and transfer transactions" });
      }

      if (fromAccountId) {
        const fromAcct = await storage.getAccount(fromAccountId, userId);
        if (!fromAcct) return res.status(403).json({ message: "From account not found or not owned by you" });
        if ((type === "expense" || type === "transfer") && parseFloat(String(fromAcct.balance)) < parseFloat(amount)) {
          return res.status(400).json({ message: "Insufficient balance", insufficientBalance: true, available: fromAcct.balance, accountName: fromAcct.name });
        }
      }
      if (toAccountId) {
        const toAcct = await storage.getAccount(toAccountId, userId);
        if (!toAcct) return res.status(403).json({ message: "To account not found or not owned by you" });
      }

      const tx = await storage.createTransaction({
        userId,
        type,
        amount: String(amount),
        date,
        fromAccountId: fromAccountId || null,
        toAccountId: toAccountId || null,
        category: category || null,
        note: note || null,
      });

      if (type === "income" && toAccountId) {
        await storage.updateAccountBalance(toAccountId, String(amount), "add");
      } else if (type === "expense" && fromAccountId) {
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");
      } else if (type === "transfer" && fromAccountId && toAccountId) {
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");
        await storage.updateAccountBalance(toAccountId, String(amount), "add");
      }

      let xp = 5;
      if (category && note) xp += 3;
      await processInteraction(userId, xp, "transaction");
      await checkAndAwardBadges(userId);

      res.json(tx);
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ message: "Failed to create transaction" });
    }
  });

  // ===== NO SPENDING TODAY =====
  // Records that user chose not to spend today. Awards +5 XP.
  // Button is always visible on dashboard (not gated by todayInteracted).
  app.post("/api/no-spending", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const today = format(new Date(), "yyyy-MM-dd");

      const existingLog = await storage.getStreakLogForDate(userId, today);
      if (existingLog) {
        return res.status(400).json({ message: "Already interacted today" });
      }

      await processInteraction(userId, 5, "no_spending");
      await checkAndAwardBadges(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error recording no spending:", error);
      res.status(500).json({ message: "Failed to record" });
    }
  });

  // ===== GOALS =====
  // GET: Also auto-completes "review_goals" daily focus mission when accessed.
  app.get("/api/goals", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const g = await storage.getGoalsByUser(userId);

      const today = format(new Date(), "yyyy-MM-dd");
      const focusList = await storage.getDailyFocusList(userId, today);
      const reviewFocus = focusList.find(f => f.type === "review_goals" && !f.completed);
      if (reviewFocus) {
        await storage.addXp(userId, 0, "visited_goals");
        await checkFocusCompletion(userId, reviewFocus);
      }

      res.json(g);
    } catch (error) {
      console.error("Error fetching goals:", error);
      res.status(500).json({ message: "Failed to fetch goals" });
    }
  });

  app.post("/api/goals", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = goalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { name, targetAmount, deadline, accountId } = parsed.data;
      const goal = await storage.createGoal({
        userId,
        name,
        targetAmount,
        currentAmount: "0",
        deadline,
        accountId: accountId || null,
      });
      res.json(goal);
    } catch (error) {
      console.error("Error creating goal:", error);
      res.status(500).json({ message: "Failed to create goal" });
    }
  });

  app.patch("/api/goals/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const goal = await storage.getGoal(id, userId);
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        targetAmount: z.union([z.string(), z.number()]).transform(v => String(v)).optional(),
        deadline: z.string().min(1).optional(),
        accountId: z.union([z.number(), z.null()]).optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      const updated = await storage.updateGoal(id, userId, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating goal:", error);
      res.status(500).json({ message: "Failed to update goal" });
    }
  });

  app.delete("/api/goals/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const goal = await storage.getGoal(id, userId);
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      await storage.deleteGoal(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting goal:", error);
      res.status(500).json({ message: "Failed to delete goal" });
    }
  });

  app.post("/api/goals/:id/deposit", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const { amount, fromAccountId } = req.body;

      const goal = await storage.getGoal(id, userId);
      if (!goal) return res.status(404).json({ message: "Goal not found" });

      if (!amount || parseFloat(String(amount)) <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }

      if (fromAccountId) {
        const fromAcct = await storage.getAccount(fromAccountId, userId);
        if (!fromAcct) return res.status(403).json({ message: "Account not found or not owned by you" });
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");

        await storage.createTransaction({
          userId,
          type: "transfer",
          amount: String(amount),
          date: format(new Date(), "yyyy-MM-dd"),
          fromAccountId: fromAccountId,
          toAccountId: null,
          category: "Savings",
          note: `Deposit to ${goal.name}`,
        });
      }

      await storage.updateGoalAmount(id, String(amount));

      await processInteraction(userId, 8, "savings_deposit");
      await checkAndAwardBadges(userId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error depositing to goal:", error);
      res.status(500).json({ message: "Failed to deposit" });
    }
  });

  app.get("/api/goals/:id/history", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const goal = await storage.getGoal(id, userId);
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      const allTx = await storage.getTransactionsByUser(userId);
      const deposits = allTx.filter(
        tx => tx.category === "Savings" && tx.note === `Deposit to ${goal.name}`
      );
      res.json(deposits);
    } catch (error) {
      console.error("Error fetching goal history:", error);
      res.status(500).json({ message: "Failed to fetch history" });
    }
  });

  // ===== SMART SAVE RECOMMENDATIONS =====
  // Calculates daily savings suggestion per active goal.
  // Formula: remaining / daysLeft, adjusted by spending patterns.
  // Used by SmartSaveAlert component on dashboard.
  app.get("/api/smart-save", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const allGoals = await storage.getGoalsByUser(userId);
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");

      const thisWeekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const txs = await storage.getTransactionsByDateRange(userId, thisWeekStart, todayStr);
      const weeklyExpense = txs.filter(t => t.type === "expense").reduce((s, t) => s + parseFloat(String(t.amount)), 0);
      const weeklyIncome = txs.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(String(t.amount)), 0);

      const recommendations = allGoals
        .filter(g => parseFloat(String(g.currentAmount)) < parseFloat(String(g.targetAmount)))
        .map(g => {
          const remaining = parseFloat(String(g.targetAmount)) - parseFloat(String(g.currentAmount));
          const daysLeft = Math.max(1, Math.ceil((parseISO(g.deadline).getTime() - today.getTime()) / 86400000));
          const dailySuggestion = remaining / daysLeft;

          let adjustedSuggestion = dailySuggestion;
          if (weeklyIncome > 0) {
            const savingsRate = Math.min(0.3, dailySuggestion / (weeklyIncome / 7));
            adjustedSuggestion = (weeklyIncome / 7) * savingsRate;
          }
          if (weeklyExpense > weeklyIncome * 0.7) {
            adjustedSuggestion = dailySuggestion * 0.8;
          }

          return {
            goalId: g.id,
            goalName: g.name,
            dailySuggestion: Math.ceil(Math.max(adjustedSuggestion, dailySuggestion * 0.5)),
            remaining,
            daysLeft,
            hasIncomeThisWeek: weeklyIncome > 0,
            isOverspending: weeklyExpense > weeklyIncome * 0.7,
          };
        });

      res.json({ recommendations, weeklyIncome, weeklyExpense });
    } catch (error) {
      console.error("Error fetching smart save:", error);
      res.status(500).json({ message: "Failed to fetch smart save recommendations" });
    }
  });

  // ===== LIABILITIES CRUD =====
  app.get("/api/liabilities", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const l = await storage.getLiabilitiesByUser(userId);
      res.json(l);
    } catch (error) {
      console.error("Error fetching liabilities:", error);
      res.status(500).json({ message: "Failed to fetch liabilities" });
    }
  });

  app.post("/api/liabilities", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = liabilitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { name, amount, debtType, totalLoanAmount, monthlyPayment, remainingMonths, dueDay, interestRate } = parsed.data;
      const liability = await storage.createLiability({
        userId,
        name,
        amount,
        debtType,
        totalLoanAmount: totalLoanAmount ?? null,
        monthlyPayment: monthlyPayment ?? null,
        remainingMonths: remainingMonths ?? null,
        dueDay: dueDay ?? null,
        interestRate: interestRate ?? null,
      });
      res.json(liability);
    } catch (error) {
      console.error("Error creating liability:", error);
      res.status(500).json({ message: "Failed to create liability" });
    }
  });

  app.post("/api/liabilities/:id/pay", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      const { amount, fromAccountId } = req.body;

      if (!amount || parseFloat(String(amount)) <= 0) {
        return res.status(400).json({ message: "Amount must be positive" });
      }

      const liability = await storage.getLiability(id, userId);
      if (!liability) return res.status(404).json({ message: "Liability not found" });

      if (fromAccountId) {
        const fromAcct = await storage.getAccount(fromAccountId, userId);
        if (!fromAcct) return res.status(403).json({ message: "Account not found or not owned by you" });
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");
      }

      await storage.payLiability(id, userId, String(amount));

      await storage.createTransaction({
        userId,
        type: "expense",
        amount: String(amount),
        date: format(new Date(), "yyyy-MM-dd"),
        fromAccountId: fromAccountId || null,
        toAccountId: null,
        category: "Debt Payment",
        note: `Payment for ${liability.name}`,
      });

      await processInteraction(userId, 8, "debt_payment");
      await checkAndAwardBadges(userId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error paying liability:", error);
      res.status(500).json({ message: "Failed to process payment" });
    }
  });

  app.delete("/api/liabilities/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteLiability(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting liability:", error);
      res.status(500).json({ message: "Failed to delete liability" });
    }
  });

  // ===== RISK PROFILE =====
  app.patch("/api/profile/risk-profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { riskProfile } = z.object({ riskProfile: z.enum(["conservative", "moderate", "aggressive"]) }).parse(req.body);
      await storage.updateProfile(userId, { riskProfile });
      res.json({ success: true, riskProfile });
    } catch (error) {
      console.error("Error updating risk profile:", error);
      res.status(500).json({ message: "Failed to update risk profile" });
    }
  });

  // ===== MONTHLY INCOME (for debt health cashflow) =====
  app.patch("/api/profile/monthly-income", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { monthlyIncome } = req.body;
      if (monthlyIncome === undefined || monthlyIncome === null) {
        return res.status(400).json({ message: "monthlyIncome is required" });
      }
      await storage.updateProfile(userId, { monthlyIncome: String(monthlyIncome) });
      res.json({ success: true, monthlyIncome });
    } catch (error) {
      console.error("Error updating monthly income:", error);
      res.status(500).json({ message: "Failed to update monthly income" });
    }
  });

  // ===== DEBT HEALTH (unlock at Level 5) =====
  // Calculates debt ratio + cashflow pressure using remaining balance for installments.
  // Dynamic healthy limit based on user's risk profile.
  app.get("/api/debt-health", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accts = await storage.getAccountsByUser(userId);
      const liabs = await storage.getLiabilitiesByUser(userId);
      const profile = await storage.getProfile(userId);
      const goals = await storage.getGoalsByUser(userId);

      const accountsTotal = accts.reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const savingsTotal = goals.reduce((s, g) => s + parseFloat(String(g.currentAmount)), 0);
      const totalAssets = accountsTotal + savingsTotal;
      const totalLiabilities = liabs.reduce((s, l) => {
        if (l.monthlyPayment && l.remainingMonths) {
          return s + parseFloat(String(l.monthlyPayment)) * l.remainingMonths;
        }
        return s + parseFloat(String(l.amount));
      }, 0);
      const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

      let riskProfile = profile?.riskProfile ?? "moderate";
      if (riskProfile === "balanced") riskProfile = "moderate";
      const healthyLimits: Record<string, number> = { conservative: 25, moderate: 30, aggressive: 40 };
      const cautionLimits: Record<string, number> = { conservative: 40, moderate: 50, aggressive: 60 };
      const healthyLimit = healthyLimits[riskProfile] ?? 30;
      const cautionLimit = cautionLimits[riskProfile] ?? 50;

      let status: "healthy" | "caution" | "danger" = "healthy";
      if (debtRatio > cautionLimit) status = "danger";
      else if (debtRatio > healthyLimit) status = "caution";

      const budgetPlanForIncome = await storage.getBudgetPlan(userId, format(new Date(), "yyyy-MM"));
      const monthlyIncome = budgetPlanForIncome
        ? Number(budgetPlanForIncome.income)
        : (profile?.monthlyIncome ? parseFloat(String(profile.monthlyIncome)) : 0);
      const totalMonthlyInstallments = liabs.reduce((s, l) => {
        if (l.monthlyPayment) return s + parseFloat(String(l.monthlyPayment));
        return s;
      }, 0);
      const dsr = monthlyIncome > 0 ? (totalMonthlyInstallments / monthlyIncome) * 100 : 0;
      const remainingAfterDebt = monthlyIncome - totalMonthlyInstallments;

      let pressureStatus: "stable" | "moderate" | "high" = "stable";
      if (dsr > 40) pressureStatus = "high";
      else if (dsr >= 30) pressureStatus = "moderate";

      const today = format(new Date(), "yyyy-MM-dd");
      const focusList = await storage.getDailyFocusList(userId, today);
      const debtFocus = focusList.find(f => f.type === "check_debt_health" && !f.completed);
      if (debtFocus) {
        await storage.addXp(userId, 0, "visited_debt_health");
        await checkFocusCompletion(userId, debtFocus);
      }

      res.json({
        totalAssets, totalLiabilities, debtRatio, status, riskProfile, healthyLimit,
        monthlyIncome, totalMonthlyInstallments, dsr, remainingAfterDebt, pressureStatus,
      });
    } catch (error) {
      console.error("Error fetching debt health:", error);
      res.status(500).json({ message: "Failed to fetch debt health" });
    }
  });

  // ===== NET WORTH (unlock at Level 7) =====
  // Returns total assets, liabilities, net worth, and 6-month history.
  app.get("/api/net-worth", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const accts = await storage.getAccountsByUser(userId);
      const liabs = await storage.getLiabilitiesByUser(userId);
      const goals = await storage.getGoalsByUser(userId);

      const accountsTotal = accts.reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const savingsTotal = goals.reduce((s, g) => s + parseFloat(String(g.currentAmount)), 0);
      const currentTotalAssets = accountsTotal + savingsTotal;
      const totalLiabilities = liabs.reduce((s, l) => {
        if (l.monthlyPayment && l.remainingMonths) {
          return s + parseFloat(String(l.monthlyPayment)) * l.remainingMonths;
        }
        return s + parseFloat(String(l.amount));
      }, 0);
      const netWorth = currentTotalAssets - totalLiabilities;

      const now = new Date();
      const sixMonthsAgo = startOfMonth(subMonths(now, 5));
      const allTxs = await storage.getTransactionsByDateRange(
        userId,
        format(sixMonthsAgo, "yyyy-MM-dd"),
        format(endOfMonth(now), "yyyy-MM-dd")
      );

      const history = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(now, i);
        const mStart = startOfMonth(monthDate);
        const mEnd = endOfMonth(monthDate);
        const mStartStr = format(mStart, "yyyy-MM-dd");
        const mEndStr = format(mEnd, "yyyy-MM-dd");
        const monthLabel = format(monthDate, "MMM");

        const monthTxs = allTxs.filter(tx => {
          const d = String(tx.date);
          return d >= mStartStr && d <= mEndStr;
        });

        let monthIncome = 0;
        let monthExpense = 0;
        for (const tx of monthTxs) {
          const amt = parseFloat(String(tx.amount));
          if (tx.type === "income") monthIncome += amt;
          else if (tx.type === "expense") monthExpense += amt;
        }

        history.push({
          month: monthLabel,
          income: monthIncome,
          expense: monthExpense,
          netFlow: monthIncome - monthExpense,
        });
      }

      let runningAssets = currentTotalAssets;
      for (let i = history.length - 1; i >= 0; i--) {
        history[i].assets = runningAssets;
        history[i].liabilities = totalLiabilities;
        history[i].netWorth = runningAssets - totalLiabilities;
        if (i > 0) {
          runningAssets = runningAssets - history[i].netFlow;
        }
      }

      res.json({ totalAssets: currentTotalAssets, totalLiabilities, netWorth, history });
    } catch (error) {
      console.error("Error fetching net worth:", error);
      res.status(500).json({ message: "Failed to fetch net worth" });
    }
  });

  // ===== WEEKLY INSIGHT (legacy endpoint) =====
  // Original weekly insight endpoint. Still functional, but dashboard now uses /api/spending-insight.
  app.get("/api/weekly-insight", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const now = new Date();
      const thisWeekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const thisWeekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const lastWeekStart = format(startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const lastWeekEnd = format(endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }), "yyyy-MM-dd");

      const thisWeekTxs = await storage.getTransactionsByDateRange(userId, thisWeekStart, thisWeekEnd);
      const lastWeekTxs = await storage.getTransactionsByDateRange(userId, lastWeekStart, lastWeekEnd);

      const thisWeekExpenses = thisWeekTxs.filter(t => t.type === "expense");
      const lastWeekExpenses = lastWeekTxs.filter(t => t.type === "expense");

      const totalExpense = thisWeekExpenses.reduce((s, t) => s + parseFloat(String(t.amount)), 0);
      const lastWeekExpense = lastWeekExpenses.reduce((s, t) => s + parseFloat(String(t.amount)), 0);
      const changePercent = lastWeekExpense > 0 ? ((totalExpense - lastWeekExpense) / lastWeekExpense) * 100 : 0;

      const categoryMap: Record<string, number> = {};
      thisWeekExpenses.forEach(t => {
        const cat = t.category || "Other";
        categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(String(t.amount));
      });
      const topCategories = Object.entries(categoryMap)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

      const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      const dailyBreakdown = dayNames.map((day, i) => {
        const dayDate = format(
          new Date(parseISO(thisWeekStart).getTime() + i * 86400000),
          "yyyy-MM-dd"
        );
        const dayAmount = thisWeekExpenses
          .filter(t => t.date === dayDate)
          .reduce((s, t) => s + parseFloat(String(t.amount)), 0);
        return { day, amount: dayAmount };
      });

      res.json({ totalExpense, lastWeekExpense, changePercent, topCategories, dailyBreakdown });
    } catch (error) {
      console.error("Error fetching weekly insight:", error);
      res.status(500).json({ message: "Failed to fetch weekly insight" });
    }
  });

  // ===== SPENDING INSIGHT =====
  // Dashboard chart data. Supports ?period=weekly|monthly (daily mode exists but not used in UI).
  // Returns: totalExpense, prevTotalExpense, changePercent, topCategories, breakdown (bar chart data).
  // Weekly: 7 bars (Mon-Sun). Monthly: 28-31 bars (grouped into ~4 weeks by frontend).
  app.get("/api/spending-insight", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const period = (req.query.period as string) || "weekly";
      const now = new Date();

      let currentStart: string, currentEnd: string;
      let prevStart: string, prevEnd: string;
      let breakdownLabels: string[] = [];

      if (period === "daily") {
        currentStart = format(now, "yyyy-MM-dd");
        currentEnd = currentStart;
        const yesterday = subDays(now, 1);
        prevStart = format(yesterday, "yyyy-MM-dd");
        prevEnd = prevStart;
        breakdownLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
      } else if (period === "monthly") {
        currentStart = format(startOfMonth(now), "yyyy-MM-dd");
        currentEnd = format(endOfMonth(now), "yyyy-MM-dd");
        const lastMonth = subMonths(now, 1);
        prevStart = format(startOfMonth(lastMonth), "yyyy-MM-dd");
        prevEnd = format(endOfMonth(lastMonth), "yyyy-MM-dd");
        const daysInMonth = endOfMonth(now).getDate();
        breakdownLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
      } else {
        currentStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        currentEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
        const yesterday = subDays(now, 1);
        prevStart = format(yesterday, "yyyy-MM-dd");
        prevEnd = prevStart;
        breakdownLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      }

      const currentTxs = await storage.getTransactionsByDateRange(userId, currentStart, currentEnd);
      const prevTxs = await storage.getTransactionsByDateRange(userId, prevStart, prevEnd);

      const currentExpenses = currentTxs.filter(t => t.type === "expense");
      const prevExpenses = prevTxs.filter(t => t.type === "expense");

      const totalExpense = currentExpenses.reduce((s, t) => s + parseFloat(String(t.amount)), 0);
      const prevTotalExpense = prevExpenses.reduce((s, t) => s + parseFloat(String(t.amount)), 0);
      let changePercent = 0;
      if (prevTotalExpense > 0) {
        changePercent = ((totalExpense - prevTotalExpense) / prevTotalExpense) * 100;
      } else if (totalExpense > 0) {
        changePercent = 100;
      }

      const totalIncome = currentTxs.filter(t => t.type === "income").reduce((s, t) => s + parseFloat(String(t.amount)), 0);

      const categoryMap: Record<string, number> = {};
      currentExpenses.forEach(t => {
        const cat = t.category || "Other";
        categoryMap[cat] = (categoryMap[cat] || 0) + parseFloat(String(t.amount));
      });
      const topCategories = Object.entries(categoryMap)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

      let breakdown: { label: string; amount: number }[] = [];
      if (period === "daily") {
        breakdown = breakdownLabels.map((label) => ({ label, amount: 0 }));
      } else if (period === "monthly") {
        breakdown = breakdownLabels.map((label) => {
          const dayDate = format(new Date(now.getFullYear(), now.getMonth(), parseInt(label)), "yyyy-MM-dd");
          const dayAmount = currentExpenses
            .filter(t => t.date === dayDate)
            .reduce((s, t) => s + parseFloat(String(t.amount)), 0);
          return { label, amount: dayAmount };
        });
      } else {
        breakdown = breakdownLabels.map((label, i) => {
          const dayDate = format(
            new Date(parseISO(currentStart).getTime() + i * 86400000),
            "yyyy-MM-dd"
          );
          const dayAmount = currentExpenses
            .filter(t => t.date === dayDate)
            .reduce((s, t) => s + parseFloat(String(t.amount)), 0);
          return { label, amount: dayAmount };
        });
      }

      res.json({
        period,
        totalExpense,
        prevTotalExpense,
        totalIncome,
        changePercent,
        topCategories,
        breakdown,
      });
    } catch (error) {
      console.error("Error fetching spending insight:", error);
      res.status(500).json({ message: "Failed to fetch spending insight" });
    }
  });

  // ===== STREAK REVIVE =====
  // Uses one of 3 weekly revives to recover a broken streak.
  app.post("/api/streak/revive", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await ensureProfile(userId);

      if (profile.reviveRemaining <= 0) {
        return res.status(400).json({ message: "No revives remaining" });
      }

      await storage.useRevive(userId);
      const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
      await storage.logStreak(userId, "revive", yesterday);

      res.json({ success: true });
    } catch (error) {
      console.error("Error using revive:", error);
      res.status(500).json({ message: "Failed to use revive" });
    }
  });

  app.get("/api/admin/stats", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      const totalUsers = allUsers.length;

      const allProfiles = await db.select().from(userProfiles);
      const totalXpDistributed = allProfiles.reduce((s, p) => s + (p.xp || 0), 0);

      const allTxs = await storage.getAllTransactionsCount();

      res.json({
        totalUsers,
        totalTransactions: allTxs,
        totalXpDistributed,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const allUsers = await db.select().from(users);
      const allProfiles = await db.select().from(userProfiles);

      const profileMap = new Map(allProfiles.map(p => [p.userId, p]));

      const result = allUsers.map(u => {
        const profile = profileMap.get(u.id);
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          profileImageUrl: u.profileImageUrl,
          role: u.role || "user",
          isGuest: u.isGuest,
          xp: profile?.xp ?? 0,
          level: profile?.level ?? 1,
          streakCount: profile?.streakCount ?? 0,
          createdAt: u.createdAt,
        };
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching admin users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:userId/role", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const currentUserId = getUserId(req);

      if (!role || !["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "Role must be 'user' or 'admin'" });
      }

      if (userId === currentUserId && role !== "admin") {
        return res.status(400).json({ message: "Cannot remove your own admin role" });
      }

      const targetUser = await db.select().from(users).where(eq(users.id, userId));
      if (targetUser.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser[0].isGuest && role === "admin") {
        return res.status(400).json({ message: "Cannot promote guest to admin" });
      }

      await db.update(users).set({ role }).where(eq(users.id, userId));

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.patch("/api/admin/users/:userId/level", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { userId } = req.params;
      const { level } = req.body;

      if (!level || level < 1 || level > 10) {
        return res.status(400).json({ message: "Level must be between 1 and 10" });
      }

      const profile = await storage.getProfile(userId);

      if (!profile) {
        await storage.upsertProfile({
          userId,
          xp: 0,
          level,
          streakCount: 0,
          streakLastActive: null,
          reviveRemaining: 3,
          reviveResetDate: null,
          unlockedFeatures: ["core"],
          isAdmin: false,
        });
      } else {
        await storage.setUserLevel(userId, level);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error setting user level:", error);
      res.status(500).json({ message: "Failed to set level" });
    }
  });


  // ===== BUDGET ALLOCATIONS =====
  const budgetAllocationSchema = z.object({
    category: z.string().min(1, "Category is required"),
    budgetLimit: z.union([z.string(), z.number()])
      .transform((v) => Number(v))
      .refine((v) => !isNaN(v) && v > 0, "Budget limit must be a positive number")
      .transform(String),
    month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be in YYYY-MM format"),
    note: z.string().nullable().optional(),
  });

  app.get("/api/budget", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const month = (req.query.month as string) || format(new Date(), "yyyy-MM");
      const allocations = await storage.getBudgetAllocationsByMonth(userId, month);
      res.json(allocations);
    } catch (error) {
      console.error("Error fetching budget allocations:", error);
      res.status(500).json({ message: "Failed to fetch budget allocations" });
    }
  });

  app.post("/api/budget", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const parsed = budgetAllocationSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });

      const { category, budgetLimit, month, note } = parsed.data;
      const allocation = await storage.upsertBudgetAllocation({
        userId,
        category,
        budgetLimit,
        month,
        note: note || null,
      });
      res.json(allocation);
    } catch (error) {
      console.error("Error creating budget allocation:", error);
      res.status(500).json({ message: "Failed to create budget allocation" });
    }
  });

  app.delete("/api/budget/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteBudgetAllocation(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting budget allocation:", error);
      res.status(500).json({ message: "Failed to delete budget allocation" });
    }
  });

  app.get("/api/budget/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const month = (req.query.month as string) || format(new Date(), "yyyy-MM");
      const profile = await ensureProfile(userId);
      const monthlyIncome = Number(profile.monthlyIncome || 0);

      const allocations = await storage.getBudgetAllocationsByMonth(userId, month);
      const totalAllocated = allocations.reduce((s, a) => s + Number(a.budgetLimit), 0);

      // Compute date range based on cycle settings
      const budgetPlan = await storage.getBudgetPlan(userId, month);
      const cycleType = budgetPlan?.cycleType || "monthly";
      const cycleStartDay = Number(budgetPlan?.cycleStartDay || 1);
      let monthStart: string;
      let monthEnd: string;
      if (cycleType === "custom" && cycleStartDay > 1) {
        const today = new Date();
        const todayDay = today.getDate();
        let cycleStartDate: Date;
        if (todayDay >= cycleStartDay) {
          cycleStartDate = new Date(today.getFullYear(), today.getMonth(), cycleStartDay);
        } else {
          cycleStartDate = new Date(today.getFullYear(), today.getMonth() - 1, cycleStartDay);
        }
        const cycleEndDate = new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, cycleStartDay - 1);
        monthStart = format(cycleStartDate, "yyyy-MM-dd");
        monthEnd = format(cycleEndDate, "yyyy-MM-dd");
      } else {
        const [year, mon] = month.split("-").map(Number);
        const lastDay = new Date(year, mon, 0).getDate();
        monthStart = `${month}-01`;
        monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
      }

      const txs = await storage.getTransactionsByDateRange(userId, monthStart, monthEnd);
      const expenses = txs.filter(t => t.type === "expense");

      const depositsByGoal: Record<string, number> = {};
      txs
        .filter(t => t.category === "Savings" && t.note?.startsWith("Deposit to "))
        .forEach(t => {
          const goalName = t.note!.replace("Deposit to ", "");
          depositsByGoal[goalName] = (depositsByGoal[goalName] || 0) + Number(t.amount);
        });

      const txCategoryToBudgetKey: Record<string, string[]> = {
        "Food & Drinks": ["food"],
        "Transportation": ["transport"],
        "Shopping": ["online_shopping", "lifestyle"],
        "Entertainment": ["entertainment", "hangout", "hobby"],
        "Bills & Utilities": ["electricity", "water"],
        "Health": ["health"],
        "Education": ["education"],
        "Travel": ["transport"],
        "Investment": ["investment"],
        "Debt Payment": ["loan", "installment"],
        "Insurance": ["insurance"],
        "Tax": ["tax"],
        "Savings": ["savings"],
        "Other": [],
        "Housing": ["housing"],
        "Electricity": ["electricity"],
        "Water": ["water"],
        "Hangout": ["hangout"],
        "Snacks": ["snacks"],
        "Hobby": ["hobby"],
        "Lifestyle": ["lifestyle"],
        "Online Shopping": ["online_shopping"],
        "Other Needs": [],
      };

      const spentByBudgetKey: Record<string, number> = {};
      const spentByCategory: Record<string, number> = {};
      expenses.forEach(t => {
        const cat = t.category || "Other";
        const amt = Number(t.amount);
        spentByCategory[cat] = (spentByCategory[cat] || 0) + amt;
        const mappedKeys = txCategoryToBudgetKey[cat];
        // Known categories with empty mapping → ignored (e.g. "Other Needs")
        // Unknown/custom categories (not in map at all) → use category name as budget key
        const keys = mappedKeys !== undefined ? mappedKeys : [cat];
        if (keys.length > 0) {
          const share = amt / keys.length;
          keys.forEach(k => {
            spentByBudgetKey[k] = (spentByBudgetKey[k] || 0) + share;
          });
        }
      });

      const categoryDetails = allocations.map(a => {
        const spent = spentByBudgetKey[a.category] || 0;
        const limit = Number(a.budgetLimit);
        return {
          id: a.id,
          category: a.category,
          budgetLimit: limit,
          spent,
          remaining: limit - spent,
          overBudget: spent > limit,
          note: a.note,
        };
      });

      const totalSpent = expenses.reduce((s, t) => s + Number(t.amount), 0);

      res.json({
        month,
        monthlyIncome,
        totalAllocated,
        totalSpent,
        remaining: monthlyIncome - totalAllocated,
        overIncome: totalAllocated > monthlyIncome && monthlyIncome > 0,
        categories: categoryDetails,
        spentByCategory: spentByBudgetKey,
        depositsByGoal,
        cycleType,
        cycleStartDay,
        periodStart: monthStart,
        periodEnd: monthEnd,
      });
    } catch (error) {
      console.error("Error fetching budget summary:", error);
      res.status(500).json({ message: "Failed to fetch budget summary" });
    }
  });

  // ===== BUDGET PLAN =====
  app.get("/api/budget-plan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const month = (req.query.month as string) || format(new Date(), "yyyy-MM");
      const plan = await storage.getBudgetPlan(userId, month);
      res.json(plan || null);
    } catch (error) {
      console.error("Error fetching budget plan:", error);
      res.status(500).json({ message: "Failed to fetch budget plan" });
    }
  });

  app.post("/api/budget-plan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { month, income, strategy, needsAmount, wantsAmount, savingsAmount, investmentAmount, cycleType, cycleStartDay } = req.body;
      if (!month || income === undefined) return res.status(400).json({ message: "month and income required" });
      const plan = await storage.upsertBudgetPlan({
        userId,
        month,
        income: String(income),
        strategy: strategy || "percentage",
        needsAmount: String(needsAmount || 0),
        wantsAmount: String(wantsAmount || 0),
        savingsAmount: String(savingsAmount || 0),
        investmentAmount: String(investmentAmount || 0),
        cycleType: cycleType || "monthly",
        cycleStartDay: cycleStartDay != null ? Number(cycleStartDay) : 1,
      });
      await storage.updateProfile(userId, { monthlyIncome: String(income) });
      res.json(plan);
    } catch (error) {
      console.error("Error saving budget plan:", error);
      res.status(500).json({ message: "Failed to save budget plan" });
    }
  });

  app.delete("/api/budget-plan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const month = (req.query.month as string) || format(new Date(), "yyyy-MM");
      await storage.deleteBudgetPlan(userId, month);
      await storage.updateProfile(userId, { monthlyIncome: "0" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting budget plan:", error);
      res.status(500).json({ message: "Failed to delete budget plan" });
    }
  });

  // ===== CUSTOM CATEGORIES =====
  app.get("/api/custom-categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const cats = await storage.getCustomCategoriesByUser(userId);
      res.json(cats);
    } catch (error) {
      console.error("Error fetching custom categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  app.post("/api/custom-categories", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { name, emoji, type } = req.body;
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: "Category name is required" });
      }
      const cat = await storage.createCustomCategory({
        userId,
        name: name.trim(),
        emoji: emoji || "📌",
        type: type || "expense",
      });
      res.json(cat);
    } catch (error) {
      console.error("Error creating custom category:", error);
      res.status(500).json({ message: "Failed to create category" });
    }
  });

  app.delete("/api/custom-categories/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const id = parseInt(req.params.id);
      await storage.deleteCustomCategory(id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting custom category:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // ===== DAILY FOCUS =====
  // checkFocusCompletion: Auto-checks if a focus mission is complete.
  // Completion criteria per type:
  // - log_transaction: at least 1 transaction today
  // - save_money: deposit to goal-linked account or direct goal deposit today
  // - check_debt_health: visited /debt page today (xp log with reason "visited_debt_health")
  // - review_goals: visited /goals page today (xp log with reason "visited_goals")
  async function checkFocusCompletion(userId: string, focus: { id: number; type: string; completed: boolean; rewardXp: number }) {
    if (focus.completed) return true;

    const today = format(new Date(), "yyyy-MM-dd");
    let isComplete = false;

    switch (focus.type) {
      case "log_transaction": {
        const count = await storage.getTodayTransactionCount(userId, today);
        isComplete = count >= 1;
        break;
      }
      case "save_money": {
        const todayTxs = await storage.getTransactionsByDateRange(userId, today, today);
        const goals = await storage.getGoalsByUser(userId);
        const goalAccountIds = goals.map(g => g.accountId).filter(Boolean);
        isComplete = todayTxs.some(t => t.type === "income" && t.toAccountId && goalAccountIds.includes(t.toAccountId));
        if (!isComplete) {
          isComplete = await storage.hasDepositToday(userId, today);
        }
        break;
      }
      case "check_debt_health": {
        const xpLogs = await storage.getXpLogsByUser(userId);
        isComplete = xpLogs.some(l => l.reason === "visited_debt_health" && l.createdAt && format(l.createdAt, "yyyy-MM-dd") === today);
        break;
      }
      case "review_goals": {
        const xpLogs2 = await storage.getXpLogsByUser(userId);
        isComplete = xpLogs2.some(l => l.reason === "visited_goals" && l.createdAt && format(l.createdAt, "yyyy-MM-dd") === today);
        break;
      }
    }

    if (isComplete) {
      await storage.completeDailyFocus(focus.id, userId);
      await storage.addXp(userId, focus.rewardXp, "daily_focus");
    }

    return isComplete;
  }

  // GET /api/daily-focus: Returns today's 3 missions.
  // If none exist yet for today, generates 3 random from FOCUS_TYPES pool.
  // Uses deterministic shuffle based on day-of-year for consistency.
  // After returning, auto-checks completion status of each mission.
  app.get("/api/daily-focus", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const today = format(new Date(), "yyyy-MM-dd");
      let focusList = await storage.getDailyFocusList(userId, today);

      if (focusList.length === 0) {
        const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        const shuffled = [...FOCUS_TYPES].sort((a, b) => {
          const ha = ((dayOfYear * 31 + FOCUS_TYPES.indexOf(a)) % 97);
          const hb = ((dayOfYear * 31 + FOCUS_TYPES.indexOf(b)) % 97);
          return ha - hb;
        });
        const chosen = shuffled.slice(0, 3);

        for (const c of chosen) {
          await storage.createDailyFocus({
            userId,
            date: today,
            type: c.type,
            conditionValue: null,
            rewardXp: c.rewardXp,
            completed: false,
          });
        }
        focusList = await storage.getDailyFocusList(userId, today);
      }

      for (const focus of focusList) {
        if (!focus.completed) {
          const completed = await checkFocusCompletion(userId, focus);
          if (completed) {
            const updated = await storage.getDailyFocusList(userId, today);
            const refreshed = updated.find(f => f.id === focus.id);
            if (refreshed) {
              Object.assign(focus, refreshed);
            }
          }
        }
      }

      res.json(focusList);
    } catch (error) {
      console.error("Error fetching daily focus:", error);
      res.status(500).json({ message: "Failed to fetch daily focus" });
    }
  });

  app.get("/api/badges", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const allBadges = await storage.getAllBadges();
      const userBadgeList = await storage.getUserBadges(userId);
      const unlockedIds = new Set(userBadgeList.map(ub => ub.badgeId));

      const result = allBadges.map(b => ({
        ...b,
        unlocked: unlockedIds.has(b.id),
        unlockedAt: userBadgeList.find(ub => ub.badgeId === b.id)?.unlockedAt || null,
      }));

      res.json(result);
    } catch (error) {
      console.error("Error fetching badges:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.post("/api/badges/check", async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const newlyAwarded = await checkAndAwardBadges(userId);
      res.json({ newlyAwarded });
    } catch (error) {
      console.error("Error checking badges:", error);
      res.status(500).json({ message: "Failed to check badges" });
    }
  });

  // ===== GUEST LOGIN =====
  app.post("/api/guest-login", async (req, res) => {
    try {
      const guestId = uuidv4();
      const { primaryGoal, habitType, focusAreas } = req.body;

      const [user] = await db.insert(users).values({
        id: guestId,
        email: null,
        firstName: "Guest",
        lastName: null,
        profileImageUrl: null,
        isGuest: true,
      }).returning();

      await storage.upsertProfile({
        userId: guestId,
        xp: 0,
        level: 1,
        streakCount: 0,
        streakLastActive: null,
        reviveRemaining: 3,
        reviveResetDate: null,
        unlockedFeatures: ["core"],
        isAdmin: false,
        primaryGoal: primaryGoal || null,
        habitType: habitType || null,
        focusAreas: focusAreas || [],
      });

      (req.session as any).user = user;
      (req.session as any).isGuest = true;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save guest session" });
        }
        res.json(user);
      });
    } catch (error) {
      console.error("Error creating guest login:", error);
      res.status(500).json({ message: "Failed to create guest session" });
    }
  });

  // ===== SAVE ONBOARDING DATA =====
  app.post("/api/onboarding", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { primaryGoal, habitType, focusAreas } = req.body;

      await ensureProfile(userId);
      await storage.updateProfile(userId, {
        primaryGoal: primaryGoal || null,
        habitType: habitType || null,
        focusAreas: focusAreas || [],
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving onboarding:", error);
      res.status(500).json({ message: "Failed to save onboarding data" });
    }
  });

  // ===== FINANCE SCORE (REALTIME) =====
  app.get("/api/finance-score", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await ensureProfile(userId);
      const txs = await storage.getTransactionsByUser(userId);
      const goals = await storage.getGoalsByUser(userId);

      const totalTransactions = txs.length;

      const TRANSACTIONS_NEEDED = 5;

      if (totalTransactions < TRANSACTIONS_NEEDED) {
        res.json({
          totalScore: null,
          warmingUp: true,
          title: null,
          tier: null,
          transactionCount: totalTransactions,
          transactionsNeeded: TRANSACTIONS_NEEDED,
          breakdown: { needs: null, wants: null, savings: null, savingsMessage: null, consistency: null, consistencyMessage: null },
        });
        return;
      }

      const now = new Date();
      const currentMonth = format(now, "yyyy-MM");
      const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

      const budgetPlan = await storage.getBudgetPlan(userId, currentMonth);
      const income = budgetPlan
        ? Number(budgetPlan.income)
        : Number(profile.monthlyIncome || 0);

      const monthTxs = txs.filter(t => t.date >= monthStart && t.date <= monthEnd);
      const monthExpenses = monthTxs.filter(t => t.type === "expense");

      const txCategoryToBudgetKey2: Record<string, string[]> = {
        "Food & Drinks": ["food"],
        "Transportation": ["transport"],
        "Shopping": ["online_shopping", "lifestyle"],
        "Entertainment": ["entertainment", "hangout", "hobby"],
        "Bills & Utilities": ["electricity", "water"],
        "Health": ["health"],
        "Education": ["education"],
        "Travel": ["transport"],
        "Investment": ["investment"],
        "Debt Payment": ["loan", "installment"],
        "Insurance": ["insurance"],
        "Tax": ["tax"],
        "Savings": ["savings"],
        "Other": [],
        "Housing": ["housing"],
        "Electricity": ["electricity"],
        "Water": ["water"],
        "Hangout": ["hangout"],
        "Snacks": ["snacks"],
        "Hobby": ["hobby"],
        "Lifestyle": ["lifestyle"],
        "Online Shopping": ["online_shopping"],
        "Other Needs": [],
      };

      const needsKeys = new Set(["food", "snacks", "transport", "housing", "electricity", "water", "health", "education"]);
      const wantsKeys = new Set(["online_shopping", "hangout", "entertainment", "hobby", "lifestyle"]);
      const savingsKeys = new Set(["savings", "insurance", "installment", "investment", "loan", "tax"]);

      let needsExpense = 0, wantsExpense = 0, savingsExpense = 0;
      monthExpenses.forEach(t => {
        const cat = t.category || "Other";
        const amt = Number(t.amount);
        const keys = txCategoryToBudgetKey2[cat] || [];
        if (keys.length === 0) return;
        const share = amt / keys.length;
        keys.forEach(k => {
          if (needsKeys.has(k)) needsExpense += share;
          else if (wantsKeys.has(k)) wantsExpense += share;
          else if (savingsKeys.has(k)) savingsExpense += share;
        });
      });

      let needsScore: number | null = null;
      if (income > 0) {
        const r = needsExpense / income;
        if (r <= 0.50) needsScore = 30;
        else if (r <= 0.60) needsScore = 25;
        else if (r <= 0.70) needsScore = 20;
        else if (r <= 0.80) needsScore = 10;
        else needsScore = 5;
      }

      let wantsScore: number | null = null;
      if (income > 0) {
        const r = wantsExpense / income;
        if (r <= 0.20) wantsScore = 25;
        else if (r <= 0.30) wantsScore = 20;
        else if (r <= 0.40) wantsScore = 15;
        else if (r <= 0.50) wantsScore = 8;
        else wantsScore = 3;
      }

      const hasGoals = goals.length > 0;
      let savingsScore: number | null = null;
      let savingsMessage: string | null = null;
      if (!hasGoals) {
        savingsMessage = "Buat target tabungan untuk mengaktifkan skor tabungan";
      } else if (income > 0) {
        const r = savingsExpense / income;
        if (r >= 0.30) savingsScore = 25;
        else if (r >= 0.20) savingsScore = 20;
        else if (r >= 0.10) savingsScore = 15;
        else if (r >= 0.05) savingsScore = 10;
        else savingsScore = 5;
      }

      const daysInMonth = endOfMonth(now).getDate();
      const activeDates = new Set(monthTxs.map(t => t.date));
      const activeDays = activeDates.size;
      const consistencyScore: number = activeDays >= 3
        ? Math.min(20, Math.round((activeDays / daysInMonth) * 20))
        : 0;
      const consistencyMessage: string | null = activeDays < 3
        ? "Catat transaksi beberapa hari lagi untuk menghitung konsistensi"
        : null;

      const components = [needsScore, wantsScore, savingsScore, consistencyScore].filter(v => v !== null) as number[];
      const totalScore = components.length > 0
        ? Math.min(100, Math.max(0, components.reduce((a, b) => a + b, 0)))
        : null;

      let tierTitle: string | null = null;
      if (totalScore !== null) {
        if (totalScore >= 85) tierTitle = "Platinum";
        else if (totalScore >= 70) tierTitle = "Gold";
        else if (totalScore >= 50) tierTitle = "Silver";
        else if (totalScore >= 30) tierTitle = "Bronze";
        else tierTitle = "Financial Rookie";
      }

      res.json({
        totalScore,
        warmingUp: false,
        title: tierTitle,
        tier: tierTitle,
        transactionCount: totalTransactions,
        transactionsNeeded: TRANSACTIONS_NEEDED,
        breakdown: {
          needs: needsScore,
          wants: wantsScore,
          savings: savingsScore,
          savingsMessage,
          consistency: consistencyScore,
          consistencyMessage,
        },
      });
    } catch (error) {
      console.error("Error calculating finance score:", error);
      res.status(500).json({ message: "Failed to calculate finance score" });
    }
  });

  // ===== SCORE BONUS XP =====
  app.post("/api/score-bonus", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { delta } = req.body;

      if (!delta || delta < 1) {
        return res.status(400).json({ message: "Score delta must be >= 1" });
      }

      const profile = await ensureProfile(userId);
      const today = format(new Date(), "yyyy-MM-dd");

      let usedToday = 0;
      if (profile.scoreBonusDate === today) {
        usedToday = profile.scoreBonusToday || 0;
      }

      if (usedToday >= 20) {
        return res.json({ bonusXp: 0, message: "Daily bonus limit reached" });
      }

      const clampedDelta = Math.min(delta, 5);
      const rawBonus = clampedDelta * 2;
      const bonusXp = Math.min(rawBonus, 20 - usedToday);

      if (bonusXp > 0) {
        await storage.addXp(userId, bonusXp, "score_bonus");
        await storage.updateProfile(userId, {
          scoreBonusToday: usedToday + bonusXp,
          scoreBonusDate: today,
        });
      }

      res.json({ bonusXp });
    } catch (error) {
      console.error("Error awarding score bonus:", error);
      res.status(500).json({ message: "Failed to award score bonus" });
    }
  });

}
