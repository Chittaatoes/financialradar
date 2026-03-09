import { useState, useEffect } from "react";
import { playSound } from "@/hooks/use-sound";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog, DialogContentBottomSheet, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle, CheckCircle2, AlertCircle, Gauge, Pencil, CalendarDays, ChevronDown, ChevronUp, Plus, Trash2, Lock,
} from "lucide-react";
import type { CustomCategory } from "@shared/schema";
import { formatCurrency } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { API_URL } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import type { UserProfile, BudgetAllocation, BudgetPlan, Goal } from "@shared/schema";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { BudgetSetupWizard } from "@/components/budget-setup-wizard";
import { EmojiPicker } from "@/components/emoji-picker";
import { cn } from "@/lib/utils";

interface BudgetSummaryData {
  monthlyIncome: number;
  totalAllocated: number;
  totalSpent: number;
  overBudget: boolean;
  categories: {
    category: string;
    budgetLimit: number;
    spent: number;
    remaining: number;
  }[];
  spentByCategory: Record<string, number>;
  depositsByGoal: Record<string, number>;
}

interface DebtHealthData {
  monthlyIncome: number;
  totalMonthlyInstallments: number;
  dsr: number;
  remainingAfterDebt: number;
  pressureStatus: "stable" | "moderate" | "high";
}

const BUDGET_CATEGORIES = {
  needs: [
    { key: "food", emoji: "🍽️", i18nKey: "catFood" },
    { key: "housing", emoji: "🏠", i18nKey: "catHousing" },
    { key: "transport", emoji: "🚌", i18nKey: "catTransport" },
    { key: "electricity", emoji: "💡", i18nKey: "catElectricity" },
    { key: "water", emoji: "💧", i18nKey: "catWater" },
    { key: "health", emoji: "🏥", i18nKey: "catHealth" },
    { key: "education", emoji: "🎓", i18nKey: "catEducation" },
  ],
  wants: [
    { key: "online_shopping", emoji: "🛍️", i18nKey: "catOnlineShopping" },
    { key: "hangout", emoji: "☕", i18nKey: "catHangout" },
    { key: "entertainment", emoji: "🎮", i18nKey: "catEntertainment" },
    { key: "snacks", emoji: "🍩", i18nKey: "catSnacks" },
    { key: "hobby", emoji: "🎨", i18nKey: "catHobby" },
    { key: "lifestyle", emoji: "✨", i18nKey: "catLifestyle" },
  ],
  savings: [
    { key: "savings", emoji: "💰", i18nKey: "catSavings" },
  ],
  investment: [
    { key: "investment", emoji: "📈", i18nKey: "catInvestment" },
  ],
};

const GROUP_COLORS = {
  needs: { dot: "bg-purple-400", bar: "bg-purple-400", barWarn: "bg-amber-500", barOver: "bg-red-500", text: "text-purple-400" },
  wants: { dot: "bg-orange-400", bar: "bg-orange-400", barWarn: "bg-amber-500", barOver: "bg-red-500", text: "text-orange-400" },
  savings: { dot: "bg-blue-400", bar: "bg-blue-400", barWarn: "bg-amber-500", barOver: "bg-red-500", text: "text-blue-400" },
  investment: { dot: "bg-emerald-400", bar: "bg-emerald-400", barWarn: "bg-amber-500", barOver: "bg-red-500", text: "text-emerald-400" },
};

function CashflowPressureSection({ health }: { health: DebtHealthData }) {
  const { t } = useLanguage();

  const pressureLabels: Record<string, string> = {
    stable: t.debtHealth.pressureStable,
    moderate: t.debtHealth.pressureModerate,
    high: t.debtHealth.pressureHigh,
  };
  const pressureDescs: Record<string, string> = {
    stable: t.debtHealth.pressureStableDesc,
    moderate: t.debtHealth.pressureModerateDesc,
    high: t.debtHealth.pressureHighDesc,
  };
  const pressureColors: Record<string, { color: string; bg: string }> = {
    stable: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
    moderate: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
    high: { color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10" },
  };
  const pressureIcons: Record<string, typeof CheckCircle2> = {
    stable: CheckCircle2,
    moderate: AlertTriangle,
    high: AlertCircle,
  };

  const ps = health.pressureStatus;
  const PIcon = pressureIcons[ps];
  const pColor = pressureColors[ps];
  const dsrClamped = Math.min(health.dsr, 100);

  if (health.monthlyIncome <= 0) return null;

  return (
    <Card data-testid="card-cashflow-pressure">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pColor.bg}`}>
            <PIcon className={`w-5 h-5 ${pColor.color}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Gauge className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-bold">{t.budget.pressureSection}</h2>
            </div>
            <p className={`text-sm font-semibold ${pColor.color}`}>{pressureLabels[ps]}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{t.debtHealth.monthlyIncome}</p>
            <p className="font-mono font-semibold text-sm mt-0.5">{formatCurrency(health.monthlyIncome)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t.debtHealth.totalInstallments}</p>
            <p className="font-mono font-semibold text-sm mt-0.5">{formatCurrency(health.totalMonthlyInstallments)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t.debtHealth.remainingAfterDebt}</p>
            <p className={`font-mono font-semibold text-sm mt-0.5 ${health.remainingAfterDebt < 0 ? "text-red-500" : ""}`}>
              {formatCurrency(health.remainingAfterDebt)}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{t.debtHealth.debtLoad}</p>
            <p className={`font-mono font-bold text-sm mt-0.5 ${pColor.color}`}>
              {Math.round(health.dsr)}%
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <Progress value={dsrClamped} className="h-2.5" />
          <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
            <span>0%</span>
            <span>30%</span>
            <span>40%</span>
            <span>100%</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{pressureDescs[ps]}</p>
      </CardContent>
    </Card>
  );
}

function SetBudgetDialog({
  open,
  onOpenChange,
  category,
  emoji,
  label,
  currentAmount,
  currentNote,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
  emoji: string;
  label: string;
  currentAmount: number;
  currentNote: string;
  month: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [amount, setAmount] = useState(currentAmount > 0 ? String(currentAmount) : "");
  const [note, setNote] = useState(currentNote);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/budget", {
        category,
        budgetLimit: amount,
        month,
        note: note || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget/summary"] });
      playSound("transaction");
      toast({ title: t.budget.budgetSaved });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContentBottomSheet>
        <DialogHeader className="px-6 max-md:px-6 md:px-0 pt-1 md:pt-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            <span>{emoji}</span> {t.budget.setMonthlyBudget}
          </DialogTitle>
          <DialogDescription>{label}</DialogDescription>
        </DialogHeader>
        <div className="px-6 max-md:px-6 md:px-0 pb-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t.budget.budgetAmount}</label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              placeholder="0"
              data-testid="input-budget-amount"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t.budget.note}</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.budget.notePlaceholder}
              data-testid="input-budget-note"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              {t.budget.cancel}
            </Button>
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !amount || parseFloat(amount) <= 0}
              data-testid="button-budget-save"
            >
              {t.budget.save}
            </Button>
          </div>
        </div>
      </DialogContentBottomSheet>
    </Dialog>
  );
}

function SavingsGoalGroup({
  title,
  groupLimit,
  goals,
  depositsByGoal,
  colors,
}: {
  title: string;
  groupLimit: number;
  goals: Goal[];
  depositsByGoal: Record<string, number>;
  colors: typeof GROUP_COLORS.savings;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const groupDeposited = Object.values(depositsByGoal).reduce((s, v) => s + v, 0);
  const pct = groupLimit > 0 ? Math.min((groupDeposited / groupLimit) * 100, 100) : 0;
  const isOver = groupDeposited > groupLimit && groupLimit > 0;
  const isWarn = pct > 70 && !isOver;

  return (
    <div className="rounded-[18px] overflow-hidden border border-border bg-card">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full", colors.dot)} />
            <span className="text-[13px] font-bold uppercase tracking-wider text-foreground">{title}</span>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {groupLimit > 0 && (
          <>
            <div className="h-1 rounded-full bg-muted overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isOver ? colors.barOver : isWarn ? colors.barWarn : colors.bar
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Disetorkan: <span className="font-mono text-foreground/70">{formatCurrency(groupDeposited)}</span></span>
              <span className="text-muted-foreground">Batas: <span className="font-mono text-foreground/70">{formatCurrency(groupLimit)}</span></span>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {goals.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <span className="text-3xl">🎯</span>
              <p className="text-sm text-muted-foreground">Tambahkan target tabungan untuk mengelola tabungan Anda.</p>
            </div>
          ) : (
            goals.map((goal) => {
              const current = Number(goal.currentAmount);
              const target = Number(goal.targetAmount);
              const goalPct = target > 0 ? Math.min((current / target) * 100, 100) : 0;

              return (
                <div
                  key={goal.id}
                  className="w-full text-left rounded-xl border border-dashed border-border p-3 flex items-center gap-3"
                >
                  <span className="text-xl shrink-0">🎯</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{goal.name}</p>
                    <div className="mt-1">
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                          style={{ width: `${goalPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-medium text-foreground/80">{formatCurrency(current)}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{formatCurrency(target)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


function CategoryGroup({
  groupKey,
  title,
  groupLimit,
  categories,
  allocations,
  spentByCategory,
  month,
  colors,
  isGoogleUser,
}: {
  groupKey: keyof typeof GROUP_COLORS;
  title: string;
  groupLimit: number;
  categories: { key: string; emoji: string; i18nKey: string }[];
  allocations: BudgetAllocation[];
  spentByCategory: Record<string, number>;
  month: string;
  colors: typeof GROUP_COLORS.needs;
  isGoogleUser: boolean;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [editingCat, setEditingCat] = useState<{ key: string; emoji: string; label: string } | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [deletingCat, setDeletingCat] = useState<CustomCategory | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("📌");

  const isManageable = groupKey === "needs" || groupKey === "wants";

  const { data: customCats = [] } = useQuery<CustomCategory[]>({
    queryKey: ["/api/custom-categories"],
    enabled: isManageable,
  });
  const groupCustomCats = customCats.filter(c => c.type === groupKey);

  const addMutation = useMutation({
    mutationFn: (data: { name: string; emoji: string; type: string }) =>
      apiRequest("POST", "/api/custom-categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      setAddCatOpen(false);
      setNewCatName("");
      setNewCatEmoji("📌");
      toast({ title: "Kategori berhasil ditambahkan!" });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menambahkan kategori", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      setDeletingCat(null);
      toast({ title: "Kategori berhasil dihapus." });
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menghapus kategori", description: err.message, variant: "destructive" });
    },
  });

  const getAllocation = (key: string) => {
    const a = allocations.find((al) => al.category === key);
    return a ? Number(a.budgetLimit) : 0;
  };
  const getNote = (key: string) => {
    const a = allocations.find((al) => al.category === key);
    return a?.note ?? "";
  };

  const defaultGroupSpent = categories.reduce((sum, cat) => sum + (spentByCategory[cat.key] ?? 0), 0);
  const customGroupSpent = groupCustomCats.reduce((sum, cat) => sum + (spentByCategory[cat.name] ?? 0), 0);
  const groupSpent = defaultGroupSpent + customGroupSpent;
  const pct = groupLimit > 0 ? Math.min((groupSpent / groupLimit) * 100, 100) : 0;
  const isOver = groupSpent > groupLimit && groupLimit > 0;
  const isWarn = pct > 70 && !isOver;

  return (
    <div className="rounded-[18px] overflow-hidden border border-border bg-card">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full", colors.dot)} />
            <span className="text-[13px] font-bold uppercase tracking-wider text-foreground">{title}</span>
            <button
              type="button"
              className="text-[11px] font-medium text-muted-foreground border border-border rounded-md px-2 py-0.5 hover:bg-muted transition-colors"
              onClick={() => {
                const firstCat = categories[0];
                if (firstCat) setEditingCat({ key: firstCat.key, emoji: firstCat.emoji, label: (t.budget as any)[firstCat.i18nKey] || firstCat.key });
              }}
            >
              {t.budget.editGroup}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>

        {groupLimit > 0 && (
          <>
            <div className="h-1 rounded-full bg-muted overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isOver ? colors.barOver : isWarn ? colors.barWarn : colors.bar
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{t.budget.groupSpent}: <span className="font-mono text-foreground/70">{formatCurrency(groupSpent)}</span></span>
              <span className="text-muted-foreground">{t.budget.groupLimit}: <span className="font-mono text-foreground/70">{formatCurrency(groupLimit)}</span></span>
            </div>
          </>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {/* Default categories */}
          {categories.map((cat) => {
            const label = (t.budget as any)[cat.i18nKey] || cat.key;
            const alloc = getAllocation(cat.key);
            const spent = spentByCategory[cat.key] ?? 0;
            const hasAlloc = alloc > 0;

            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setEditingCat({ key: cat.key, emoji: cat.emoji, label })}
                className="w-full text-left rounded-xl border border-dashed border-border p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                data-testid={`budget-card-${cat.key}`}
              >
                <span className="text-xl shrink-0">{cat.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  {!hasAlloc && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <p className="text-[11px] text-amber-500 uppercase font-semibold tracking-wide">{t.budget.notAllocated}</p>
                    </div>
                  )}
                  {hasAlloc && (
                    <div className="space-y-1 mt-1">
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            spent > alloc ? colors.barOver : (spent / alloc) > 0.7 ? colors.barWarn : colors.bar
                          )}
                          style={{ width: `${Math.min((spent / alloc) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono font-medium text-foreground/80">{formatCurrency(spent)}</p>
                  {hasAlloc && <p className="text-[10px] text-muted-foreground font-mono">{formatCurrency(alloc)}</p>}
                </div>
              </button>
            );
          })}

          {/* Custom categories */}
          {isManageable && groupCustomCats.map((cat) => {
            const alloc = getAllocation(cat.name);
            const spent = spentByCategory[cat.name] ?? 0;
            const hasAlloc = alloc > 0;

            return (
              <div key={cat.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCat({ key: cat.name, emoji: cat.emoji ?? "📌", label: cat.name })}
                  className="flex-1 text-left rounded-xl border border-dashed border-border p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-xl shrink-0">{cat.emoji ?? "📌"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    {!hasAlloc && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <p className="text-[11px] text-amber-500 uppercase font-semibold tracking-wide">{t.budget.notAllocated}</p>
                      </div>
                    )}
                    {hasAlloc && (
                      <div className="space-y-1 mt-1">
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              spent > alloc ? colors.barOver : (spent / alloc) > 0.7 ? colors.barWarn : colors.bar
                            )}
                            style={{ width: `${Math.min((spent / alloc) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-medium text-foreground/80">{formatCurrency(spent)}</p>
                    {hasAlloc && <p className="text-[10px] text-muted-foreground font-mono">{formatCurrency(alloc)}</p>}
                  </div>
                </button>
                {isGoogleUser && (
                  <button
                    type="button"
                    onClick={() => setDeletingCat(cat)}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add category button — Google users only */}
          {isManageable && isGoogleUser && (
            <button
              type="button"
              onClick={() => setAddCatOpen(true)}
              className="w-full rounded-xl border border-dashed border-border p-3 flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors mt-1"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Tambah Kategori</span>
            </button>
          )}
          {isManageable && !isGoogleUser && (
            <Link href="/profile">
              <div className="w-full rounded-xl border border-dashed border-border/50 p-3 flex items-center justify-center gap-2 text-muted-foreground/60 mt-1 cursor-pointer hover:bg-muted/20 transition-colors">
                <Lock className="w-3.5 h-3.5" />
                <span className="text-xs">Tautkan Google untuk tambah kategori</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Budget edit dialog */}
      {editingCat && (
        <SetBudgetDialog
          open={!!editingCat}
          onOpenChange={(open) => { if (!open) setEditingCat(null); }}
          category={editingCat.key}
          emoji={editingCat.emoji}
          label={editingCat.label}
          currentAmount={getAllocation(editingCat.key)}
          currentNote={getNote(editingCat.key)}
          month={month}
        />
      )}

      {/* Add category bottom sheet */}
      <Dialog open={addCatOpen} onOpenChange={(v) => { if (!v) { setAddCatOpen(false); setNewCatName(""); setNewCatEmoji("📌"); } }}>
        <DialogContentBottomSheet>
          <DialogHeader className="px-6 pt-1">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Tambah Kategori
            </DialogTitle>
            <DialogDescription>
              Tambah kategori kustom ke grup {groupKey === "needs" ? "Kebutuhan" : "Keinginan"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6 pb-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nama Kategori</label>
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Contoh: Gym, Skincare, Laundry..."
                className="mt-1.5"
                maxLength={40}
                autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pilih Emoji</label>
                <span className="text-2xl w-9 h-9 flex items-center justify-center rounded-lg border border-border bg-muted leading-none">{newCatEmoji}</span>
              </div>
              <EmojiPicker value={newCatEmoji} onChange={setNewCatEmoji} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setAddCatOpen(false); setNewCatName(""); setNewCatEmoji("📌"); }}>
                Batal
              </Button>
              <Button
                className="flex-1"
                onClick={() => addMutation.mutate({ name: newCatName.trim(), emoji: newCatEmoji, type: groupKey })}
                disabled={addMutation.isPending || !newCatName.trim()}
              >
                {addMutation.isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </div>
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      {/* Delete confirmation bottom sheet */}
      <Dialog open={!!deletingCat} onOpenChange={(v) => { if (!v) setDeletingCat(null); }}>
        <DialogContentBottomSheet>
          <DialogHeader className="px-6 pt-1">
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-destructive" />
              Hapus Kategori
            </DialogTitle>
            <DialogDescription>
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            <div className="rounded-xl bg-muted p-4 flex items-center gap-3">
              <span className="text-2xl">{deletingCat?.emoji ?? "📌"}</span>
              <div>
                <p className="font-semibold">{deletingCat?.name}</p>
                <p className="text-xs text-muted-foreground">Kategori kustom · {groupKey === "needs" ? "Kebutuhan" : "Keinginan"}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Kategori <span className="font-semibold text-foreground">{deletingCat?.name}</span> akan dihapus dari daftar kategori. Data transaksi yang sudah ada tidak akan terpengaruh.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeletingCat(null)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deletingCat && deleteMutation.mutate(deletingCat.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
              </Button>
            </div>
          </div>
        </DialogContentBottomSheet>
      </Dialog>
    </div>
  );
}

export default function BudgetPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { isGuest } = useAuth();
  const isGoogleUser = !isGuest;
  const currentMonth = format(new Date(), "yyyy-MM");
  const monthStart = format(startOfMonth(new Date()), "dd MMM");
  const monthEnd = format(endOfMonth(new Date()), "dd MMM");

  const [wizardOpen, setWizardOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const { data: budgetPlan, isLoading: planLoading } = useQuery<BudgetPlan | null>({
    queryKey: ["/api/budget-plan", currentMonth],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/budget-plan?month=${currentMonth}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<BudgetSummaryData>({
    queryKey: ["/api/budget/summary", currentMonth],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/budget/summary?month=${currentMonth}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: allocations } = useQuery<BudgetAllocation[]>({
    queryKey: ["/api/budget", currentMonth],
    queryFn: async () => {
      const r = await fetch(`${API_URL}/api/budget?month=${currentMonth}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: goals = [] } = useQuery<Goal[]>({
    queryKey: ["/api/goals"],
  });

  const { data: debtHealth } = useQuery<DebtHealthData>({
    queryKey: ["/api/debt-health"],
  });

  const deletePlanMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/budget-plan?month=${currentMonth}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget/summary"] });
      setResetConfirmOpen(false);
      setResetConfirmText("");
      setWizardOpen(true);
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!planLoading && budgetPlan === null) {
      setWizardOpen(true);
    }
  }, [planLoading, budgetPlan]);

  const spentByCategory = summary?.spentByCategory ?? {};
  const income = budgetPlan ? Number(budgetPlan.income) : (summary?.monthlyIncome ?? 0);
  const needsLimit = budgetPlan ? Number(budgetPlan.needsAmount) : 0;
  const wantsLimit = budgetPlan ? Number(budgetPlan.wantsAmount) : 0;
  const savingsLimit = budgetPlan ? Number(budgetPlan.savingsAmount) : 0;
  const investmentLimit = budgetPlan ? Number(budgetPlan.investmentAmount) : 0;
  const totalSpent = summary?.totalSpent ?? 0;

  const strategyLabel = budgetPlan?.strategy === "percentage" ? t.budget.strategyPercentage : t.budget.strategyFixed;

  if (summaryLoading || planLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-[20px]" />
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-serif font-bold" data-testid="text-budget-title">{t.budget.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.budget.subtitle}</p>
      </div>

      <BudgetSetupWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onComplete={() => setWizardOpen(false)}
        defaultIncome={profile?.monthlyIncome ? Number(profile.monthlyIncome) : undefined}
      />

      <div
        className="rounded-[20px] relative overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #1E2F26 0%, #16221C 40%, #1a2a22 100%)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
        data-testid="card-budget-summary"
      >
        <div className="absolute inset-0 rounded-[20px]" style={{ background: "radial-gradient(ellipse at 30% 20%, rgba(77,175,106,0.08) 0%, transparent 60%)" }} />
        <div className="relative z-10 p-6 space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">{t.budget.expectedIncome}</p>
              <p className="text-3xl font-mono font-bold text-white/90" data-testid="text-budget-income">
                {formatCurrency(income)}
              </p>
            </div>
            <button
              type="button"
              className="text-white/40 hover:text-white/70 transition-colors mt-1"
              onClick={() => setWizardOpen(true)}
              data-testid="button-edit-budget"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {budgetPlan && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className="text-[10px] border-white/20 text-white/60 uppercase tracking-wider"
              >
                {strategyLabel}
              </Badge>
              <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">
                {t.budget.periodMonthly}
              </Badge>
            </div>
          )}

          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center gap-1.5 text-white/40 text-[11px] mb-1">
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="uppercase tracking-wider">{t.budget.activePeriod}</span>
            </div>
            <p className="text-xl font-bold text-white/80">{monthStart} - {monthEnd}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{t.budget.totalAllocated}</p>
              <p className="font-mono font-semibold text-sm text-white/80 mt-0.5">{formatCurrency(needsLimit + wantsLimit + savingsLimit + investmentLimit)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{t.budget.totalSpent}</p>
              <p className="font-mono font-semibold text-sm text-white/80 mt-0.5">{formatCurrency(totalSpent)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">{t.budget.unallocated}</p>
              <p className="font-mono font-semibold text-sm text-emerald-400 mt-0.5">{formatCurrency(Math.max(0, income - (needsLimit + wantsLimit + savingsLimit + investmentLimit)))}</p>
            </div>
          </div>
        </div>
      </div>

      {debtHealth && debtHealth.monthlyIncome > 0 && (
        <CashflowPressureSection health={debtHealth} />
      )}

      {!budgetPlan ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm mb-4">{t.budget.noBudgetSet}</p>
            <Button onClick={() => setWizardOpen(true)} data-testid="button-setup-budget">
              {t.budget.setupBudget}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <CategoryGroup
            groupKey="needs"
            title={t.budget.needsGroup}
            groupLimit={needsLimit}
            categories={BUDGET_CATEGORIES.needs}
            allocations={allocations ?? []}
            spentByCategory={spentByCategory}
            month={currentMonth}
            colors={GROUP_COLORS.needs}
            isGoogleUser={isGoogleUser}
          />
          <CategoryGroup
            groupKey="wants"
            title={t.budget.wantsGroup}
            groupLimit={wantsLimit}
            categories={BUDGET_CATEGORIES.wants}
            allocations={allocations ?? []}
            spentByCategory={spentByCategory}
            month={currentMonth}
            colors={GROUP_COLORS.wants}
            isGoogleUser={isGoogleUser}
          />
          <SavingsGoalGroup
            title={t.budget.savingsGroup}
            groupLimit={savingsLimit}
            goals={goals}
            depositsByGoal={summary?.depositsByGoal ?? {}}
            colors={GROUP_COLORS.savings}
          />
          <CategoryGroup
            groupKey="investment"
            title={t.budget.investmentGroup}
            groupLimit={investmentLimit}
            categories={BUDGET_CATEGORIES.investment}
            allocations={allocations ?? []}
            spentByCategory={spentByCategory}
            month={currentMonth}
            colors={GROUP_COLORS.investment}
            isGoogleUser={isGoogleUser}
          />
        </div>
      )}

      {budgetPlan && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-destructive transition-colors underline underline-offset-2"
            onClick={() => { setResetConfirmText(""); setResetConfirmOpen(true); }}
            data-testid="button-reset-budget"
          >
            {t.budget.resetBudget}
          </button>
        </div>
      )}

      <Dialog
        open={resetConfirmOpen}
        onOpenChange={(open) => {
          if (!open) { setResetConfirmOpen(false); setResetConfirmText(""); }
        }}
      >
        <DialogContentBottomSheet>
          <div className="bg-gradient-to-br from-destructive/10 via-destructive/5 to-background px-6 pt-2 pb-4 shrink-0 md:-mx-6 md:-mt-6">
            <DialogHeader className="text-center md:text-left space-y-1">
              <DialogTitle className="font-serif flex items-center gap-2 justify-center md:justify-start">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                Reset Budget
              </DialogTitle>
              <DialogDescription>
                Semua pengaturan anggaran bulan ini akan dihapus dan tidak bisa dikembalikan.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="overflow-y-auto px-6 pt-4 pb-6 md:px-0 md:pt-2 md:pb-0 space-y-4">
            <div className="rounded-xl bg-destructive/8 border border-destructive/20 p-3 space-y-1">
              <p className="text-xs font-medium text-destructive">Yang akan dihapus:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Rencana anggaran {format(new Date(), "MMMM yyyy")}</li>
                <li>Semua alokasi kategori bulan ini</li>
                <li>Pengaturan strategi (50/30/20 dll)</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                Ketik <span className="font-semibold text-foreground">Hapus</span> untuk konfirmasi
              </p>
              <Input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="Hapus"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setResetConfirmOpen(false); setResetConfirmText(""); }}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={resetConfirmText !== "Hapus" || deletePlanMutation.isPending}
                onClick={() => deletePlanMutation.mutate()}
              >
                {deletePlanMutation.isPending ? "Menghapus..." : "Reset Budget"}
              </Button>
            </div>
          </div>
        </DialogContentBottomSheet>
      </Dialog>
    </div>
  );
}
