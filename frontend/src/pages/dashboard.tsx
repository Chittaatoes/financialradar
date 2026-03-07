/**
 * ===== DASHBOARD PAGE =====
 * Main dashboard for Financial Radar. Contains:
 * - Total Assets card (dark bg #1b1a18) with eye toggle for privacy
 * - Today's Focus card (daily missions, XP rewards)
 * - Smart Save notification (iPhone-style, dismissible per day)
 * - Spending Insight section (weekly/monthly segmented toggle, bar chart)
 * - Quick-add transaction floating button (opens dialog)
 * - Streak + Level compact badges
 *
 * Key behaviors:
 * - "Spend Nothing Today" button is hidden on mobile, visible on desktop (sm+)
 * - Masked amounts show "Rp..." instead of dots
 * - Eye toggle has 180ms fade+scale animation with subtle icon rotation
 * - Monthly chart aggregates daily data into ~4 weekly groups
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { playSound } from "@/hooks/use-sound";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContentBottomSheet, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Wallet, Landmark, Smartphone,
  Flame, TrendingUp, TrendingDown, Minus,
  CalendarOff, Crosshair, CheckCircle2, Circle,
  Eye, EyeOff, X, Lightbulb, Target,
  BarChart3, Plus, Award,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  PiggyBank, CreditCard, FileText, LineChart, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, getXpForNextLevel, EXPENSE_CATEGORY_GROUPS, INCOME_CATEGORIES, getTierKey } from "@/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useLanguage } from "@/lib/i18n";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { UserProfile, Goal, DailyFocus, Account, CustomCategory, Liability } from "@shared/schema";
import ScoreRing from "@/features/score/score-ring";
import { MilestoneFlame, getMilestoneLevel, getMilestoneName } from "@/features/gamification/milestone-flame";
import { LevelUpCelebration } from "@/features/gamification/level-up-celebration";
import { SetupFirstAccountModal } from "@/components/setup-first-account-modal";
import { MonthlyActivityCalendar } from "@/components/monthly-activity-calendar";
import { ScanPanel } from "@/components/scan-panel";

// === DASHBOARD API RESPONSE TYPES ===
// These interfaces match the JSON returned by /api/dashboard, /api/smart-save, /api/spending-insight

interface DashboardData {
  totalAssets: number;       // Sum of all account balances
  totalCash: number;         // Sum of "cash" type accounts
  totalBank: number;         // Sum of "bank" type accounts
  totalEwallet: number;      // Sum of "ewallet" type accounts
  totalSaving: number;       // Sum of all goal currentAmounts
  totalTarget: number;       // Sum of all goal targetAmounts
  goalProgress: number;      // Percentage: totalSaving / totalTarget * 100
  todayInteracted: boolean;  // Whether user has a streak log entry for today
  lastActiveGoal: Goal | null;
}

interface SmartSaveRec {
  goalId: number;
  goalName: string;
  dailySuggestion: number;
  remaining: number;
  daysLeft: number;
}

interface SmartSaveData {
  recommendations: SmartSaveRec[];
  weeklyIncome: number;
  weeklyExpense: number;
}

interface SpendingInsightData {
  period: string;
  totalExpense: number;
  prevTotalExpense: number;
  totalIncome: number;
  changePercent: number;
  topCategories: { category: string; amount: number }[];
  breakdown: { label: string; amount: number }[];
}

// === AMOUNT FORMATTING ===
// formatShort: Compact IDR display for small cards (e.g. "Rp 1.5M", "Rp 200K")
// MASKED_LONG / MASKED_SHORT: Shown when eye toggle hides amounts
function formatShort(amount: number): string {
  if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}K`;
  return `Rp ${amount}`;
}

const MASKED_LONG = "Rp......";
const MASKED_SHORT = "******";

// === EYE TOGGLE HOOK ===
// Manages show/hide state for all currency amounts on dashboard.
// State persisted to localStorage key "fr_hide_amounts".
// Animation: 90ms delay before toggling, then animating flag triggers
// 180ms fade (opacity 0→1) + scale (0.98→1) CSS transitions on amounts.
function useAmountVisibility() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem("fr_hide_amounts") === "1"; } catch { return false; }
  });
  const [animating, setAnimating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const toggle = useCallback(() => {
    setAnimating(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const next = !hidden;
      setHidden(next);
      try { localStorage.setItem("fr_hide_amounts", next ? "1" : "0"); } catch {}
      requestAnimationFrame(() => setAnimating(false));
    }, 90);
  }, [hidden]);

  return { hidden, toggle, animating };
}

// === SMART SAVE NOTIFICATION ===
// iPhone-style dismissible notification card that appears once per day.
// Shows daily savings suggestion based on active goals + spending patterns.
// Dismissed state stored in localStorage with date-based key.
// Data from /api/smart-save endpoint.
function SmartSaveAlert({ t }: { t: any }) {
  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `fr_smart_save_dismissed_${today}`;

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });

  const { data: smartSave } = useQuery<SmartSaveData>({
    queryKey: ["/api/smart-save"],
    enabled: !dismissed,
  });

  if (dismissed) return null;

  const topRec = smartSave?.recommendations?.[0];
  if (!topRec) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(storageKey, "1"); } catch {}
  };

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-primary/5 dark:bg-primary/8 border border-primary/15 animate-in slide-in-from-top-1 duration-200"
      data-testid="alert-smart-save"
    >
      <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0" />
      <p className="flex-1 min-w-0 text-xs text-muted-foreground">
        <span className="font-semibold text-primary mr-1" data-testid="text-smart-save-title">{t.dashboard.smartSaveTitle}:</span>
        <span className="font-mono font-semibold text-foreground" data-testid="text-smart-save-amount">{formatCurrency(topRec.dailySuggestion)}</span>
        {" "}{t.dashboard.smartSaveFor}{" "}
        <span className="font-semibold text-foreground" data-testid="text-smart-save-goal">{topRec.goalName}</span>
        <span className="text-muted-foreground" data-testid="text-smart-save-days"> · {topRec.daysLeft} {t.dashboard.smartSaveDaysLeft}</span>
      </p>
      <Button
        size="icon"
        variant="ghost"
        className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={handleDismiss}
        data-testid="button-dismiss-smart-save"
        aria-label="Dismiss"
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
}

// === MONTHLY→WEEKLY AGGREGATION ===
// When period=monthly, the API returns daily breakdown (30 bars).
// This function groups them into ~4 weekly bars (7 days each) for readability.
function aggregateMonthlyToWeeks(breakdown: { label: string; amount: number }[]): { label: string; amount: number }[] {
  if (!breakdown || breakdown.length === 0) return [];
  const weeks: { label: string; amount: number }[] = [];
  const totalDays = breakdown.length;
  for (let w = 0; w < Math.ceil(totalDays / 7); w++) {
    const start = w * 7;
    const end = Math.min(start + 7, totalDays);
    const slice = breakdown.slice(start, end);
    const amount = slice.reduce((s, b) => s + b.amount, 0);
    const startDay = start + 1;
    const endDay = end;
    weeks.push({ label: `${startDay}–${endDay}`, amount });
  }
  return weeks;
}

// === SPENDING INSIGHT SECTION ===
// Dashboard section with segmented toggle: [Weekly] [Monthly]
// Shows: total expense, % change vs previous period, bar chart, top categories.
// Data from /api/spending-insight?period=weekly|monthly
// Chart: 200px height, green gradient bars, hover tooltip with exact amount.
function SpendingInsightSection({ t }: { t: any }) {
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");

  const { data: insight, isLoading, isError } = useQuery<SpendingInsightData>({
    queryKey: [`/api/spending-insight?period=${period}`],
  });

  const changePercent = insight?.changePercent ?? 0;
  const prevTotal = insight?.prevTotalExpense ?? 0;
  const hasPrevData = prevTotal > 0;
  const isUp = changePercent > 0 && hasPrevData;

  const chartBars = period === "monthly"
    ? aggregateMonthlyToWeeks(insight?.breakdown ?? [])
    : (insight?.breakdown ?? []);
  const maxBreakdown = Math.max(...chartBars.map(b => b.amount), 1);

  return (
    <Card data-testid="card-spending-insight">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">{t.dashboard.insightTitle}</span>
          </div>
          <div
            className="inline-flex rounded-md bg-muted p-0.5 gap-0.5"
            data-testid="toggle-insight-period"
          >
            <button
              type="button"
              onClick={() => setPeriod("weekly")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-all duration-200 ease-in-out ${
                period === "weekly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
              data-testid="toggle-insight-weekly"
            >
              {t.dashboard.insightWeekly}
            </button>
            <button
              type="button"
              onClick={() => setPeriod("monthly")}
              className={`px-3 py-1 text-xs font-medium rounded-sm transition-all duration-200 ease-in-out ${
                period === "monthly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
              data-testid="toggle-insight-monthly"
            >
              {t.dashboard.insightMonthly}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-[200px]" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t.dashboard.insightNoData}</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{t.dashboard.insightThisPeriod}</p>
                  <p className="text-2xl font-mono font-bold" data-testid="text-insight-expense">
                    {formatCurrency(insight?.totalExpense ?? 0)}
                  </p>
                </div>
                {hasPrevData && changePercent !== 0 && (
                  <div className="flex items-center gap-1 pb-1">
                    {isUp && <TrendingUp className="w-4 h-4 text-red-500 dark:text-red-400" />}
                    {!isUp && <TrendingDown className="w-4 h-4 text-muted-foreground" />}
                    <span
                      className={`text-sm font-medium ${
                        isUp ? "text-red-500 dark:text-red-400" : "text-muted-foreground"
                      }`}
                      data-testid="text-insight-change"
                    >
                      {`${Math.abs(Math.round(changePercent))}% ${t.dashboard.insightPrevPeriod}`}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground" data-testid="text-insight-prev">
                {period === "weekly" ? t.dashboard.insightYesterday : t.dashboard.insightLastMonth}: {formatCurrency(prevTotal)}
              </p>
            </div>

            {chartBars.length > 0 && (
              <div className="space-y-1">
                <div
                  className="flex items-end gap-1.5 sm:gap-2"
                  style={{ height: 200 }}
                  data-testid="chart-insight-bars"
                >
                  {chartBars.map((b, i) => {
                    const h = maxBreakdown > 0 ? (b.amount / maxBreakdown) * 100 : 0;
                    return (
                      <div
                        key={i}
                        className="flex-1 flex flex-col justify-end h-full relative group"
                      >
                        <div
                          className="w-full rounded-t-sm transition-all duration-200"
                          style={{
                            height: `${Math.max(h, 1.5)}%`,
                            background: "linear-gradient(180deg, hsl(var(--primary) / 0.35) 0%, hsl(var(--primary) / 0.12) 100%)",
                            minHeight: 2,
                          }}
                        />
                        <div className="invisible group-hover:visible absolute -top-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                          {formatCurrency(b.amount)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex text-[10px] text-muted-foreground/70">
                  {chartBars.map((b, i) => (
                    <span key={i} className="flex-1 text-center truncate">{(t.dashboard.dayNames as Record<string, string>)[b.label] || b.label}</span>
                  ))}
                </div>
              </div>
            )}

            {insight?.topCategories && insight.topCategories.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-muted-foreground font-medium">{t.dashboard.insightTopCategories}</p>
                {insight.topCategories.slice(0, 4).map((cat, i) => {
                  const pct = insight.totalExpense > 0 ? (cat.amount / insight.totalExpense) * 100 : 0;
                  return (
                    <div key={cat.category} className="flex items-center gap-2" data-testid={`insight-category-${i}`}>
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-sm truncate">{(t.categories as Record<string, string>)[cat.category] || cat.category}</span>
                          <span className="text-xs font-mono shrink-0">{formatCurrency(cat.amount)}</span>
                        </div>
                        <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {(!insight?.topCategories || insight.topCategories.length === 0) && chartBars.every(b => b.amount === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">{t.dashboard.insightNoSpending}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

type ActionType = "income" | "expense" | "transfer" | "savings" | "debt_payment" | "no_spend";
export type { ActionType };

const quickTxSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().min(1, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
});

const savingsSchema = z.object({
  goalId: z.string().min(1, "Goal is required"),
  amount: z.string().min(1, "Amount is required"),
  fromAccountId: z.string().min(1, "Rekening harus dipilih"),
});

const debtPaymentSchema = z.object({
  liabilityId: z.string().min(1, "Debt is required"),
  amount: z.string().min(1, "Amount is required"),
  fromAccountId: z.string().min(1, "Rekening harus dipilih"),
});

function StreakCelebration({ streak, onClose, t }: { streak: number; onClose: () => void; t: any }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const milestoneLevel = getMilestoneLevel(streak);
  const milestoneName = getMilestoneName(milestoneLevel);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
      data-testid="streak-celebration"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={cn(
          "relative flex flex-col items-center gap-4 transition-all duration-500 ease-out",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-50"
        )}
      >
        <MilestoneFlame streakDays={streak} size={160} showUnlock={true} />
        <div className="text-center z-10">
          <p className="text-7xl font-black text-white font-mono tracking-tight drop-shadow-[0_0_20px_rgba(168,85,247,0.6)]" data-testid="text-streak-celebration-number">
            {streak}
          </p>
          <p className="text-xl font-bold text-white/90 mt-1 tracking-wide uppercase" data-testid="text-streak-celebration-title">
            {t.dashboard.streakCelebrationTitle}
          </p>
          {milestoneName && (
            <p className="text-sm font-semibold text-amber-300/80 mt-1" data-testid="text-streak-milestone">
              {milestoneName}
            </p>
          )}
          <p className="text-sm text-white/60 mt-1">
            {t.dashboard.streakCelebrationSubtitle}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="mt-2 text-white border-white/30 bg-white/10 backdrop-blur-sm z-10"
          data-testid="button-streak-celebration-close"
        >
          {t.dashboard.streakCelebrationClose}
        </Button>
      </div>
    </div>
  );
}

function ActionPickerMenu({
  onSelect,
  t,
}: {
  onSelect: (action: ActionType) => void;
  t: any;
}) {
  const actions: { type: ActionType; label: string; desc: string; icon: typeof ArrowDownLeft; color: string }[] = [
    { type: "income", label: t.dashboard.actionIncome, desc: t.dashboard.actionIncomeDesc, icon: ArrowDownLeft, color: "text-green-600 dark:text-green-400 bg-green-500/10" },
    { type: "expense", label: t.dashboard.actionExpense, desc: t.dashboard.actionExpenseDesc, icon: ArrowUpRight, color: "text-red-500 dark:text-red-400 bg-red-500/10" },
    { type: "transfer", label: t.dashboard.actionTransfer, desc: t.dashboard.actionTransferDesc, icon: ArrowLeftRight, color: "text-blue-500 dark:text-blue-400 bg-blue-500/10" },
    { type: "savings", label: t.dashboard.actionSavings, desc: t.dashboard.actionSavingsDesc, icon: PiggyBank, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" },
    { type: "debt_payment", label: t.dashboard.actionDebtPayment, desc: t.dashboard.actionDebtPaymentDesc, icon: CreditCard, color: "text-orange-600 dark:text-orange-400 bg-orange-500/10" },
    { type: "no_spend", label: t.dashboard.actionNoSpend, desc: t.dashboard.actionNoSpendDesc, icon: CalendarOff, color: "text-slate-600 dark:text-slate-400 bg-slate-500/10" },
  ];

  return (
    <div className="px-6 max-md:px-6 md:px-0 space-y-2 pb-6">
      {actions.map((a) => (
        <button
          key={a.type}
          type="button"
          onClick={() => onSelect(a.type)}
          className="w-full flex items-center gap-3 p-3 rounded-md hover-elevate transition-colors text-left"
          data-testid={`button-action-${a.type}`}
        >
          <div className={cn("rounded-md p-2.5 shrink-0", a.color)}>
            <a.icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{a.label}</p>
            <p className="text-xs text-muted-foreground">{a.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function TransactionForm({
  txType,
  onClose,
  t,
}: {
  txType: "income" | "expense" | "transfer";
  onClose: () => void;
  t: any;
}) {
  const { toast } = useToast();
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: customCategories } = useQuery<CustomCategory[]>({ queryKey: ["/api/custom-categories"] });

  const form = useForm({
    resolver: zodResolver(quickTxSchema),
    defaultValues: {
      type: txType as "income" | "expense" | "transfer",
      amount: "",
      date: format(new Date(), "yyyy-MM-dd"),
      fromAccountId: "",
      toAccountId: "",
      category: "",
      note: "",
    },
  });

  const watchType = txType;
  const userCategories = customCategories?.filter(c => c.type === watchType) || [];

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof quickTxSchema>) => {
      const payload: Record<string, unknown> = {
        type: data.type,
        amount: data.amount,
        date: data.date,
        category: data.category || null,
        note: data.note || null,
      };
      if (data.type === "expense" || data.type === "transfer") {
        payload.fromAccountId = data.fromAccountId ? parseInt(data.fromAccountId) : null;
      }
      if (data.type === "income" || data.type === "transfer") {
        payload.toAccountId = data.toAccountId ? parseInt(data.toAccountId) : null;
      }
      return apiRequest("POST", "/api/transactions", payload);
    },
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/spending-insight") });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-focus"] });
      toast({ title: t.transactions.submit, description: "+5 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const watchFromAccountId = form.watch("fromAccountId");
  const watchAmount = form.watch("amount");

  const selectedFromAccount = accounts?.find(a => String(a.id) === watchFromAccountId);
  const hasInsufficientBalance = selectedFromAccount && watchAmount &&
    (watchType === "expense" || watchType === "transfer") &&
    Number(watchAmount) > Number(selectedFromAccount.balance);

  if (!accounts || accounts.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <Wallet className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.noAccountsForTx}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        if (hasInsufficientBalance) {
          toast({ title: t.common.error, description: t.transactions.insufficientBalanceTx, variant: "destructive" });
          return;
        }
        mutation.mutate(data);
      })} className="flex flex-col max-md:flex-1 max-md:min-h-0">
        <div className="space-y-5 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <FormControl>
                  <CurrencyInput placeholder="0" className="min-h-[48px] text-lg" value={field.value} onChange={field.onChange} data-testid="input-quick-amount" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.date}</FormLabel>
                <FormControl>
                  <Input type="date" className="min-h-[48px]" {...field} data-testid="input-quick-date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {(watchType === "expense" || watchType === "transfer") && (
            <FormField
              control={form.control}
              name="fromAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.transactions.fromAccount}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-[48px]" data-testid="select-quick-from">
                        <SelectValue placeholder={t.transactions.selectAccount}>
                          {field.value && (() => {
                            const a = (accounts ?? []).find(ac => String(ac.id) === field.value);
                            return a ? (
                              <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span>
                            ) : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(accounts ?? []).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasInsufficientBalance && (
                    <p className="text-xs text-destructive mt-1">Saldo tidak mencukupi</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {(watchType === "income" || watchType === "transfer") && (
            <FormField
              control={form.control}
              name="toAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.transactions.toAccount}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-[48px]" data-testid="select-quick-to">
                        <SelectValue placeholder={t.transactions.selectAccount}>
                          {field.value && (() => {
                            const a = (accounts ?? []).find(ac => String(ac.id) === field.value);
                            return a ? (
                              <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span>
                            ) : null;
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(accounts ?? []).map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {watchType !== "transfer" && (
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.transactions.category}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-[48px]" data-testid="select-quick-category">
                        <SelectValue placeholder={t.transactions.selectCategory} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-72">
                      {watchType === "income" ? (
                        <SelectGroup>
                          <SelectLabel>{t.transactions.defaultCategories}</SelectLabel>
                          {INCOME_CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>{(t.categories as Record<string, string>)[c] || c}</SelectItem>
                          ))}
                        </SelectGroup>
                      ) : (
                        EXPENSE_CATEGORY_GROUPS.map((group) => (
                          <SelectGroup key={group.groupKey}>
                            <SelectLabel className="text-xs font-semibold uppercase tracking-widest">
                              {group.groupKey === "needs" ? t.transactions.needsGroup : t.transactions.wantsGroup}
                            </SelectLabel>
                            {group.items.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                <span className="mr-2">{item.emoji}</span>
                                {(t.categories as Record<string, string>)[item.value] || item.value}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      )}
                      {userCategories.length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>{t.transactions.customCategories}</SelectLabel>
                            {userCategories.map((c) => (
                              <SelectItem key={`custom-${c.id}`} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.note}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t.transactions.notePlaceholder} className="resize-none min-h-[48px]" {...field} data-testid="input-quick-note" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-4 pb-6 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-2 md:flex-row md:justify-end">
          <Button
            type="submit"
            disabled={mutation.isPending || !!hasInsufficientBalance}
            className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2"
            data-testid="button-quick-save"
          >
            {mutation.isPending ? "..." : t.transactions.submit}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[40px] max-md:min-h-[40px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
            {t.accounts.cancel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SavingsForm({ onClose, t }: { onClose: () => void; t: any }) {
  const { toast } = useToast();
  const { data: goals } = useQuery<Goal[]>({ queryKey: ["/api/goals"] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });

  const activeGoals = goals?.filter(g => Number(g.currentAmount) < Number(g.targetAmount)) ?? [];

  const form = useForm({
    resolver: zodResolver(savingsSchema),
    defaultValues: { goalId: "", amount: "", fromAccountId: "" },
  });

  const selectedGoalId = form.watch("goalId");
  const selectedGoal = activeGoals.find(g => String(g.id) === selectedGoalId);
  const watchFromId = form.watch("fromAccountId");
  const watchAmt = form.watch("amount");
  const selectedFrom = accounts?.find(a => String(a.id) === watchFromId);
  const hasBadBalance = selectedFrom && watchAmt && Number(watchAmt) > Number(selectedFrom.balance);

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof savingsSchema>) => {
      return apiRequest("POST", `/api/goals/${data.goalId}/deposit`, {
        amount: data.amount,
        fromAccountId: data.fromAccountId ? parseInt(data.fromAccountId) : null,
      });
    },
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/spending-insight") });
      toast({ title: t.dashboard.savingsRecorded, description: "+8 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  if (!accounts || accounts.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <Wallet className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.noAccountsForTx}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  if (activeGoals.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <PiggyBank className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.noGoals}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="flex flex-col max-md:flex-1 max-md:min-h-0">
        <div className="space-y-5 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-4">
          <FormField
            control={form.control}
            name="goalId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.dashboard.selectGoal}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="min-h-[48px]" data-testid="select-savings-goal">
                      <SelectValue placeholder={t.dashboard.selectGoal} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeGoals.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name} ({formatCurrency(Number(g.currentAmount))} / {formatCurrency(Number(g.targetAmount))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {selectedGoal && (
            <div className="rounded-md bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1.5">
                <span>{selectedGoal.name}</span>
                <span className="font-mono">{Math.round(Number(selectedGoal.currentAmount) / Number(selectedGoal.targetAmount) * 100)}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary/60 transition-all duration-300" style={{ width: `${Math.min(Number(selectedGoal.currentAmount) / Number(selectedGoal.targetAmount) * 100, 100)}%` }} />
              </div>
            </div>
          )}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <FormControl>
                  <CurrencyInput placeholder="0" className="min-h-[48px] text-lg" value={field.value} onChange={field.onChange} data-testid="input-savings-amount" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="min-h-[48px]" data-testid="select-savings-from">
                      <SelectValue placeholder={t.transactions.selectAccount}>
                        {field.value && (() => {
                          const a = (accounts ?? []).find(ac => String(ac.id) === field.value);
                          return a ? (
                            <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span>
                          ) : null;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasBadBalance && (
                  <p className="text-xs text-destructive mt-1">Saldo tidak mencukupi</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-4 pb-6 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-2 md:flex-row md:justify-end">
          <Button type="submit" disabled={mutation.isPending || !!hasBadBalance || !watchFromId} className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2" data-testid="button-savings-save">
            {mutation.isPending ? "..." : t.dashboard.depositToGoal}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[40px] max-md:min-h-[40px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
            {t.accounts.cancel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function DebtPaymentForm({ onClose, t }: { onClose: () => void; t: any }) {
  const { toast } = useToast();
  const { data: debts } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });

  const activeDebts = debts?.filter(d => {
    if (Number(d.amount) > 0) return true;
    if (d.monthlyPayment && d.remainingMonths && Number(d.monthlyPayment) > 0 && d.remainingMonths > 0) return true;
    return false;
  }) ?? [];

  const form = useForm({
    resolver: zodResolver(debtPaymentSchema),
    defaultValues: { liabilityId: "", amount: "", fromAccountId: "" },
  });

  const selectedDebtId = form.watch("liabilityId");
  const selectedDebt = activeDebts.find(d => String(d.id) === selectedDebtId);
  const watchDebtFromId = form.watch("fromAccountId");
  const watchDebtAmt = form.watch("amount");
  const selectedDebtFrom = accounts?.find(a => String(a.id) === watchDebtFromId);
  const hasDebtBadBalance = selectedDebtFrom && watchDebtAmt && Number(watchDebtAmt) > Number(selectedDebtFrom.balance);

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof debtPaymentSchema>) => {
      return apiRequest("POST", `/api/liabilities/${data.liabilityId}/pay`, {
        amount: data.amount,
        fromAccountId: data.fromAccountId ? parseInt(data.fromAccountId) : null,
      });
    },
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/spending-insight") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/debt-health") });
      toast({ title: t.dashboard.debtPaymentRecorded, description: "+8 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  if (!accounts || accounts.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <Wallet className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.noAccountsForTx}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  if (activeDebts.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">{t.dashboard.noDebts}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        if (hasDebtBadBalance) {
          toast({ title: t.common.error, description: t.dashboard.insufficientBalance, variant: "destructive" });
          return;
        }
        mutation.mutate(data);
      })} className="flex flex-col max-md:flex-1 max-md:min-h-0">
        <div className="space-y-5 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-4">
          <FormField
            control={form.control}
            name="liabilityId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.dashboard.selectDebt}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="min-h-[48px]" data-testid="select-debt-liability">
                      <SelectValue placeholder={t.dashboard.selectDebt} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activeDebts.map((d) => {
                      const displayAmount = Number(d.amount) > 0 ? Number(d.amount) : (d.monthlyPayment && d.remainingMonths ? Number(d.monthlyPayment) * d.remainingMonths : 0);
                      return (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name} ({t.dashboard.remainingDebt}: {formatCurrency(displayAmount)})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {selectedDebt && (
            <div className="rounded-md bg-muted/50 p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">{selectedDebt.name}</span>
                <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">{formatCurrency(Number(selectedDebt.amount))}</span>
              </div>
              {selectedDebt.monthlyPayment && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {formatCurrency(Number(selectedDebt.monthlyPayment))}/mo
                  {selectedDebt.remainingMonths ? ` · ${selectedDebt.remainingMonths} mo left` : ""}
                </p>
              )}
            </div>
          )}
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <FormControl>
                  <CurrencyInput placeholder="0" className="min-h-[48px] text-lg" value={field.value} onChange={field.onChange} data-testid="input-debt-amount" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="min-h-[48px]" data-testid="select-debt-from">
                      <SelectValue placeholder={t.transactions.selectAccount}>
                        {field.value && (() => {
                          const a = (accounts ?? []).find(ac => String(ac.id) === field.value);
                          return a ? (
                            <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span>
                          ) : null;
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(accounts ?? []).map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasDebtBadBalance && (
                  <p className="text-xs text-destructive mt-1">Saldo tidak mencukupi</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-4 pb-6 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-2 md:flex-row md:justify-end">
          <Button type="submit" disabled={mutation.isPending || !!hasDebtBadBalance || !watchDebtFromId} className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2" data-testid="button-debt-save">
            {mutation.isPending ? "..." : t.dashboard.payDebt}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[40px] max-md:min-h-[40px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
            {t.accounts.cancel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

type TxTabType = "expense" | "income" | "transfer" | "savings" | "debt_payment";

const TX_TABS: { type: TxTabType; icon: typeof ArrowUpRight; labelKey: string; color: string; activeBg: string; iconBg: string }[] = [
  { type: "expense", icon: ArrowUpRight, labelKey: "actionExpense", color: "text-red-500 dark:text-red-400", activeBg: "bg-red-500/15", iconBg: "bg-red-500/10" },
  { type: "income", icon: ArrowDownLeft, labelKey: "actionIncome", color: "text-green-600 dark:text-green-400", activeBg: "bg-green-500/15", iconBg: "bg-green-500/10" },
  { type: "transfer", icon: ArrowLeftRight, labelKey: "actionTransfer", color: "text-blue-500 dark:text-blue-400", activeBg: "bg-blue-500/15", iconBg: "bg-blue-500/10" },
  { type: "savings", icon: PiggyBank, labelKey: "actionSavings", color: "text-teal-600 dark:text-teal-400", activeBg: "bg-teal-500/15", iconBg: "bg-teal-500/10" },
  { type: "debt_payment", icon: CreditCard, labelKey: "actionDebtPayment", color: "text-orange-600 dark:text-orange-400", activeBg: "bg-orange-500/15", iconBg: "bg-orange-500/10" },
];

function TypeTabSelector({ current, onChange, onScan, t }: { current: TxTabType; onChange: (t: TxTabType) => void; onScan: () => void; t: any }) {
  const row1 = TX_TABS.slice(0, 3);
  const row2Left = TX_TABS.slice(3, 4);
  const row2Right = TX_TABS.slice(4);
  const renderTab = (tab: typeof TX_TABS[0]) => {
    const Icon = tab.icon;
    const active = current === tab.type;
    return (
      <button
        key={tab.type}
        type="button"
        onClick={() => onChange(tab.type)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-150 select-none",
          active ? tab.activeBg : "hover:bg-muted/50"
        )}
        data-testid={`button-tab-${tab.type}`}
      >
        <div className={cn("rounded-lg p-1.5 transition-colors", active ? tab.iconBg : "bg-muted/30")}>
          <Icon className={cn("w-4 h-4 transition-colors", active ? tab.color : "text-muted-foreground")} />
        </div>
        <span className={cn("text-[10px] font-medium leading-none transition-colors", active ? tab.color : "text-muted-foreground")}>
          {(t.dashboard as any)[tab.labelKey]}
        </span>
      </button>
    );
  };
  return (
    <div className="px-6 md:px-0 space-y-1 pb-1.5">
      <div className="flex gap-1.5">{row1.map(renderTab)}</div>
      <div className="flex gap-1.5">
        {row2Left.map(renderTab)}
        <button
          key="scan"
          type="button"
          onClick={onScan}
          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-150 select-none bg-violet-500/10 hover:bg-violet-500/15 ring-1 ring-violet-400/30"
          data-testid="button-tab-scan"
        >
          <div className="rounded-lg p-1.5 bg-violet-500/15 transition-colors">
            <Camera className="w-4 h-4 text-violet-500" />
          </div>
          <span className="text-[10px] font-medium leading-none text-violet-600 dark:text-violet-400">
            Scan
          </span>
        </button>
        {row2Right.map(renderTab)}
      </div>
    </div>
  );
}

function AddActionDialog({ open, onClose, t, onStreakTriggered, initialAction }: { open: boolean; onClose: () => void; t: any; onStreakTriggered?: () => void; initialAction?: ActionType | null }) {
  const [selectedTab, setSelectedTab] = useState<TxTabType>("expense");
  const [scanMode, setScanMode] = useState(false);

  useEffect(() => {
    if (open) {
      const validTabs: TxTabType[] = ["income", "expense", "transfer", "savings", "debt_payment"];
      setSelectedTab(validTabs.includes(initialAction as TxTabType) ? (initialAction as TxTabType) : "expense");
      setScanMode(false);
    }
  }, [open, initialAction]);

  const handleClose = () => {
    setScanMode(false);
    onClose();
    if (onStreakTriggered) onStreakTriggered();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContentBottomSheet>
        <DialogHeader className="px-6 max-md:px-6 md:px-0 pt-1 md:pt-0 shrink-0">
          <DialogTitle className="text-lg">{t.dashboard.addActionTitle}</DialogTitle>
          <DialogDescription>{t.transactions.dialogDesc}</DialogDescription>
        </DialogHeader>

        {scanMode ? (
          <ScanPanel onBack={() => setScanMode(false)} onSave={handleClose} />
        ) : (
          <>
            <TypeTabSelector current={selectedTab} onChange={setSelectedTab} onScan={() => setScanMode(true)} t={t} />

            {(selectedTab === "income" || selectedTab === "expense" || selectedTab === "transfer") && (
              <TransactionForm key={selectedTab} txType={selectedTab} onClose={handleClose} t={t} />
            )}

            {selectedTab === "savings" && (
              <SavingsForm key="savings" onClose={handleClose} t={t} />
            )}

            {selectedTab === "debt_payment" && (
              <DebtPaymentForm key="debt_payment" onClose={handleClose} t={t} />
            )}
          </>
        )}
      </DialogContentBottomSheet>
    </Dialog>
  );
}

// === MAIN DASHBOARD COMPONENT ===
// Layout (top to bottom):
// 1. Header row: welcome text + "Spend Nothing Today" button (always visible)
// 2. SmartSaveAlert notification (dismissible)
// 3. Streak + Level badges row
// 4. 2-column grid: Total Assets card (3 cols) | Today's Focus card (2 cols)
// 5. Spending Insight section (chart + categories)
// 6. Floating quick-add transaction button (fixed bottom center)
export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { hidden, toggle, animating } = useAmountVisibility();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [initialAction, setInitialAction] = useState<ActionType | null>(null);
  const [setupAccountOpen, setSetupAccountOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ActionType | null>(null);
  const [streakCelebration, setStreakCelebration] = useState<number | null>(null);
  const [levelUpCelebration, setLevelUpCelebration] = useState<number | null>(null);
  const [scrollCollapsed, setScrollCollapsed] = useState(false);
  const prevStreakRef = useRef<number | null>(null);
  const prevLevelRef = useRef<number | null>(null);

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent).detail as ActionType;
      if (!accounts || accounts.length === 0) {
        setPendingAction(action);
        setSetupAccountOpen(true);
      } else {
        setInitialAction(action);
        setQuickAddOpen(true);
      }
    };
    window.addEventListener("fr-open-action", handler);
    return () => window.removeEventListener("fr-open-action", handler);
  }, [accounts]);

  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  useEffect(() => {
    if (!profile) return;
    const current = profile.streakCount;
    const prev = prevStreakRef.current;
    if (prev !== null && current > prev && current > 0) {
      setStreakCelebration(current);
      playSound("streak");
    }
    prevStreakRef.current = current;
  }, [profile?.streakCount]);

  useEffect(() => {
    if (!profile) return;
    const current = profile.level;
    const prev = prevLevelRef.current;
    if (prev !== null && current > prev) {
      playSound("levelUp");
      setLevelUpCelebration(current);
    }
    prevLevelRef.current = current;
  }, [profile?.level]);

  useEffect(() => {
    const handleScroll = () => setScrollCollapsed(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { data: dashboard, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: rawFocus } = useQuery<DailyFocus[] | DailyFocus>({
    queryKey: ["/api/daily-focus"],
    refetchInterval: 30000,
  });

  const { data: badgesData } = useQuery<any[]>({
    queryKey: ["/api/badges"],
  });
  const unlockedBadgeCount = badgesData?.filter((b: any) => b.unlocked).length ?? 0;

  const { data: financeScore } = useQuery<{ totalScore: number; tier: string; warmingUp?: boolean }>({
    queryKey: ["/api/finance-score"],
  });

  const focusList = Array.isArray(rawFocus) ? rawFocus : rawFocus ? [rawFocus] : [];

  const checkStreakAfterAction = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
  }, []);

  const noSpendingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/no-spending"),
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-focus"] });
      toast({ title: "Recorded!", description: "No spending today. +5 XP earned!" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const isLoading = profileLoading || dashLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 rounded-md" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Skeleton className="h-56 rounded-md md:col-span-3" />
          <Skeleton className="h-56 rounded-md md:col-span-2" />
        </div>
        <Skeleton className="h-48 rounded-md" />
      </div>
    );
  }

  const xpInfo = getXpForNextLevel(profile?.xp ?? 0);
  const streak = profile?.streakCount ?? 0;
  const level = profile?.level ?? 1;
  const goalPct = Math.min(Math.round(dashboard?.goalProgress ?? 0), 100);

  const focusLabels: Record<string, string> = {
    log_transaction: t.dashboard.focusLogTransaction,
    save_money: t.dashboard.focusSaveMoney,
    check_debt_health: t.dashboard.focusCheckDebtHealth,
    review_goals: t.dashboard.focusReviewGoals,
  };
  const completedCount = focusList.filter(f => f.completed).length;
  const totalXp = focusList.reduce((s, f) => s + f.rewardXp, 0);

  return (
    <div className="p-4 sm:p-6 space-y-3 max-w-3xl mx-auto pb-2">

      {/* 1. Greeting — shrinks to one-liner on scroll */}
      <div className="flex items-start justify-between gap-3" id="dashboard-greeting">
        <div className="overflow-hidden">
          <div
            style={{
              maxHeight: scrollCollapsed ? "0px" : "80px",
              opacity: scrollCollapsed ? 0 : 1,
              overflow: "hidden",
              transition: "max-height 0.25s ease, opacity 0.2s ease",
            }}
          >
            <h1 className="text-xl font-serif font-bold" data-testid="text-dashboard-title">
              Hi, {user?.firstName || "Guest"} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Level {level} · {xpInfo.current}/{xpInfo.next} XP
            </p>
          </div>
          {scrollCollapsed && (
            <p className="text-sm font-medium text-muted-foreground" style={{ transition: "opacity 0.2s ease" }}>
              👋 Hi, {user?.firstName || "Guest"}
            </p>
          )}
        </div>
        <div className="hidden sm:block shrink-0 mt-0.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => noSpendingMutation.mutate()}
            disabled={noSpendingMutation.isPending}
            data-testid="button-no-spending"
          >
            <CalendarOff className="w-4 h-4 mr-1.5" />
            {t.dashboard.noSpending}
          </Button>
        </div>
      </div>

      {/* 2. Gamification Compact Bar — sticky + blurred on scroll */}
      <div
        className={cn(
          "flex items-center gap-2 text-xs font-medium w-fit max-w-full overflow-x-auto px-3 py-1.5 rounded-full transition-all duration-200",
          scrollCollapsed
            ? "sticky top-2 z-10 bg-background/85 backdrop-blur-md shadow-sm border border-border/40"
            : "bg-muted/50 dark:bg-muted/30"
        )}
      >
        <Flame
          className="w-3.5 h-3.5 text-orange-500 shrink-0"
          style={streak > 3 ? { animation: "flameFlicker 1.8s ease-in-out infinite" } : undefined}
        />
        <span data-testid="text-streak-count" className="text-foreground">{streak} {t.dashboard.dayStreak}</span>
        <span className="opacity-30 select-none">·</span>
        <span data-testid="text-level-xp" className="text-foreground">Lv {level}</span>
        <span className="opacity-30 select-none">·</span>
        <span className="font-mono text-muted-foreground">{xpInfo.current}/{xpInfo.next} XP</span>
        {unlockedBadgeCount > 0 && (
          <>
            <span className="opacity-30 select-none">·</span>
            <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span data-testid="text-badge-count-dashboard" className="text-foreground">{unlockedBadgeCount}</span>
          </>
        )}
        {financeScore && !financeScore.warmingUp && (
          <>
            <span className="opacity-30 select-none">·</span>
            <Link href="/score" data-testid="link-finance-score-dashboard">
              <span className="text-primary font-semibold cursor-pointer hover:underline">{financeScore.tier}</span>
            </Link>
          </>
        )}
      </div>

      {/* 3. Total Assets — Hero card (full width) */}
      <Card className="border-0 text-white" style={{ background: "linear-gradient(135deg, #1E2F26 0%, #16221C 100%)" }} data-testid="card-total-assets">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-white/55" data-testid="text-total-assets-label">{t.dashboard.totalAssets}</p>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className={`transition-all duration-180 ease-in-out ${
                  hidden ? "text-white/55" : "text-white/45"
                } hover:brightness-125`}
                onClick={toggle}
                data-testid="button-toggle-amounts"
                aria-label={hidden ? "Show amounts" : "Hide amounts"}
                style={{ transition: "color 180ms ease-in-out, transform 180ms ease-in-out" }}
              >
                <span
                  className="inline-flex transition-transform duration-180 ease-in-out"
                  style={{ transform: animating ? "rotate(-8deg)" : "rotate(0deg)" }}
                >
                  {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </span>
              </Button>
              <TrendingUp className="w-5 h-5 text-emerald-400/70" />
            </div>
          </div>
          <p
            className="text-3xl sm:text-4xl font-bold font-mono tracking-tight"
            data-testid="text-total-assets"
            style={{
              opacity: animating ? 0 : 1,
              transform: animating ? "scale(0.98)" : "scale(1)",
              transition: "opacity 180ms ease-in-out, transform 180ms ease-in-out",
            }}
          >
            {hidden ? MASKED_LONG : formatCurrency(dashboard?.totalAssets ?? 0)}
          </p>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="rounded-md bg-white/8 p-2.5" data-testid="card-cash">
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[11px] text-white/50">{t.dashboard.cash}</span>
              </div>
              <p
                className="text-sm font-mono font-semibold"
                data-testid="text-cash-amount"
                style={{
                  opacity: animating ? 0 : 1,
                  transform: animating ? "scale(0.98)" : "scale(1)",
                  transition: "opacity 180ms ease-in-out, transform 180ms ease-in-out",
                }}
              >{hidden ? MASKED_SHORT : formatShort(dashboard?.totalCash ?? 0)}</p>
            </div>
            <div className="rounded-md bg-white/8 p-2.5" data-testid="card-bank">
              <div className="flex items-center gap-1.5 mb-1">
                <Landmark className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[11px] text-white/50">{t.dashboard.bank}</span>
              </div>
              <p
                className="text-sm font-mono font-semibold"
                data-testid="text-bank-amount"
                style={{
                  opacity: animating ? 0 : 1,
                  transform: animating ? "scale(0.98)" : "scale(1)",
                  transition: "opacity 180ms ease-in-out, transform 180ms ease-in-out",
                }}
              >{hidden ? MASKED_SHORT : formatShort(dashboard?.totalBank ?? 0)}</p>
            </div>
            <div className="rounded-md bg-white/8 p-2.5" data-testid="card-ewallet">
              <div className="flex items-center gap-1.5 mb-1">
                <Smartphone className="w-3.5 h-3.5 text-white/50" />
                <span className="text-[11px] text-white/50">{t.dashboard.ewallet}</span>
              </div>
              <p
                className="text-sm font-mono font-semibold"
                data-testid="text-ewallet-amount"
                style={{
                  opacity: animating ? 0 : 1,
                  transform: animating ? "scale(0.98)" : "scale(1)",
                  transition: "opacity 180ms ease-in-out, transform 180ms ease-in-out",
                }}
              >{hidden ? MASKED_SHORT : formatShort(dashboard?.totalEwallet ?? 0)}</p>
            </div>
          </div>

          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-white/50">{t.dashboard.savingsGoal}</span>
              <span className="text-sm font-mono font-semibold text-emerald-400/80" data-testid="text-goal-pct">{goalPct}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                style={{ width: `${goalPct}%` }}
                data-testid="progress-savings-goal"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Menu Utama — quick access grid */}
      <Card data-testid="card-main-menu">
        <CardContent className="p-5">
          <h3 className="text-xs font-semibold text-muted-foreground mb-4 uppercase tracking-widest">{(t as any).mainMenu?.title || "Main Menu"}</h3>
          <div className="grid grid-cols-5 gap-2">
            {[
              { key: "budget", icon: PiggyBank, path: "/budget", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 dark:bg-emerald-500/15" },
              { key: "goals", icon: Target, path: "/goals", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10 dark:bg-amber-500/15" },
              { key: "debt", icon: CreditCard, path: "/debt", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10 dark:bg-rose-500/15" },
              { key: "asset", icon: TrendingUp, path: "/networth", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-500/10 dark:bg-sky-500/15" },
              { key: "reports", icon: LineChart, path: "/score", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10 dark:bg-violet-500/15" },
            ].map((item) => {
              const Icon = item.icon;
              const label = (t as any).mainMenu?.[item.key] || item.key;
              return (
                <Link key={item.key} href={item.path} data-testid={`menu-${item.key}`}>
                  <div className="flex flex-col items-center gap-2 group cursor-pointer">
                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-active:scale-95", item.bg)}>
                      <Icon className={cn("w-5 h-5", item.color)} strokeWidth={2} />
                    </div>
                    <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight group-hover:text-foreground transition-colors duration-200">{label}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 4. Smart Save — compact inline banner below hero */}
      <SmartSaveAlert t={t} />

      {/* 5. Today's Focus */}
      {focusList.length > 0 && (
        <Card className="border-l-[3px] border-l-primary bg-primary/5 dark:bg-primary/8" data-testid="card-today-focus">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">{t.dashboard.todaysFocus}</span>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {completedCount}/{focusList.length} · +{totalXp} XP
              </Badge>
            </div>

            <div className="space-y-3">
              {focusList.map((focus) => (
                <div
                  key={focus.id}
                  className={`flex items-start gap-2.5 rounded-md px-3 py-2.5 transition-colors ${
                    focus.completed
                      ? "bg-primary/10 dark:bg-primary/15"
                      : "bg-background dark:bg-card"
                  }`}
                  data-testid={`focus-item-${focus.id}`}
                >
                  <div className="mt-0.5 shrink-0">
                    {focus.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-primary" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${focus.completed ? "line-through text-muted-foreground" : "font-medium"}`}>
                      {focusLabels[focus.type] || focus.type}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">+{focus.rewardXp} XP</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Spending Insight */}
      <SpendingInsightSection t={t} />

      {/* 7. Monthly Activity Calendar */}
      <MonthlyActivityCalendar />

      <SetupFirstAccountModal
        open={setupAccountOpen}
        onClose={() => { setSetupAccountOpen(false); setPendingAction(null); }}
        onSuccess={() => {
          if (pendingAction) {
            setInitialAction(pendingAction);
            setQuickAddOpen(true);
          }
          setPendingAction(null);
        }}
      />

      <AddActionDialog
        open={quickAddOpen}
        onClose={() => { setQuickAddOpen(false); setInitialAction(null); }}
        t={t}
        onStreakTriggered={checkStreakAfterAction}
        initialAction={initialAction}
      />

      {streakCelebration !== null && (
        <StreakCelebration
          streak={streakCelebration}
          onClose={() => setStreakCelebration(null)}
          t={t}
        />
      )}

      {levelUpCelebration !== null && (
        <LevelUpCelebration
          level={levelUpCelebration}
          xpCurrent={xpInfo.current}
          xpNext={xpInfo.next}
          onClose={() => setLevelUpCelebration(null)}
          t={t}
        />
      )}
    </div>
  );
}
