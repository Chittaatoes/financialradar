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
import { userProfiles, stockHoldings, transactions, forexTrades, tradingRules, tradingStatsDaily, tradingRiskSettings } from "../../shared/schema";
import { eq, sql, count, and, like, gte, lte } from "drizzle-orm";
import { parseForexTrades } from "../services/forex-parser";

// === REQUEST VALIDATION SCHEMAS ===
// Zod schemas for validating POST/PATCH request bodies before database operations.
const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["cash", "bank", "ewallet"]),
  balance: z.union([z.string(), z.number()]).transform(String),
});

const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer", "investment"]),
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

// ── Simple per-user server-side cache ──────────────────────────────────
// Avoids hammering Supabase with the same expensive query within a short window.
const serverCache = new Map<string, { data: unknown; ts: number }>();
const SERVER_CACHE_TTL = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const hit = serverCache.get(key);
  if (hit && Date.now() - hit.ts < SERVER_CACHE_TTL) return hit.data as T;
  return null;
}
function setCached(key: string, data: unknown) {
  serverCache.set(key, { data, ts: Date.now() });
}
function burstCacheForUser(userId: string) {
  for (const k of serverCache.keys()) {
    if (k.startsWith(`${userId}:`)) serverCache.delete(k);
  }
}
// ───────────────────────────────────────────────────────────────────────

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
      const cKey = `${userId}:dashboard`;
      const cached = getCached<object>(cKey);
      if (cached) return res.json(cached);

      const accts = await storage.getAccountsByUser(userId);
      const allGoals = await storage.getGoalsByUser(userId);
      const today = format(new Date(), "yyyy-MM-dd");

      const totalCash = accts.filter(a => a.type === "cash").reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const totalBank = accts.filter(a => a.type === "bank").reduce((s, a) => s + parseFloat(String(a.balance)), 0);
      const totalEwallet = accts.filter(a => a.type === "ewallet").reduce((s, a) => s + parseFloat(String(a.balance)), 0);

      const activeGoals = allGoals.filter(g => parseFloat(String(g.currentAmount)) < parseFloat(String(g.targetAmount)));
      const totalSaving = allGoals.reduce((s, g) => s + parseFloat(String(g.currentAmount)), 0);
      const totalTarget = allGoals.reduce((s, g) => s + parseFloat(String(g.targetAmount)), 0);
      const goalProgress = totalTarget > 0 ? Math.min((totalSaving / totalTarget) * 100, 100) : 0;

      const holdings = await db.select().from(stockHoldings).where(eq(stockHoldings.userId, userId));
      const totalStock = holdings.reduce((s, h) => s + Number(h.avgPrice) * Number(h.lots) * 100, 0);

      const totalAssets = totalCash + totalBank + totalEwallet + totalSaving + totalStock;

      const lastActiveGoal = await storage.getLastActiveGoal(userId);

      const existingLog = await storage.getStreakLogForDate(userId, today);

      const result = {
        totalAssets,
        totalCash,
        totalBank,
        totalEwallet,
        totalSaving,
        totalStock,
        totalTarget,
        goalProgress,
        todayInteracted: !!existingLog,
        lastActiveGoal: lastActiveGoal || null,
      };
      setCached(cKey, result);
      res.json(result);
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
      burstCacheForUser(userId);
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
      burstCacheForUser(userId);
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

      if ((tx.type === "expense" || tx.type === "investment") && tx.fromAccountId) {
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
      burstCacheForUser(userId);
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

      if ((type === "expense" || type === "transfer" || type === "investment") && !fromAccountId) {
        return res.status(400).json({ message: "Source account is required for expense, transfer, and investment transactions" });
      }
      if ((type === "income" || type === "transfer") && !toAccountId) {
        return res.status(400).json({ message: "Destination account is required for income and transfer transactions" });
      }

      if (fromAccountId) {
        const fromAcct = await storage.getAccount(fromAccountId, userId);
        if (!fromAcct) return res.status(403).json({ message: "From account not found or not owned by you" });
        if ((type === "expense" || type === "transfer" || type === "investment") && parseFloat(String(fromAcct.balance)) < parseFloat(amount)) {
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
      } else if ((type === "expense" || type === "investment") && fromAccountId) {
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");
      } else if (type === "transfer" && fromAccountId && toAccountId) {
        await storage.updateAccountBalance(fromAccountId, String(amount), "subtract");
        await storage.updateAccountBalance(toAccountId, String(amount), "add");
      }

      let xp = 5;
      if (category && note) xp += 3;
      await processInteraction(userId, xp, "transaction");
      await checkAndAwardBadges(userId);
      burstCacheForUser(userId);

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
      const [planYear, planMon] = month.split("-").map(Number);
      if (cycleType === "custom" && budgetPlan?.cycleStartDate) {
        // Use stored full start date for precise cycle calculation (e.g. "2026-02-28" → Feb 28 → Mar 27)
        const parts = budgetPlan.cycleStartDate.split("-").map(Number);
        const cycleStart = new Date(parts[0], parts[1] - 1, parts[2]);
        const cycleEnd = new Date(parts[0], parts[1], parts[2] - 1);
        monthStart = format(cycleStart, "yyyy-MM-dd");
        monthEnd = format(cycleEnd, "yyyy-MM-dd");
      } else {
        const lastDay = new Date(planYear, planMon, 0).getDate();
        monthStart = `${month}-01`;
        monthEnd = `${month}-${String(lastDay).padStart(2, "0")}`;
      }

      const txs = await storage.getTransactionsByDateRange(userId, monthStart, monthEnd);
      const expenses = txs.filter(t => t.type === "expense");
      const cycleIncome = txs
        .filter(t => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);

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

      const planIncome = Number(budgetPlan?.income || 0);
      const effectiveIncome = planIncome > 0 ? planIncome : monthlyIncome;

      res.json({
        month,
        monthlyIncome,
        planIncome,
        totalAllocated,
        totalSpent,
        remaining: effectiveIncome - totalAllocated,
        overIncome: totalAllocated > effectiveIncome && effectiveIncome > 0,
        categories: categoryDetails,
        spentByCategory: spentByBudgetKey,
        depositsByGoal,
        cycleType,
        cycleStartDay,
        cycleIncome,
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
      const { month, income, strategy, needsAmount, wantsAmount, savingsAmount, investmentAmount, cycleType, cycleStartDay, cycleStartDate } = req.body;
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
        cycleStartDate: cycleStartDate || null,
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

  // ===== MACRO RADAR — external API proxies (cached 5 min) =====
  const _macroCache = new Map<string, { data: unknown; ts: number }>();
  const _MACRO_TTL = 5 * 60 * 1000;

  async function _macroFetch(key: string, url: string): Promise<unknown> {
    const now = Date.now();
    const hit = _macroCache.get(key);
    if (hit && now - hit.ts < _MACRO_TTL) return hit.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
      const data = await resp.json();
      _macroCache.set(key, { data, ts: now });
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  app.get("/api/macro-radar/events", async (req, res) => {
    try {
      const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
      const raw = await _macroFetch("ff_events", url) as any[];
      const cutoff = Date.now() - 60_000;
      const events = (Array.isArray(raw) ? raw : [])
        .filter((e: any) => e.impact === "High" && new Date(e.date).getTime() >= cutoff)
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 20)
        .map((e: any) => ({
          event:    e.title ?? e.event ?? "",
          country:  e.country ?? "",
          currency: e.country ?? "",
          date:     e.date,
          impact:   e.impact,
          actual:   e.actual   !== undefined && e.actual   !== "" ? e.actual   : null,
          forecast: e.forecast !== undefined && e.forecast !== "" ? e.forecast : null,
          previous: e.previous !== undefined && e.previous !== "" ? e.previous : null,
        }));
      res.json(events);
    } catch (err: any) {
      console.error("macro-radar/events:", err.message);
      res.status(200).json([]);
    }
  });

  // GET /api/macro-radar/past-events — High impact events released this week (with actual data)
  app.get("/api/macro-radar/past-events", async (_req, res) => {
    try {
      const url = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
      const raw = await _macroFetch("ff_events", url) as any[];
      const cutoff = Date.now() - 60_000;
      const pastEvents = (Array.isArray(raw) ? raw : [])
        .filter((e: any) => {
          const eventTime = new Date(e.date).getTime();
          return (
            e.impact === "High" &&
            eventTime < cutoff &&
            e.actual !== undefined &&
            e.actual !== "" &&
            e.actual !== null
          );
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5)
        .map((e: any) => ({
          event:    e.title ?? e.event ?? "",
          country:  e.country ?? "",
          currency: e.country ?? "",
          date:     e.date,
          impact:   e.impact,
          actual:   e.actual,
          forecast: e.forecast !== undefined && e.forecast !== "" ? e.forecast : null,
          previous: e.previous !== undefined && e.previous !== "" ? e.previous : null,
        }));
      res.json(pastEvents);
    } catch (err: any) {
      console.error("macro-radar/past-events:", err.message);
      res.status(200).json([]);
    }
  });

  app.get("/api/macro-radar/indicators", async (req, res) => {
    // Hardcoded recent values as fallback (updated quarterly – data changes slowly)
    const FALLBACK_RESPONSE = {
      interestRate: { id: "FEDFUNDS", value: 4.33,    prevValue: 4.33,    date: "2025-02-01", isFallback: true },
      inflation:    { id: "CPIAUCSL", value: 315.605, prevValue: 314.175, date: "2025-02-01", isFallback: true },
      moneySupply:  { id: "M2SL",     value: 21634.3, prevValue: 21558.0, date: "2025-02-01", isFallback: true },
      unemployment: { id: "UNRATE",   value: 4.1,     prevValue: 4.0,     date: "2025-02-01", isFallback: true },
    };

    const FRED_KEY = process.env.FRED_API_KEY ?? "77095150d0e19bd97aab68640aef28d5";

    try {
      const ids = ["FEDFUNDS", "CPIAUCSL", "M2SL", "UNRATE"];
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=3`;
            const data = await _macroFetch(`fred_${id}`, url) as any;
            const obs: any[] = (data?.observations ?? []).filter((o: any) => o.value !== ".");
            if (!obs.length) return null;
            return {
              id,
              value:     obs[0] ? parseFloat(obs[0].value) : null,
              prevValue: obs[1] ? parseFloat(obs[1].value) : null,
              date:      obs[0]?.date ?? null,
              isFallback: false,
            };
          } catch (seriesErr: any) {
            console.error(`FRED fetch error for ${id}:`, seriesErr.message);
            return null;
          }
        })
      );

      const interestRate = results.find((r) => r?.id === "FEDFUNDS") ?? FALLBACK_RESPONSE.interestRate;
      const inflation    = results.find((r) => r?.id === "CPIAUCSL") ?? FALLBACK_RESPONSE.inflation;
      const moneySupply  = results.find((r) => r?.id === "M2SL")     ?? FALLBACK_RESPONSE.moneySupply;
      const unemployment = results.find((r) => r?.id === "UNRATE")   ?? FALLBACK_RESPONSE.unemployment;

      res.status(200).json({ interestRate, inflation, moneySupply, unemployment });
    } catch (err: any) {
      console.error("macro-radar/indicators:", err.message);
      res.status(200).json(FALLBACK_RESPONSE);
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

  // ══════════════════════════════════════════════════════
  // MARKET FEATURE
  // ══════════════════════════════════════════════════════

  // Cache simple in-memory (5 min TTL)
  const marketCache: Record<string, { data: unknown; ts: number }> = {};
  const CACHE_TTL = 5 * 60 * 1000;

  function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = marketCache[key];
    if (hit && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data as T);
    return fn().then(data => { marketCache[key] = { data, ts: Date.now() }; return data; });
  }

  const translationCache = new Map<string, string>();

  async function translateToID(text: string): Promise<string> {
    if (translationCache.has(text)) return translationCache.get(text)!;
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=id&dt=t&q=${encodeURIComponent(text)}`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) });
      const data = await r.json() as unknown[][];
      const translated = (data[0] as unknown[][]).map((seg: unknown[]) => seg[0]).join("") || text;
      translationCache.set(text, translated);
      return translated;
    } catch {
      return text;
    }
  }

  // GET /api/market/prices — USD/IDR, Gold, BTC, ETH
  // Primary: CryptoCompare (reliable from cloud IPs, no key needed for basic use)
  // Fallback: CoinGecko with headers, open.er-api for USD/IDR
  app.get("/api/market/prices", isAuthenticated, async (_req, res) => {
    try {
      const bucket = Math.floor(Date.now() / (5 * 60_000));
      const data = await cached(`market_prices_${bucket}`, async () => {
        const TO = 8_000;
        const CC_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; FinancialRadar/1.0)", "Accept": "application/json" };

        const [ccCryptoRes, fxRes, fxFallbackRes] = await Promise.all([
          // CryptoCompare: BTC, ETH, PAXG (gold) all in IDR — reliable from cloud servers
          fetch("https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BTC,ETH,PAXG&tsyms=IDR,USD", { signal: AbortSignal.timeout(TO), headers: CC_HEADERS }).catch(() => null),
          // Primary USD/IDR: open.er-api (free, no key, no cloud restrictions)
          fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(TO) }).catch(() => null),
          // Fallback USD/IDR: Frankfurter
          fetch("https://api.frankfurter.app/latest?from=USD&to=IDR", { signal: AbortSignal.timeout(TO) }).catch(() => null),
        ]);

        // ── USD/IDR ──────────────────────────────────────────────────────────
        const erData  = fxRes?.ok      ? await fxRes.json()        as { rates?: { IDR?: number } } : null;
        const fxData  = fxFallbackRes?.ok ? await fxFallbackRes.json() as { rates?: { IDR?: number } } : null;
        const usdIdr  = erData?.rates?.IDR ?? fxData?.rates?.IDR ?? 16_800;

        // ── CryptoCompare: BTC, ETH, PAXG ────────────────────────────────────
        type CCRaw = { RAW?: Record<string, { IDR?: { PRICE?: number; CHANGEPCT24HOUR?: number } }> };
        const ccData = ccCryptoRes?.ok ? await ccCryptoRes.json() as CCRaw : null;
        const ccRaw  = ccData?.RAW ?? {};

        let btcIdr    = Math.round(ccRaw.BTC?.IDR?.PRICE    ?? 0);
        let ethIdr    = Math.round(ccRaw.ETH?.IDR?.PRICE    ?? 0);
        let btcChange = ccRaw.BTC?.IDR?.CHANGEPCT24HOUR      ?? 0;
        let ethChange = ccRaw.ETH?.IDR?.CHANGEPCT24HOUR      ?? 0;
        const paxgIdr = ccRaw.PAXG?.IDR?.PRICE               ?? 0;
        let goldGram  = paxgIdr > 0 ? Math.round(paxgIdr / 31.1035) : 0;
        let goldChange = ccRaw.PAXG?.IDR?.CHANGEPCT24HOUR    ?? 0;

        // ── CoinGecko fallback (for any missing values) ───────────────────────
        if (btcIdr === 0 || ethIdr === 0 || goldGram === 0) {
          try {
            const cgRes = await fetch(
              "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,pax-gold&vs_currencies=usd,idr&include_24hr_change=true",
              { signal: AbortSignal.timeout(TO), headers: CC_HEADERS }
            );
            if (cgRes.ok) {
              const cg = await cgRes.json() as Record<string, Record<string, number>>;
              if (btcIdr === 0) {
                btcIdr    = Math.round(cg?.bitcoin?.idr     ?? 0);
                btcChange = cg?.bitcoin?.idr_24h_change      ?? 0;
              }
              if (ethIdr === 0) {
                ethIdr    = Math.round(cg?.ethereum?.idr    ?? 0);
                ethChange = cg?.ethereum?.idr_24h_change     ?? 0;
              }
              if (goldGram === 0) {
                const paxg = cg?.["pax-gold"]?.idr ?? 0;
                goldGram   = paxg > 0 ? Math.round(paxg / 31.1035) : 0;
                goldChange = cg?.["pax-gold"]?.idr_24h_change ?? 0;
              }
            }
          } catch {
            // CoinGecko fallback failed silently
          }
        }

        // ── Compute USD/IDR 24h change via er-api (today vs yesterday) ────────
        let usdChange = 0;
        try {
          const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
          const yRes = await fetch(`https://api.frankfurter.app/${yesterday}?from=USD&to=IDR`, { signal: AbortSignal.timeout(TO) }).catch(() => null);
          const yData = yRes?.ok ? await yRes.json() as { rates?: { IDR?: number } } : null;
          const usdYest = yData?.rates?.IDR ?? usdIdr;
          usdChange = parseFloat((((usdIdr - usdYest) / usdYest) * 100).toFixed(3));
        } catch { /* ignore */ }

        return {
          usdIdr: Math.round(usdIdr),
          goldGram,
          bitcoin: btcIdr,
          ethereum: ethIdr,
          btcChange,
          ethChange,
          goldChange,
          usdChange,
          updatedAt: new Date().toISOString(),
        };
      });
      res.json(data);
    } catch (err) {
      console.error("Market prices error:", err);
      res.status(500).json({ message: "Failed to fetch market prices" });
    }
  });

  // GET /api/market/news — financial news from CryptoCompare (free) + GNews
  app.get("/api/market/news", isAuthenticated, async (req, res) => {
    try {
      const lang = (req.query.lang as string) || "id";
      const GNEWS_KEY = process.env.GNEWS_API_KEY;

      const detectImpact = (title: string, body = ""): "high" | "medium" | "low" => {
        const t = (title + " " + body).toLowerCase();
        const HIGH = [
          "crash", "collapse", "surge", "soar", "plunge", "pump", "dump", "all-time high", "ath",
          "record", "ban", "etf approved", "sec", "federal reserve", "rate hike", "rate cut",
          "naik tajam", "turun drastis", "krisis", "suku bunga", "inflasi tinggi", "resesi",
          "breakout", "breakdown", "liquidation", "halving", "hack", "exploit", "sanctions",
          "war", "geopolit", "perang", "gold rally", "emas naik", "bitcoin rally",
        ];
        const MED = [
          "bitcoin", "btc", "ethereum", "eth", "gold", "emas", "dollar", "usd", "idr", "rupiah",
          "forex", "crypto", "blockchain", "defi", "nft", "market", "trading", "investasi",
          "saham", "obligasi", "inflation", "gdp", "economy", "bank", "fed", "interest",
        ];
        if (HIGH.some(k => t.includes(k))) return "high";
        if (MED.some(k => t.includes(k))) return "medium";
        return "low";
      };

      type NewsArticle = { title: string; source: string; url: string; publishedAt: string; impact: "high" | "medium" | "low"; fromCC?: boolean };

      const rawData = await cached("market_news_raw", async () => {
        const articles: Array<NewsArticle> = [];

        // ── Source 1: CryptoCompare (free, no key, crypto + gold + forex news) ──
        try {
          const ccUrl = "https://data-api.cryptocompare.com/news/v1/article/list?lang=EN&limit=10&categories=BTC,ETH,XAU,MARKET,FOREX";
          const ccRes = await fetch(ccUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (ccRes.ok) {
            const ccJson = await ccRes.json() as { Data?: Array<{ TITLE: string; URL: string; SOURCE_DATA?: { NAME?: string }; PUBLISHED_ON: number; BODY?: string }> };
            const ccItems = (ccJson.Data || []).slice(0, 6);
            for (const a of ccItems) {
              articles.push({
                title: a.TITLE,
                source: a.SOURCE_DATA?.NAME || "CryptoNews",
                url: a.URL,
                publishedAt: new Date(a.PUBLISHED_ON * 1000).toISOString(),
                impact: detectImpact(a.TITLE, a.BODY),
                fromCC: true,
              });
            }
          }
        } catch (e) {
          console.error("[News] CryptoCompare failed:", e);
        }

        // ── Source 2: GNews (focused on gold, dollar, forex, rupiah) ──
        if (GNEWS_KEY) {
          try {
            const queries = [
              `emas+gold+harga`,
              `bitcoin+cryptocurrency+market`,
              `dollar+rupiah+forex`,
            ];
            const query = queries[Math.floor(Date.now() / (10 * 60000)) % queries.length];
            const gnUrl = `https://gnews.io/api/v4/search?q=${query}&lang=id&max=4&sortby=publishedAt&token=${GNEWS_KEY}`;
            const gnRes = await fetch(gnUrl);
            if (gnRes.ok) {
              const gnJson = await gnRes.json() as { articles?: Array<{ title: string; source: { name: string }; url: string; publishedAt: string; content?: string }> };
              for (const a of (gnJson.articles || []).slice(0, 4)) {
                articles.push({
                  title: a.title,
                  source: a.source?.name || "GNews",
                  url: a.url,
                  publishedAt: a.publishedAt,
                  impact: detectImpact(a.title, a.content),
                });
              }
            }
          } catch (e) {
            console.error("[News] GNews failed:", e);
          }
        }

        // ── Sort: high impact first, then by date ──
        const ORDER = { high: 0, medium: 1, low: 2 };
        articles.sort((a, b) => {
          if (ORDER[a.impact] !== ORDER[b.impact]) return ORDER[a.impact] - ORDER[b.impact];
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        });

        // ── Deduplicate by title similarity ──
        const seen = new Set<string>();
        const unique = articles.filter(a => {
          const key = a.title.slice(0, 40).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        return { articles: unique.slice(0, 6) };
      });

      if (lang === "id") {
        const translated = await cached(`market_news_id_${Math.floor(Date.now() / (30 * 60000))}`, async () => {
          const translatedArticles = await Promise.all(
            rawData.articles.map(async (a) => {
              if (!a.fromCC) return a;
              const translatedTitle = await translateToID(a.title);
              return { ...a, title: translatedTitle };
            })
          );
          return { articles: translatedArticles };
        });
        return res.json(translated);
      }

      res.json(rawData);
    } catch (err) {
      console.error("Market news error:", err);
      res.status(500).json({ message: "Failed to fetch news" });
    }
  });

  // ══════════════════════════════════════════════════════
  // AI ADVISOR
  // ══════════════════════════════════════════════════════

  app.post("/api/ai/chat", isAuthenticated, async (req, res) => {
    try {
      const { message, history = [], context = {} } = req.body as {
        message: string;
        history: Array<{ role: string; content: string }>;
        context: {
          totalAssets?: number;
          monthlyIncome?: number;
          monthlyExpense?: number;
          level?: number;
          streakCount?: number;
        };
      };

      if (!message) return res.status(400).json({ message: "Message required" });

      const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
      const HF_KEY = process.env.HUGGINGFACE_API_KEY;

      const formatIDR = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

      const income = context.monthlyIncome ?? 0;
      const expense = context.monthlyExpense ?? 0;
      const surplus = income - expense;
      const savingRatio = income > 0 ? Math.round((surplus / income) * 100) : 0;
      const assets = context.totalAssets ?? 0;

      const savingRateRule = savingRatio > 50
        ? `Saving rate > 50% → kondisi sangat kuat, arahkan ke INVESTASI dan pertumbuhan aset.`
        : savingRatio < 20 && income > 0
        ? `Saving rate < 20% → berikan PERINGATAN tentang pengeluaran dan pola finansial.`
        : expense > income && income > 0
        ? `BAHAYA: pengeluaran melebihi pemasukan → highlight RISIKO ini dengan tegas.`
        : `Saving rate normal (20–50%) → dorong untuk optimasi dan konsistensi.`;

      const systemPrompt = `You are a smart, friendly, and practical personal finance advisor. Always respond in Bahasa Indonesia. You speak like a human, not like a robot.

----------------------------------------
USER DATA (use this when relevant)
----------------------------------------
- Total Asset: ${formatIDR(assets)}
- Monthly Income: ${formatIDR(income)}
- Monthly Expense: ${formatIDR(expense)}
- Saving Rate: ${savingRatio}%

----------------------------------------
RESPONSE MODES (auto detect)
----------------------------------------

1. SMALL TALK (e.g. "halo", "hai", "thanks")
→ Respond naturally like a human, keep it short, lightly guide user back to finance topic
Example: "Halo! Lagi mau cek kondisi keuangan atau ada yang pengen kamu tanyain?"

2. FINANCIAL QUESTION (core mode)
→ Give structured but NATURAL response — do NOT sound like a report, do NOT use rigid labels like "Insight:"
Structure: natural insight sentence → short reasoning with numbers → 1–2 actionable suggestions

3. LIFESTYLE QUESTION (e.g. makan, nongkrong, rekomendasi tempat)
→ Answer normally BUT relate to finance subtly
Example: "Kamu bisa cari makan di kisaran 15–25 ribu biar tetap hemat. Dengan kondisi keuangan kamu sekarang, sebenarnya masih cukup aman, tapi tetap bagus jaga pengeluaran kecil."

4. OUT OF SCOPE (unrelated topics like poetry, coding, etc.)
→ Politely redirect: "Maaf ya, aku fokus bantu soal keuangan dan pengelolaan uang. Kalau ada pertanyaan terkait itu, aku siap bantu!"

----------------------------------------
INTELLIGENCE RULES
----------------------------------------
${savingRateRule}

----------------------------------------
HARD RULES
----------------------------------------
- NEVER repeat the same sentence structure
- NEVER give generic/template answers
- ALWAYS sound natural and conversational
- ALWAYS keep answer concise — no long paragraphs
- ALWAYS use actual Rupiah numbers when reasoning about their finances

----------------------------------------
STYLE
----------------------------------------
- Friendly, like a smart friend
- Slightly casual (not too formal)
- Clear and direct
- Avoid over-explaining`;

      // Gemma (and many free models) don't support role:"system" — inject into first user message
      const historyMessages = history.slice(-6).map((h) => ({ role: h.role as "user" | "assistant", content: h.content }));
      let messages: Array<{ role: "user" | "assistant"; content: string }>;
      if (historyMessages.length > 0) {
        const [firstMsg, ...rest] = historyMessages;
        messages = [
          { role: "user" as const, content: `${systemPrompt}\n\n---\n${firstMsg.content}` },
          ...rest,
          { role: "user" as const, content: message },
        ];
      } else {
        messages = [
          { role: "user" as const, content: `${systemPrompt}\n\n---\n${message}` },
        ];
      }

      if (OPENROUTER_KEY) {
        try {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${OPENROUTER_KEY}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://financialradar.app",
              "X-Title": "Financial Radar",
            },
            body: JSON.stringify({
              model: "google/gemma-3-4b-it:free",
              messages,
              max_tokens: 600,
              temperature: 0.7,
            }),
          });
          const json = await r.json() as { choices?: Array<{ message: { content: string } }>; error?: { message: string } };
          if (!r.ok || json.error) {
            console.error("[OpenRouter] Error:", json.error?.message ?? r.status);
          } else {
            const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
            if (reply) return res.json({ reply, configured: true });
          }
        } catch (err) {
          console.error("[OpenRouter] Fetch failed:", err);
        }
      }

      if (HF_KEY) {
        try {
          const r = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              inputs: messages.map(m => `${m.role === "user" ? "[INST]" : ""}${m.content}${m.role === "user" ? "[/INST]" : ""}`).join("\n"),
              parameters: { max_new_tokens: 400 },
            }),
          });
          if (r.ok) {
            const json = await r.json() as Array<{ generated_text: string }>;
            const raw = json[0]?.generated_text ?? "";
            const reply = raw.split("[/INST]").pop()?.trim() ?? "";
            if (reply) return res.json({ reply, configured: true });
          } else {
            console.error("[HuggingFace] Error:", r.status);
          }
        } catch (err) {
          console.error("[HuggingFace] Fetch failed:", err);
        }
      }

      // Fallback: smart rule-based response using real user data
      let reply = "";
      const lowerMsg = message.toLowerCase();
      const hasData = income > 0;

      if (lowerMsg.includes("analisis") || lowerMsg.includes("pengeluaran") || lowerMsg.includes("kondisi") || lowerMsg.includes("sehat")) {
        if (!hasData) {
          reply = `Belum ada data pemasukan bulan ini di akunmu. Catat dulu pemasukan dan pengeluaranmu agar saya bisa menganalisis kondisi keuanganmu secara akurat! 📊\n\nGunakan fitur Transaksi untuk mulai mencatat.`;
        } else if (savingRatio >= 20) {
          reply = `Kondisi keuanganmu sangat sehat! 🎉 Saving rate-mu ${savingRatio}% — jauh di atas standar ideal 20%. Dari pemasukan ${formatIDR(income)}, kamu berhasil menyimpan ${formatIDR(surplus)} setiap bulan.\n\nTotal aset ${formatIDR(assets)} menunjukkan progress yang solid. Langkah selanjutnya: pastikan kelebihan dana diinvestasikan agar tidak tergerus inflasi. Reksa Dana atau SBN bisa jadi pilihan.`;
        } else if (savingRatio >= 10) {
          reply = `Keuanganmu cukup stabil, tapi masih ada ruang untuk diperbaiki. Saving rate-mu ${savingRatio}% — idealnya 20% dari ${formatIDR(income)} = ${formatIDR(income * 0.2)} per bulan.\n\nKamu perlu menghemat tambahan ${formatIDR(income * 0.2 - surplus)} lagi per bulan. Coba audit pengeluaran: kategori mana yang bisa dipangkas 10-15%?`;
        } else if (savingRatio >= 0) {
          reply = `Perlu perhatian serius! Saving rate-mu hanya ${savingRatio}% — pengeluaran ${formatIDR(expense)} hampir menghabiskan seluruh pemasukan ${formatIDR(income)}.\n\nAksi segera: (1) Sisihkan ${formatIDR(Math.round(income * 0.1))} (10% dulu) di hari pertama gajian. (2) Identifikasi 1 kategori pengeluaran terbesar dan kurangi 20% bulan ini.`;
        } else {
          reply = `⚠️ Defisit! Pengeluaranmu (${formatIDR(expense)}) melebihi pemasukan (${formatIDR(income)}) sebesar ${formatIDR(Math.abs(surplus))} per bulan. Ini tidak berkelanjutan.\n\nAksi darurat: (1) Stop semua pengeluaran non-esensial minggu ini. (2) Cari sumber pendapatan tambahan atau kurangi pengeluaran rutin minimal ${formatIDR(Math.abs(surplus) + income * 0.1)}.`;
        }
      } else if (lowerMsg.includes("nabung") || lowerMsg.includes("tabung") || lowerMsg.includes("saving")) {
        const target20 = hasData ? formatIDR(income * 0.2) : "20% dari gaji";
        const current = hasData ? formatIDR(Math.max(surplus, 0)) : "saat ini";
        reply = `Berdasarkan data kamu, kamu saat ini menabung ${current} per bulan. Target ideal adalah ${target20} (20% dari pemasukan).\n\nStrategi terbaik: "Pay Yourself First" — transfer ${target20} ke rekening tabungan TERPISAH di hari pertama gajian, sebelum bayar apapun. Buat itu otomatis agar tidak tergoda.\n\nAturan 24 jam juga ampuh: tunda semua pembelian non-esensial 24 jam. 80% keinginan impulsif akan hilang sendiri.`;
      } else if (lowerMsg.includes("boros") || lowerMsg.includes("hemat")) {
        if (hasData && expense > income * 0.85) {
          reply = `Ya, berdasarkan data: pengeluaran ${formatIDR(expense)} = ${Math.round((expense / income) * 100)}% dari pemasukan ${formatIDR(income)}. Ini tergolong boros — idealnya max 80%.\n\nLangkah konkret: (1) Buka halaman Transaksi, lihat kategori mana yang paling besar. (2) Potong kategori hiburan/makan luar sebesar ${formatIDR(Math.round(expense * 0.15))} bulan ini.`;
        } else if (hasData) {
          reply = `Dari data, pengeluaranmu ${formatIDR(expense)} masih dalam batas wajar (${Math.round((expense / income) * 100)}% dari pemasukan). Tapi "boros yang tidak terasa" sering datang dari pengeluaran kecil yang terkumpul.\n\nAudit langganan digital: hitung semua subscription yang kamu bayar per bulan. Biasanya ada 1-2 yang jarang dipakai dan bisa dihemat.`;
        } else {
          reply = `Untuk mengetahui apakah kamu boros, pertama catat semua pemasukan dan pengeluaran bulan ini di aplikasi. Saya akan langsung bisa menganalisis dan memberikan angka yang konkret.\n\nSementara itu, tips umum: pengeluaran ideal max 80% dari gaji. Sisanya 20% untuk tabungan/investasi.`;
        }
      } else if (lowerMsg.includes("investasi") || lowerMsg.includes("invest") || lowerMsg.includes("saham") || lowerMsg.includes("reksadana")) {
        const danaDarurat = hasData ? formatIDR(expense * 3) : "3× pengeluaran bulanan";
        reply = `Sebelum investasi, pastikan dana darurat sudah ada (minimal ${danaDarurat}). ${hasData && assets >= expense * 3 ? `Asetmu ${formatIDR(assets)} sudah mencukupi — kamu siap berinvestasi! ✅` : `Asetmu ${formatIDR(assets)} belum cukup untuk dana darurat — prioritaskan ini dulu.`}\n\nUrutan investasi untuk pemula Indonesia: (1) Reksa Dana Pasar Uang (risiko rendah, mulai Rp 10rb) → (2) ORI/SBR pemerintah (aman, kupon 6-7%) → (3) Saham blue-chip seperti BBCA atau BBRI untuk jangka panjang.`;
      } else if (lowerMsg.includes("dana darurat") || lowerMsg.includes("emergency")) {
        const target = hasData ? expense * 6 : 0;
        reply = `Dana darurat ideal = 6× pengeluaran bulanan${hasData ? ` = ${formatIDR(target)}` : ""}. ${hasData && assets >= target ? `Asetmu ${formatIDR(assets)} sudah melewati target — excellent! 🎉` : hasData ? `Kamu masih perlu ${formatIDR(Math.max(target - assets, 0))} lagi untuk mencapai target.` : ""}\n\nSimpan dana darurat di rekening yang mudah dicairkan (tabungan biasa atau Reksa Dana Pasar Uang), bukan deposito atau investasi yang terkunci.`;
      } else {
        const statusLine = hasData
          ? `Dari data kamu: pemasukan ${formatIDR(income)}, pengeluaran ${formatIDR(expense)}, saving rate ${savingRatio}%.`
          : `Belum ada data keuangan bulan ini.`;
        reply = `${statusLine}\n\nSaya bisa membantu dengan pertanyaan spesifik seperti:\n• "Analisis pengeluaranku"\n• "Apakah saya boros?"\n• "Cara nabung lebih cepat"\n• "Tips investasi untuk kondisi saya"\n\nSemakin spesifik pertanyaanmu, semakin personal saran yang bisa saya berikan! 💚`;
      }

      res.json({ reply, configured: false });
    } catch (err) {
      console.error("AI chat error:", err);
      res.status(500).json({ message: "Failed to process chat" });
    }
  });

  // ══════════════════════════════════════════════════════
  // INVEST FEATURE — Stock quotes via Yahoo Finance
  // ══════════════════════════════════════════════════════

  // GET /api/portfolio — list all stock holdings for user
  app.get("/api/portfolio", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      const holdings = await db
        .select()
        .from(stockHoldings)
        .where(eq(stockHoldings.userId, userId))
        .orderBy(stockHoldings.createdAt);
      res.json(holdings);
    } catch (err) {
      console.error("Portfolio GET error:", err);
      res.status(500).json({ message: "Failed to fetch portfolio" });
    }
  });

  // POST /api/portfolio — add or update a holding
  app.post("/api/portfolio", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      const { symbol, lots, avgPrice, buyDate, accountId } = req.body;
      if (!symbol || !lots || !avgPrice) return res.status(400).json({ message: "symbol, lots, avgPrice required" });
      const totalCost = Number(lots) * Number(avgPrice) * 100;

      const sym = String(symbol).toUpperCase().trim();
      const withJK = sym.endsWith(".JK") ? sym : `${sym}.JK`;

      // Check if holding already exists → update (add lots, recalculate avg)
      const existing = await db
        .select()
        .from(stockHoldings)
        .where(and(eq(stockHoldings.userId, userId), eq(stockHoldings.symbol, withJK)))
        .limit(1);

      let result;
      if (existing.length > 0) {
        const prev = existing[0];
        const prevLots = Number(prev.lots);
        const prevAvg = Number(prev.avgPrice);
        const newLots = Number(lots);
        const newAvg = Number(avgPrice);
        const totalLots = prevLots + newLots;
        const mergedAvg = ((prevAvg * prevLots * 100) + (newAvg * newLots * 100)) / (totalLots * 100);
        const [updated] = await db
          .update(stockHoldings)
          .set({ lots: totalLots, avgPrice: String(mergedAvg.toFixed(2)), buyDate: buyDate || prev.buyDate })
          .where(eq(stockHoldings.id, prev.id))
          .returning();
        result = updated;
      } else {
        const [inserted] = await db
          .insert(stockHoldings)
          .values({ userId, symbol: withJK, lots: Number(lots), avgPrice: String(Number(avgPrice).toFixed(2)), buyDate: buyDate || null })
          .returning();
        result = inserted;
      }

      if (accountId && totalCost > 0) {
        try {
          await storage.updateAccountBalance(Number(accountId), String(totalCost), "subtract");
          const stockName = withJK.replace(".JK", "");
          await storage.createTransaction({
            userId,
            type: "investment",
            amount: String(totalCost),
            date: buyDate || format(new Date(), "yyyy-MM-dd"),
            fromAccountId: Number(accountId),
            toAccountId: null,
            category: "Investasi",
            note: `Beli saham ${stockName} ${lots} lot @ Rp ${Number(avgPrice).toLocaleString("id-ID")}`,
          });
        } catch (e) {
          console.error("[Portfolio] account deduction failed:", e);
        }
      }

      burstCacheForUser(userId);
      res.json(result);
    } catch (err) {
      console.error("Portfolio POST error:", err);
      res.status(500).json({ message: "Failed to save holding" });
    }
  });

  // GET /api/portfolio/transactions — all Investasi category transactions for the user
  app.get("/api/portfolio/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      const txs = await db.select().from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.category, "Investasi")))
        .orderBy(sql`${transactions.date} desc, ${transactions.createdAt} desc`);
      res.json(txs);
    } catch (err) {
      console.error("Portfolio transactions error:", err);
      res.status(500).json({ message: "Failed to fetch portfolio transactions" });
    }
  });

  // DELETE /api/portfolio/:id — remove a holding and its related investment transactions
  app.delete("/api/portfolio/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      const id = Number(req.params.id);

      const [holding] = await db.select().from(stockHoldings).where(and(eq(stockHoldings.id, id), eq(stockHoldings.userId, userId))).limit(1);
      if (!holding) return res.status(404).json({ message: "Holding not found" });

      const symbolShort = holding.symbol.replace(".JK", "");

      // Reverse balance for any "investment" buy transactions linked to this symbol
      const relatedBuys = await db.select().from(transactions).where(
        and(eq(transactions.userId, userId), eq(transactions.category, "Investasi"), eq(transactions.type, "investment"), like(transactions.note, `Beli saham ${symbolShort}%`))
      );
      for (const tx of relatedBuys) {
        if (tx.fromAccountId) {
          await storage.updateAccountBalance(tx.fromAccountId, String(tx.amount), "add");
        }
      }

      // Delete those related buy transactions
      await db.delete(transactions).where(
        and(eq(transactions.userId, userId), eq(transactions.category, "Investasi"), eq(transactions.type, "investment"), like(transactions.note, `Beli saham ${symbolShort}%`))
      );

      await db.delete(stockHoldings).where(eq(stockHoldings.id, id));
      burstCacheForUser(userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("Portfolio DELETE error:", err);
      res.status(500).json({ message: "Failed to delete holding" });
    }
  });

  // POST /api/portfolio/sell — sell (partial or full) holding
  app.post("/api/portfolio/sell", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      const { holdingId, lotsToSell, sellPrice, accountId, sellDate } = req.body;
      if (!holdingId || !lotsToSell || !sellPrice) return res.status(400).json({ message: "holdingId, lotsToSell, sellPrice required" });

      const [holding] = await db.select().from(stockHoldings).where(and(eq(stockHoldings.id, Number(holdingId)), eq(stockHoldings.userId, userId))).limit(1);
      if (!holding) return res.status(404).json({ message: "Holding not found" });

      const lots = Number(lotsToSell);
      if (lots <= 0 || lots > Number(holding.lots)) return res.status(400).json({ message: `Cannot sell more than ${holding.lots} lots` });

      const saleAmount = lots * Number(sellPrice) * 100;
      const stockName = holding.symbol.replace(".JK", "");
      const txDate = sellDate || format(new Date(), "yyyy-MM-dd");

      if (lots >= Number(holding.lots)) {
        await db.delete(stockHoldings).where(eq(stockHoldings.id, holding.id));
      } else {
        await db.update(stockHoldings)
          .set({ lots: Number(holding.lots) - lots })
          .where(eq(stockHoldings.id, holding.id));
      }

      if (accountId && saleAmount > 0) {
        try {
          await storage.updateAccountBalance(Number(accountId), String(saleAmount), "add");
          await storage.createTransaction({
            userId,
            type: "income",
            amount: String(saleAmount),
            date: txDate,
            fromAccountId: null,
            toAccountId: Number(accountId),
            category: "Investasi",
            note: `Jual saham ${stockName} ${lots} lot @ Rp ${Number(sellPrice).toLocaleString("id-ID")}`,
          });
        } catch (e) {
          console.error("[Portfolio] sell credit failed:", e);
        }
      }

      burstCacheForUser(userId);
      res.json({ ok: true, sold: lots, remaining: Number(holding.lots) - lots });
    } catch (err) {
      console.error("Portfolio SELL error:", err);
      res.status(500).json({ message: "Failed to sell holding" });
    }
  });

  app.get("/api/invest/quote/:ticker", isAuthenticated, async (req, res) => {
    const { ticker } = req.params;
    if (!ticker || ticker.length > 20) return res.status(400).json({ message: "Invalid ticker" });

    try {
      const data = await cached(`stock_${ticker}`, async () => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!r.ok) throw new Error(`Yahoo Finance returned ${r.status}`);
        const json = await r.json() as {
          chart: {
            result: Array<{
              meta: {
                regularMarketPrice: number;
                previousClose: number;
                shortName?: string;
                longName?: string;
                currency: string;
                marketState: string;
              };
            }>;
            error: { message: string } | null;
          };
        };

        if (json.chart?.error) throw new Error(json.chart.error.message);
        const result = json.chart?.result?.[0];
        if (!result) throw new Error("No data");
        const meta = result.meta;

        // Use daily OHLC to find yesterday's actual close (most reliable for IDX)
        const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
        const validCloses = closes.filter((c): c is number => c !== null && c > 0);

        const price = meta.regularMarketPrice ?? validCloses[validCloses.length - 1] ?? 0;
        // Priority: chartPreviousClose (actual trading session) > second-to-last OHLC > previousClose
        const prev =
          (meta.chartPreviousClose && meta.chartPreviousClose > 0 ? meta.chartPreviousClose : null) ??
          (validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null) ??
          (meta.previousClose && meta.previousClose > 0 ? meta.previousClose : null) ??
          price;
        const change = price - prev;
        const changePct = prev > 0 ? (change / prev) * 100 : 0;

        return {
          symbol: ticker,
          name: meta.shortName || meta.longName || ticker,
          price,
          change,
          changePct,
          currency: meta.currency ?? "IDR",
          marketStatus: (meta.marketState === "REGULAR" ? "open" : "closed") as "open" | "closed",
        };
      });
      res.json(data);
    } catch (err) {
      console.error(`Stock quote error for ${ticker}:`, err);
      res.status(502).json({ message: `Tidak bisa mengambil data ${ticker}` });
    }
  });

  // GET /api/invest/search?q=QUERY — search all IDX stocks via Yahoo Finance
  app.get("/api/invest/search", isAuthenticated, async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=ID&quotesCount=15&newsCount=0&enableFuzzyQuery=true`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
      if (!r.ok) throw new Error(`Yahoo search ${r.status}`);
      const json = await r.json() as any;
      const results = ((json.quotes ?? []) as any[])
        .filter(item => typeof item.symbol === "string" && item.symbol.endsWith(".JK") && item.quoteType === "EQUITY")
        .map(item => ({ symbol: item.symbol, name: item.longname || item.shortname || item.symbol.replace(".JK", "") }))
        .slice(0, 12);
      res.json(results);
    } catch (err) {
      console.error("Stock search error:", err);
      res.json([]);
    }
  });

  // ===== FOREX TRADING =====

  // POST /api/forex/parse — Parse OCR text from MT4/MT5 screenshot into structured trades
  app.post("/api/forex/parse", isAuthenticated, async (req, res) => {
    try {
      const { text } = req.body as { text?: string };
      if (!text || typeof text !== "string") {
        return res.status(400).json({ success: false, message: "text is required", trades: [] });
      }

      // Debug: log raw OCR text
      console.log("=== FOREX OCR RAW TEXT ===");
      console.log(text);
      console.log("==========================");

      const { trades, cleanText } = parseForexTrades(text);

      // Debug: log clean text and results
      console.log("=== FOREX CLEAN TEXT ===");
      console.log(cleanText);
      console.log("=== FOREX PARSED ===", trades.length, "trade(s)");
      console.log(JSON.stringify(trades, null, 2));
      console.log("====================");

      if (trades.length === 0) {
        return res.json({
          success: false,
          trades: [],
          message: "Parsing gagal — tidak ada trade yang terdeteksi",
          debug: { rawText: text, cleanText },
        });
      }

      res.json({ success: true, trades });
    } catch (err) {
      console.error("forex/parse error:", err);
      res.status(500).json({ success: false, message: "Parse failed", trades: [] });
    }
  });

  // POST /api/forex/save — Save parsed trades with duplicate detection
  app.post("/api/forex/save", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { trades } = req.body as { trades?: Array<{
        symbol: string; type: string; lot: number;
        openPrice: number; closePrice: number; profit: number;
      }> };

      if (!Array.isArray(trades) || trades.length === 0) {
        return res.status(400).json({ message: "trades array is required" });
      }

      let inserted = 0;
      let duplicates = 0;

      for (const trade of trades) {
        // A trade is a duplicate only when all five fields match within a
        // rolling 5-minute window.  This lets the same pair trade again later
        // in the day at the same price level (different lot → different profit)
        // while still blocking accidental re-uploads of the same screenshot.
        const windowStart = new Date(Date.now() - 5 * 60 * 1000);

        const existing = await db.query.forexTrades.findFirst({
          where: and(
            eq(forexTrades.userId,    userId),
            eq(forexTrades.symbol,    trade.symbol),
            eq(forexTrades.type,      trade.type.toLowerCase()),
            eq(forexTrades.lot,       String(trade.lot)),
            eq(forexTrades.openPrice, String(trade.openPrice)),
            eq(forexTrades.closePrice,String(trade.closePrice)),
            eq(forexTrades.profit,    String(trade.profit)),
            gte(forexTrades.createdAt, windowStart),
          ),
        });

        if (existing) {
          duplicates++;
          continue;
        }

        await db.insert(forexTrades).values({
          userId,
          symbol: trade.symbol,
          type: trade.type.toLowerCase(),
          lot: String(trade.lot),
          openPrice: String(trade.openPrice),
          closePrice: String(trade.closePrice),
          profit: String(trade.profit),
          source: "image",
        });
        inserted++;
      }

      res.json({ inserted, duplicates });
    } catch (err) {
      console.error("forex/save error:", err);
      res.status(500).json({ message: "Save failed" });
    }
  });

  // GET /api/forex/trades — Get user's forex trade history
  app.get("/api/forex/trades", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const rows = await db.select().from(forexTrades)
        .where(eq(forexTrades.userId, userId))
        .orderBy(sql`${forexTrades.createdAt} DESC`)
        .limit(100);
      res.json(rows);
    } catch (err) {
      console.error("forex/trades error:", err);
      res.status(500).json({ message: "Failed to fetch trades" });
    }
  });

  // GET /api/forex/stats — Aggregate stats (today + all-time)
  app.get("/api/forex/stats", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);

      const allTrades = await db.select().from(forexTrades).where(eq(forexTrades.userId, userId));
      const todayTrades = allTrades.filter(t => t.createdAt && t.createdAt >= todayStart && t.createdAt <= todayEnd);

      const sumProfit   = (arr: typeof allTrades) => arr.filter(t => Number(t.profit) > 0).reduce((s, t) => s + Number(t.profit), 0);
      const sumLoss     = (arr: typeof allTrades) => arr.filter(t => Number(t.profit) < 0).reduce((s, t) => s + Number(t.profit), 0);
      const sumNet      = (arr: typeof allTrades) => arr.reduce((s, t) => s + Number(t.profit), 0);

      const lastLossTrade = allTrades
        .filter(t => Number(t.profit) < 0)
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];

      const lastTrade = allTrades.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))[0];

      res.json({
        today: {
          profit: sumProfit(todayTrades),
          loss: sumLoss(todayTrades),
          net: sumNet(todayTrades),
          count: todayTrades.length,
        },
        allTime: {
          profit: sumProfit(allTrades),
          loss: sumLoss(allTrades),
          net: sumNet(allTrades),
          count: allTrades.length,
          winRate: allTrades.length > 0 ? (allTrades.filter(t => Number(t.profit) > 0).length / allTrades.length) * 100 : 0,
        },
        lastLossTradeAt: lastLossTrade?.createdAt ?? null,
        lastTradeAt: lastTrade?.createdAt ?? null,
      });
    } catch (err) {
      console.error("forex/stats error:", err);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // GET /api/forex/rules — Get user's trading discipline rules
  app.get("/api/forex/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      let rules = await db.select().from(tradingRules).where(eq(tradingRules.userId, userId)).then(r => r[0]);
      if (!rules) {
        const inserted = await db.insert(tradingRules).values({ userId }).returning();
        rules = inserted[0];
      }
      res.json(rules);
    } catch (err) {
      console.error("forex/rules GET error:", err);
      res.status(500).json({ message: "Failed to fetch rules" });
    }
  });

  // PUT /api/forex/rules — Update user's trading discipline rules
  app.put("/api/forex/rules", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { maxLossPercent, targetProfitPercent, maxTradesPerDay, revengeWindowMinutes } = req.body;
      const existing = await db.select().from(tradingRules).where(eq(tradingRules.userId, userId)).then(r => r[0]);
      if (!existing) {
        const inserted = await db.insert(tradingRules).values({
          userId,
          maxLossPercent: String(maxLossPercent ?? 1),
          targetProfitPercent: String(targetProfitPercent ?? 2),
          maxTradesPerDay: maxTradesPerDay ?? 10,
          revengeWindowMinutes: revengeWindowMinutes ?? 5,
        }).returning();
        return res.json(inserted[0]);
      }
      const updated = await db.update(tradingRules).set({
        ...(maxLossPercent !== undefined && { maxLossPercent: String(maxLossPercent) }),
        ...(targetProfitPercent !== undefined && { targetProfitPercent: String(targetProfitPercent) }),
        ...(maxTradesPerDay !== undefined && { maxTradesPerDay }),
        ...(revengeWindowMinutes !== undefined && { revengeWindowMinutes }),
        updatedAt: new Date(),
      }).where(eq(tradingRules.userId, userId)).returning();
      res.json(updated[0]);
    } catch (err) {
      console.error("forex/rules PUT error:", err);
      res.status(500).json({ message: "Failed to update rules" });
    }
  });

  // GET /api/forex/insights — Best pair, winrate breakdown, most profitable hour
  app.get("/api/forex/insights", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const allTrades = await db.select().from(forexTrades).where(eq(forexTrades.userId, userId));

      if (allTrades.length === 0) return res.json({ bestPair: null, worstPair: null, bySymbol: [], byHour: [] });

      // Group by symbol
      const bySymbolMap: Record<string, { symbol: string; profit: number; loss: number; wins: number; total: number }> = {};
      for (const t of allTrades) {
        if (!bySymbolMap[t.symbol]) bySymbolMap[t.symbol] = { symbol: t.symbol, profit: 0, loss: 0, wins: 0, total: 0 };
        const p = Number(t.profit);
        bySymbolMap[t.symbol].total++;
        if (p > 0) { bySymbolMap[t.symbol].profit += p; bySymbolMap[t.symbol].wins++; }
        else { bySymbolMap[t.symbol].loss += p; }
      }
      const bySymbol = Object.values(bySymbolMap).map(s => ({ ...s, net: s.profit + s.loss, winRate: (s.wins / s.total) * 100 }));
      const bestPair  = bySymbol.sort((a, b) => b.net - a.net)[0]?.symbol ?? null;
      const worstPair = [...bySymbol].sort((a, b) => a.net - b.net)[0]?.symbol ?? null;

      // Group by hour
      const byHourMap: Record<number, { hour: number; profit: number; count: number }> = {};
      for (const t of allTrades) {
        if (!t.createdAt) continue;
        const h = new Date(t.createdAt).getHours();
        if (!byHourMap[h]) byHourMap[h] = { hour: h, profit: 0, count: 0 };
        byHourMap[h].profit += Number(t.profit);
        byHourMap[h].count++;
      }
      const byHour = Object.values(byHourMap).sort((a, b) => a.hour - b.hour);

      res.json({ bestPair, worstPair, bySymbol, byHour });
    } catch (err) {
      console.error("forex/insights error:", err);
      res.status(500).json({ message: "Failed to fetch insights" });
    }
  });

  // POST /api/forex/psychology — Check psychology alerts before submitting trade
  app.post("/api/forex/psychology", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { accountBalance } = req.body as { accountBalance?: number };

      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
      const allTrades  = await db.select().from(forexTrades).where(eq(forexTrades.userId, userId));
      const todayTrades = allTrades.filter(t => t.createdAt && t.createdAt >= todayStart && t.createdAt <= todayEnd);

      let rules = await db.select().from(tradingRules).where(eq(tradingRules.userId, userId)).then(r => r[0]);
      if (!rules) {
        const ins = await db.insert(tradingRules).values({ userId }).returning();
        rules = ins[0];
      }

      const alerts: Array<{ type: string; message: string; severity: "warning" | "danger" | "info" }> = [];

      const todayLoss   = todayTrades.filter(t => Number(t.profit) < 0).reduce((s, t) => s + Math.abs(Number(t.profit)), 0);
      const todayProfit = todayTrades.filter(t => Number(t.profit) > 0).reduce((s, t) => s + Number(t.profit), 0);
      const balance     = accountBalance ?? 0;

      // 1. Daily loss limit
      if (balance > 0) {
        const lossThreshold = balance * (Number(rules.maxLossPercent) / 100);
        if (todayLoss >= lossThreshold) {
          alerts.push({ type: "daily_loss_limit", severity: "danger", message: `Kamu sudah mencapai batas kerugian harian (${rules.maxLossPercent}%). Istirahat sekarang.` });
        }
      }

      // 2. Profit target reminder
      if (balance > 0) {
        const profitThreshold = balance * (Number(rules.targetProfitPercent) / 100);
        if (todayProfit >= profitThreshold) {
          alerts.push({ type: "profit_target", severity: "info", message: `Profit sudah ${rules.targetProfitPercent}% hari ini. Mau lanjut atau istirahat?` });
        }
      }

      // 3. Overtrading
      if (todayTrades.length >= rules.maxTradesPerDay) {
        alerts.push({ type: "overtrading", severity: "warning", message: `Overtrading terdeteksi — ${todayTrades.length} trade hari ini melebihi batas ${rules.maxTradesPerDay}.` });
      }

      // 4. Revenge trading
      const sortedByTime = [...allTrades].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      const lastTrade = sortedByTime[0];
      if (lastTrade && Number(lastTrade.profit) < 0 && lastTrade.createdAt) {
        const minsAgo = (Date.now() - lastTrade.createdAt.getTime()) / 60_000;
        if (minsAgo < rules.revengeWindowMinutes) {
          alerts.push({ type: "revenge_trading", severity: "danger", message: `Tenang dulu. Trade terakhir rugi ${Math.round(minsAgo)} menit lalu — jangan balas dendam market.` });
        }
      }

      res.json({ alerts, todayStats: { count: todayTrades.length, loss: todayLoss, profit: todayProfit } });
    } catch (err) {
      console.error("forex/psychology error:", err);
      res.status(500).json({ message: "Failed to check psychology" });
    }
  });

  // GET /api/forex/risk-settings — Returns (or creates) user's risk calculator settings
  app.get("/api/forex/risk-settings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      let settings = await db.select().from(tradingRiskSettings).where(eq(tradingRiskSettings.userId, userId)).then(r => r[0]);
      if (!settings) {
        const ins = await db.insert(tradingRiskSettings).values({ userId }).returning();
        settings = ins[0];
      }
      res.json(settings);
    } catch (err) {
      console.error("forex/risk-settings GET error:", err);
      res.status(500).json({ message: "Failed to load risk settings" });
    }
  });

  // PUT /api/forex/risk-settings — Persist user's risk calculator settings
  app.put("/api/forex/risk-settings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { balance, currency, accountType, riskPercent } = req.body as {
        balance?: number; currency?: string; accountType?: string; riskPercent?: number;
      };
      const existing = await db.select().from(tradingRiskSettings).where(eq(tradingRiskSettings.userId, userId)).then(r => r[0]);
      if (existing) {
        const updated = await db.update(tradingRiskSettings)
          .set({
            ...(balance      !== undefined && { balance:     String(balance) }),
            ...(currency     !== undefined && { currency }),
            ...(accountType  !== undefined && { accountType }),
            ...(riskPercent  !== undefined && { riskPercent: String(riskPercent) }),
            updatedAt: new Date(),
          })
          .where(eq(tradingRiskSettings.userId, userId))
          .returning();
        return res.json(updated[0]);
      }
      const ins = await db.insert(tradingRiskSettings).values({
        userId,
        ...(balance     !== undefined && { balance:     String(balance) }),
        ...(currency    !== undefined && { currency }),
        ...(accountType !== undefined && { accountType }),
        ...(riskPercent !== undefined && { riskPercent: String(riskPercent) }),
      }).returning();
      res.json(ins[0]);
    } catch (err) {
      console.error("forex/risk-settings PUT error:", err);
      res.status(500).json({ message: "Failed to save risk settings" });
    }
  });

  // GET /api/invest/ihsg — IHSG index data + intraday sparkline
  app.get("/api/invest/ihsg", isAuthenticated, async (_req, res) => {
    try {
      const bucket = Math.floor(Date.now() / (5 * 60_000));
      const data = await cached(`ihsg_${bucket}`, async () => {
        const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?interval=5m&range=1d";
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) throw new Error(`Yahoo IHSG ${r.status}`);
        const json = await r.json() as any;
        const result = json.chart?.result?.[0];
        if (!result) throw new Error("No IHSG data");
        const meta = result.meta;
        const timestamps: number[] = result.timestamp || [];
        const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
        const points = timestamps
          .map((t, i) => ({ t: t * 1000, v: closes[i] }))
          .filter(p => p.v != null) as { t: number; v: number }[];
        const prev = meta.chartPreviousClose ?? meta.previousClose ?? meta.regularMarketPrice;
        const price = meta.regularMarketPrice ?? prev;
        return { price, prevClose: prev, change: price - prev, changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0, points };
      });
      res.json(data);
    } catch (err) {
      console.error("IHSG fetch error:", err);
      res.status(500).json({ message: "Failed to fetch IHSG" });
    }
  });

}
