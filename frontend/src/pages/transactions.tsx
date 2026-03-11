import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { playSound } from "@/hooks/use-sound";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogContentBottomSheet, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, X, Trash2, Calendar, PiggyBank, CreditCard,
  Wallet, Layers, ChevronDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, EXPENSE_CATEGORY_GROUPS, INCOME_CATEGORIES } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Account, Transaction, CustomCategory, Goal, Liability } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format, subDays, startOfMonth, endOfMonth, parseISO, eachDayOfInterval } from "date-fns";
import { useLanguage } from "@/lib/i18n";
import { SetupFirstAccountModal } from "@/components/setup-first-account-modal";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const transactionFormSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.string().min(1, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  fromAccountId: z.string().optional(),
  toAccountId: z.string().optional(),
  category: z.string().optional(),
  note: z.string().optional(),
});

type TxTabType = "expense" | "income" | "transfer" | "savings" | "debt_payment";

const typeConfig = {
  income: { icon: ArrowDownLeft, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10", label: "Income" },
  expense: { icon: ArrowUpRight, color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10", label: "Expense" },
  transfer: { icon: ArrowLeftRight, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-500/10", label: "Transfer" },
};

const TX_TAB_CONFIG: { type: TxTabType; icon: typeof ArrowUpRight; color: string; activeBg: string; iconBg: string; labelKey: string }[] = [
  { type: "expense", icon: ArrowUpRight, color: "text-red-500 dark:text-red-400", activeBg: "bg-red-500/15", iconBg: "bg-red-500/10", labelKey: "actionExpense" },
  { type: "income", icon: ArrowDownLeft, color: "text-green-600 dark:text-green-400", activeBg: "bg-green-500/15", iconBg: "bg-green-500/10", labelKey: "actionIncome" },
  { type: "transfer", icon: ArrowLeftRight, color: "text-blue-500 dark:text-blue-400", activeBg: "bg-blue-500/15", iconBg: "bg-blue-500/10", labelKey: "actionTransfer" },
  { type: "savings", icon: PiggyBank, color: "text-teal-600 dark:text-teal-400", activeBg: "bg-teal-500/15", iconBg: "bg-teal-500/10", labelKey: "actionSavings" },
  { type: "debt_payment", icon: CreditCard, color: "text-orange-600 dark:text-orange-400", activeBg: "bg-orange-500/15", iconBg: "bg-orange-500/10", labelKey: "actionDebtPayment" },
];

function AddCategoryDialog({ categoryType, onClose }: { categoryType: string; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: (data: { name: string; type: string }) =>
      apiRequest("POST", "/api/custom-categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] });
      toast({ title: t.transactions.addCategory });
      setName("");
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">{t.transactions.categoryName}</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.transactions.categoryNamePlaceholder}
          data-testid="input-new-category"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} data-testid="button-cancel-category">{t.accounts.cancel}</Button>
        <Button
          onClick={() => mutation.mutate({ name, type: categoryType })}
          disabled={mutation.isPending || !name.trim()}
          data-testid="button-save-category"
        >
          {mutation.isPending ? "..." : t.transactions.categorySave}
        </Button>
      </div>
    </div>
  );
}

function TransactionForm({ accounts, onClose, initialTab }: { accounts: Account[]; onClose: () => void; initialTab?: TxTabType }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [tabType, setTabType] = useState<TxTabType>(initialTab || "expense");

  const [savGoalId, setSavGoalId] = useState("");
  const [savAmount, setSavAmount] = useState("");
  const [savFromAcc, setSavFromAcc] = useState("");
  const [debtLiabId, setDebtLiabId] = useState("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtFromAcc, setDebtFromAcc] = useState("");

  const { data: customCategories } = useQuery<CustomCategory[]>({ queryKey: ["/api/custom-categories"] });
  const { data: goals } = useQuery<Goal[]>({ queryKey: ["/api/goals"] });
  const { data: liabilities } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });

  const activeGoals = goals?.filter(g => Number(g.currentAmount) < Number(g.targetAmount)) ?? [];
  const activeDebts = liabilities?.filter(d => Number(d.amount) > 0 || (d.monthlyPayment && d.remainingMonths && d.remainingMonths > 0)) ?? [];

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-categories/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/custom-categories"] }); },
  });

  const form = useForm({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      type: "expense" as "income" | "expense" | "transfer",
      amount: "",
      date: format(new Date(), "yyyy-MM-dd"),
      fromAccountId: "",
      toAccountId: "",
      category: "",
      note: "",
    },
  });

  const watchType = form.watch("type");
  const userCategories = customCategories?.filter(c =>
    c.type === watchType ||
    (watchType === "expense" && (c.type === "needs" || c.type === "wants"))
  ) || [];

  const txMutation = useMutation({
    mutationFn: (data: z.infer<typeof transactionFormSchema>) => {
      const payload: Record<string, unknown> = {
        type: data.type, amount: data.amount, date: data.date,
        category: data.category || null, note: data.note || null,
      };
      if (data.type === "expense" || data.type === "transfer") payload.fromAccountId = data.fromAccountId ? parseInt(data.fromAccountId) : null;
      if (data.type === "income" || data.type === "transfer") payload.toAccountId = data.toAccountId ? parseInt(data.toAccountId) : null;
      return apiRequest("POST", "/api/transactions", payload);
    },
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: "Transaction recorded! +5 XP" });
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) { toast({ title: "Unauthorized", variant: "destructive" }); return; }
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const savingsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/goals/${savGoalId}/deposit`, {
      amount: savAmount, fromAccountId: savFromAcc ? parseInt(savFromAcc) : null,
    }),
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: "Savings deposited! +8 XP" });
      setSavGoalId(""); setSavAmount(""); setSavFromAcc("");
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const debtMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/liabilities/${debtLiabId}/pay`, {
      amount: debtAmount, fromAccountId: debtFromAcc ? parseInt(debtFromAcc) : null,
    }),
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      toast({ title: "Debt payment recorded! +8 XP" });
      setDebtLiabId(""); setDebtAmount(""); setDebtFromAcc("");
      onClose();
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const watchFromId = form.watch("fromAccountId");
  const watchAmt = form.watch("amount");
  const selectedFromAcc = accounts.find(a => String(a.id) === watchFromId);
  const hasTxInsufficientBalance = selectedFromAcc && watchAmt &&
    (watchType === "expense" || watchType === "transfer") &&
    Number(watchAmt) > Number(selectedFromAcc.balance);

  const savFromAccObj = accounts.find(a => String(a.id) === savFromAcc);
  const hasSavBadBalance = savFromAccObj && savAmount && Number(savAmount) > Number(savFromAccObj.balance);
  const debtFromAccObj = accounts.find(a => String(a.id) === debtFromAcc);
  const hasDebtBadBalance = debtFromAccObj && debtAmount && Number(debtAmount) > Number(debtFromAccObj.balance);

  const selectedGoal = activeGoals.find(g => String(g.id) === savGoalId);
  const selectedDebt = activeDebts.find(d => String(d.id) === debtLiabId);

  const handleTabChange = (tab: TxTabType) => {
    setTabType(tab);
    if (tab === "income" || tab === "expense" || tab === "transfer") {
      form.setValue("type", tab);
    }
  };

  const isTxTab = tabType === "income" || tabType === "expense" || tabType === "transfer";

  const renderTypeTabs = () => {
    const row1 = TX_TAB_CONFIG.slice(0, 3);
    const row2 = TX_TAB_CONFIG.slice(3);
    const renderBtn = (cfg: typeof TX_TAB_CONFIG[0]) => {
      const Icon = cfg.icon;
      const active = tabType === cfg.type;
      return (
        <button
          key={cfg.type}
          type="button"
          onClick={() => handleTabChange(cfg.type)}
          className={cn(
            "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 select-none",
            active ? cfg.activeBg : "hover:bg-muted/50"
          )}
          data-testid={`button-type-${cfg.type}`}
        >
          <div className={cn("rounded-lg p-1.5 transition-colors", active ? cfg.iconBg : "bg-muted/30")}>
            <Icon className={cn("w-4 h-4 transition-colors", active ? cfg.color : "text-muted-foreground")} />
          </div>
          <span className={cn("text-[10px] font-medium leading-none transition-colors", active ? cfg.color : "text-muted-foreground")}>
            {(t.dashboard as any)[cfg.labelKey]}
          </span>
        </button>
      );
    };
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1.5">{row1.map(renderBtn)}</div>
        <div className="flex gap-1.5 justify-center">
          {row2.map(cfg => {
            const Icon = cfg.icon;
            const active = tabType === cfg.type;
            return (
              <button
                key={cfg.type}
                type="button"
                onClick={() => handleTabChange(cfg.type)}
                style={{ width: "calc((100% - 8px) / 3)" }}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 rounded-xl transition-all duration-150 select-none",
                  active ? cfg.activeBg : "hover:bg-muted/50"
                )}
                data-testid={`button-type-${cfg.type}`}
              >
                <div className={cn("rounded-lg p-1.5 transition-colors", active ? cfg.iconBg : "bg-muted/30")}>
                  <Icon className={cn("w-4 h-4 transition-colors", active ? cfg.color : "text-muted-foreground")} />
                </div>
                <span className={cn("text-[10px] font-medium leading-none transition-colors", active ? cfg.color : "text-muted-foreground")}>
                  {(t.dashboard as any)[cfg.labelKey]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if (accounts.length === 0) {
    return (
      <div className="px-6 max-md:px-6 md:px-0 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t.transactions.noAccWarning}</p>
        <Button variant="ghost" onClick={onClose} className="mt-4">{t.accounts.cancel}</Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => {
        if (!isTxTab) return;
        if (hasTxInsufficientBalance) {
          toast({ title: t.common.error, description: t.transactions.insufficientBalanceTx, variant: "destructive" });
          return;
        }
        txMutation.mutate(data);
      })} className="flex flex-col max-md:flex-1 max-md:min-h-0">
        <div className="space-y-5 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto max-md:pb-4">

          {renderTypeTabs()}

          {isTxTab && (<>
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <FormControl>
                  <CurrencyInput
                    placeholder="0"
                    className="min-h-[48px] text-lg"
                    value={field.value}
                    onChange={field.onChange}
                    data-testid="input-tx-amount"
                  />
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
                  <Input type="date" className="min-h-[48px]" {...field} data-testid="input-tx-date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {(watchType === "expense" || watchType === "transfer") && (
            <FormField
              control={form.control}
              name="fromAccountId"
              render={({ field }) => {
                const selected = accounts.find(a => String(a.id) === field.value);
                return (
                  <FormItem>
                    <FormLabel>{t.transactions.fromAccount}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[48px]" data-testid="select-from-account">
                          <SelectValue placeholder={t.transactions.selectAccount}>
                            {selected ? (
                              <span className="flex items-center gap-1">
                                <span>{selected.name}</span>
                                <span className="text-muted-foreground/70">({formatCurrency(Number(selected.balance))})</span>
                              </span>
                            ) : undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name} ({formatCurrency(Number(a.balance))})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {hasTxInsufficientBalance && (
                      <p className="text-xs text-destructive mt-1" data-testid="text-tx-insufficient">Saldo tidak mencukupi</p>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          {(watchType === "income" || watchType === "transfer") && (
            <FormField
              control={form.control}
              name="toAccountId"
              render={({ field }) => {
                const selected = accounts.find(a => String(a.id) === field.value);
                return (
                  <FormItem>
                    <FormLabel>{t.transactions.toAccount}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="min-h-[48px]" data-testid="select-to-account">
                          <SelectValue placeholder={t.transactions.selectAccount}>
                            {selected ? (
                              <span className="flex items-center gap-1">
                                <span>{selected.name}</span>
                                <span className="text-muted-foreground/70">({formatCurrency(Number(selected.balance))})</span>
                              </span>
                            ) : undefined}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name} ({formatCurrency(Number(a.balance))})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          {watchType !== "transfer" && (
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <FormLabel>{t.transactions.category}</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAddCategoryOpen(true)}
                      data-testid="button-add-category"
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      {t.transactions.addCategory}
                    </Button>
                  </div>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="min-h-[48px]" data-testid="select-category">
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
                            {userCategories.filter(c =>
                              c.type === group.groupKey ||
                              (group.groupKey === "wants" && c.type === "expense")
                            ).map((c) => (
                              <SelectItem key={`custom-${c.id}`} value={c.name}>
                                <span className="mr-2">{c.emoji ?? "📌"}</span>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
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
                  <Textarea placeholder={t.transactions.notePlaceholder} className="resize-none min-h-[48px]" {...field} data-testid="input-tx-note" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          </>)}

          {tabType === "savings" && (<>
            {activeGoals.length === 0 ? (
              <div className="py-6 text-center">
                <PiggyBank className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t.dashboard.noGoals}</p>
              </div>
            ) : (<>
              <FormItem>
                <FormLabel>{t.dashboard.selectGoal}</FormLabel>
                <Select onValueChange={setSavGoalId} value={savGoalId}>
                  <SelectTrigger className="min-h-[48px]" data-testid="select-sav-goal">
                    <SelectValue placeholder={t.dashboard.selectGoal} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeGoals.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name} ({formatCurrency(Number(g.currentAmount))} / {formatCurrency(Number(g.targetAmount))})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
              {selectedGoal && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1.5">
                    <span>{selectedGoal.name}</span>
                    <span className="font-mono">{Math.round(Number(selectedGoal.currentAmount) / Number(selectedGoal.targetAmount) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(Number(selectedGoal.currentAmount) / Number(selectedGoal.targetAmount) * 100, 100)}%` }} />
                  </div>
                </div>
              )}
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <CurrencyInput placeholder="0" className="min-h-[48px] text-lg" value={savAmount} onChange={setSavAmount} data-testid="input-sav-amount" />
              </FormItem>
              <FormItem>
                <FormLabel>{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={setSavFromAcc} value={savFromAcc}>
                  <SelectTrigger className="min-h-[48px]" data-testid="select-sav-from">
                    <SelectValue placeholder={t.transactions.selectAccount}>
                      {savFromAcc && (() => { const a = accounts.find(ac => String(ac.id) === savFromAcc); return a ? <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span> : null; })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({formatCurrency(Number(a.balance))})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasSavBadBalance && <p className="text-xs text-destructive mt-1">Saldo tidak mencukupi</p>}
              </FormItem>
            </>)}
          </>)}

          {tabType === "debt_payment" && (<>
            {activeDebts.length === 0 ? (
              <div className="py-6 text-center">
                <CreditCard className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t.dashboard.noDebts}</p>
              </div>
            ) : (<>
              <FormItem>
                <FormLabel>{t.dashboard.selectDebt}</FormLabel>
                <Select onValueChange={setDebtLiabId} value={debtLiabId}>
                  <SelectTrigger className="min-h-[48px]" data-testid="select-debt-liab">
                    <SelectValue placeholder={t.dashboard.selectDebt} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDebts.map((d) => {
                      const displayAmt = Number(d.amount) > 0 ? Number(d.amount) : (d.monthlyPayment && d.remainingMonths ? Number(d.monthlyPayment) * d.remainingMonths : 0);
                      return (
                        <SelectItem key={d.id} value={String(d.id)}>
                          {d.name} ({t.dashboard.remainingDebt}: {formatCurrency(displayAmt)})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </FormItem>
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
              <FormItem>
                <FormLabel>{t.transactions.amount}</FormLabel>
                <CurrencyInput placeholder="0" className="min-h-[48px] text-lg" value={debtAmount} onChange={setDebtAmount} data-testid="input-debt-amount" />
              </FormItem>
              <FormItem>
                <FormLabel>{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={setDebtFromAcc} value={debtFromAcc}>
                  <SelectTrigger className="min-h-[48px]" data-testid="select-debt-from">
                    <SelectValue placeholder={t.transactions.selectAccount}>
                      {debtFromAcc && (() => { const a = accounts.find(ac => String(ac.id) === debtFromAcc); return a ? <span>{a.name} <span className="text-muted-foreground/70">({formatCurrency(Number(a.balance))})</span></span> : null; })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name} ({formatCurrency(Number(a.balance))})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasDebtBadBalance && <p className="text-xs text-destructive mt-1">Saldo tidak mencukupi</p>}
              </FormItem>
            </>)}
          </>)}

        </div>

        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-4 pb-6 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-2 md:flex-row md:justify-end">
          {isTxTab && (
            <Button
              type="submit"
              disabled={txMutation.isPending || !!hasTxInsufficientBalance}
              className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2"
              data-testid="button-save-tx"
            >
              {txMutation.isPending ? "..." : t.transactions.submit}
            </Button>
          )}
          {tabType === "savings" && (
            <Button
              type="button"
              disabled={savingsMutation.isPending || !savGoalId || !savAmount || !savFromAcc || !!hasSavBadBalance}
              onClick={() => savingsMutation.mutate()}
              className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2"
              data-testid="button-save-savings"
            >
              {savingsMutation.isPending ? "..." : t.dashboard.depositToGoal}
            </Button>
          )}
          {tabType === "debt_payment" && (
            <Button
              type="button"
              disabled={debtMutation.isPending || !debtLiabId || !debtAmount || !debtFromAcc || !!hasDebtBadBalance}
              onClick={() => debtMutation.mutate()}
              className="w-full md:w-auto min-h-[52px] max-md:min-h-[52px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2"
              data-testid="button-save-debt"
            >
              {debtMutation.isPending ? "..." : t.dashboard.payDebt}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="w-full md:w-auto min-h-[40px] max-md:min-h-[40px] md:min-h-[36px] text-sm text-muted-foreground md:order-1"
          >
            {t.accounts.cancel}
          </Button>
        </div>
      </form>

      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.transactions.addCategoryTitle}</DialogTitle>
            <DialogDescription>{t.transactions.addCategoryDesc}</DialogDescription>
          </DialogHeader>
          <AddCategoryDialog categoryType={watchType} onClose={() => setAddCategoryOpen(false)} />
        </DialogContent>
      </Dialog>
    </Form>
  );
}

type DateFilter = "last7" | "thisMonth" | "custom";

const CHART_COLORS = {
  expense: "hsl(145 48% 32%)",
  income: "hsl(160 70% 38%)",
  transfer: "hsl(213 80% 52%)",
};

function SpendingChart({
  transactions, t, language, chartType,
}: {
  transactions: { date: string; label: string; amount: number }[];
  t: ReturnType<typeof useLanguage>["t"];
  language: string;
  chartType: "expense" | "income" | "transfer";
}) {
  const hasAnyData = transactions.some((d) => d.amount > 0);
  if (!transactions || transactions.length === 0 || !hasAnyData) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
        {t.transactions.noSpendingPeriod}
      </div>
    );
  }

  const color = CHART_COLORS[chartType];
  const gradientId = `colorChart_${chartType}`;
  const tickFmt = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}${language === "en" ? "M" : "JT"}`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}${language === "en" ? "K" : "RB"}`;
    return String(v);
  };

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={transactions}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickFormatter={tickFmt}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
            fontSize: "12px",
          }}
          formatter={(value: number) => [formatCurrency(value), t.transactions.dailySpending]}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke={color}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

type TypeFilter = "all" | "income" | "expense" | "transfer";

export default function Transactions() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<TxTabType | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>("thisMonth");
  const [pendingFilter, setPendingFilter] = useState<DateFilter>("thisMonth");
  const [customStart, setCustomStart] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [pendingStart, setPendingStart] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [pendingEnd, setPendingEnd] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [pendingAccountFilter, setPendingAccountFilter] = useState<number | null>(null);
  const [accountSheetOpen, setAccountSheetOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [pendingTypeFilter, setPendingTypeFilter] = useState<TypeFilter>("all");
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();

  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(() => setChartReady(true));
      return () => cancelIdleCallback(id);
    }
    const t2 = setTimeout(() => setChartReady(true), 80);
    return () => clearTimeout(t2);
  }, []);

  const { data: transactions, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const deleteTxMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/spending-insight") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: t.transactions.deleted });
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const getAccountName = (id: number | null | undefined) => {
    if (!id || !accounts) return "—";
    return accounts.find((a) => a.id === id)?.name ?? "Unknown";
  };

  const dateRange = useMemo(() => {
    const now = new Date();
    const todayStr = format(now, "yyyy-MM-dd");
    if (dateFilter === "last7") {
      return { start: format(subDays(now, 6), "yyyy-MM-dd"), end: todayStr };
    } else if (dateFilter === "thisMonth") {
      return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: todayStr };
    }
    const safeStart = customStart || todayStr;
    const safeEnd = customEnd || todayStr;
    return safeStart <= safeEnd ? { start: safeStart, end: safeEnd } : { start: safeEnd, end: safeStart };
  }, [dateFilter, customStart, customEnd]);

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions
      .filter((tx) => tx.date >= dateRange.start && tx.date <= dateRange.end)
      .filter((tx) => {
        if (accountFilter === null) return true;
        return tx.fromAccountId === accountFilter || tx.toAccountId === accountFilter;
      })
      .filter((tx) => typeFilter === "all" || tx.type === typeFilter)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, dateRange, accountFilter, typeFilter]);

  const groupedTransactions = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const groups: { dateKey: string; label: string; totalExpense: number; transactions: Transaction[] }[] = [];
    const seen: Record<string, number> = {};
    for (const tx of filteredTransactions) {
      if (seen[tx.date] === undefined) {
        seen[tx.date] = groups.length;
        let label = tx.date;
        if (tx.date === todayStr) label = t.transactions.today.toUpperCase();
        else if (tx.date === yesterdayStr) label = t.transactions.yesterday.toUpperCase();
        else {
          try { label = format(parseISO(tx.date), "d MMM yyyy"); } catch { label = tx.date; }
        }
        groups.push({ dateKey: tx.date, label, totalExpense: 0, transactions: [] });
      }
      const g = groups[seen[tx.date]];
      if (tx.type === "expense") g.totalExpense += parseFloat(String(tx.amount));
      g.transactions.push(tx);
    }
    return groups;
  }, [filteredTransactions, t.transactions.today, t.transactions.yesterday]);

  const INITIAL_VISIBLE = 30;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [dateFilter, accountFilter, typeFilter, customStart, customEnd]);

  const visibleTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  const visibleGrouped = useMemo(() => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const groups: { dateKey: string; label: string; totalExpense: number; transactions: Transaction[] }[] = [];
    const seen: Record<string, number> = {};
    for (const tx of visibleTransactions) {
      if (seen[tx.date] === undefined) {
        seen[tx.date] = groups.length;
        let label = tx.date;
        if (tx.date === todayStr) label = t.transactions.today.toUpperCase();
        else if (tx.date === yesterdayStr) label = t.transactions.yesterday.toUpperCase();
        else {
          try { label = format(parseISO(tx.date), "d MMM yyyy"); } catch { label = tx.date; }
        }
        groups.push({ dateKey: tx.date, label, totalExpense: 0, transactions: [] });
      }
      const g = groups[seen[tx.date]];
      if (tx.type === "expense") g.totalExpense += parseFloat(String(tx.amount));
      g.transactions.push(tx);
    }
    return groups;
  }, [visibleTransactions, t.transactions.today, t.transactions.yesterday]);

  const hasMore = filteredTransactions.length > visibleCount;
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + INITIAL_VISIBLE);
  }, []);

  const activeChartType: "expense" | "income" | "transfer" = typeFilter === "income" ? "income" : typeFilter === "transfer" ? "transfer" : "expense";

  const chartData = useMemo(() => {
    const days = eachDayOfInterval({
      start: parseISO(dateRange.start),
      end: parseISO(dateRange.end),
    });
    const amountMap: Record<string, number> = {};
    filteredTransactions
      .filter((tx) => tx.type === activeChartType)
      .forEach((tx) => {
        amountMap[tx.date] = (amountMap[tx.date] || 0) + parseFloat(String(tx.amount));
      });
    return days.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      return {
        date: dateStr,
        label: format(day, "dd MMM"),
        amount: amountMap[dateStr] || 0,
      };
    });
  }, [filteredTransactions, dateRange, activeChartType]);

  const filterLabel = useMemo(() => {
    if (dateFilter === "last7") return t.transactions.last7Days;
    if (dateFilter === "thisMonth") return t.transactions.thisMonth;
    return `${customStart} — ${customEnd}`;
  }, [dateFilter, customStart, customEnd, t]);

  const accountFilterLabel = useMemo(() => {
    if (accountFilter === null) return t.transactions.allAccounts;
    return accounts?.find((a) => a.id === accountFilter)?.name ?? t.transactions.allAccounts;
  }, [accountFilter, accounts, t]);

  const typeFilterLabel = useMemo(() => {
    if (typeFilter === "all") return t.transactions.allTypes;
    if (typeFilter === "income") return t.transactions.income;
    if (typeFilter === "expense") return t.transactions.expense;
    return t.transactions.transfer;
  }, [typeFilter, t]);

  const openFilterSheet = () => {
    setPendingFilter(dateFilter);
    setPendingStart(customStart);
    setPendingEnd(customEnd);
    setFilterSheetOpen(true);
  };

  const applyFilter = () => {
    setDateFilter(pendingFilter);
    if (pendingFilter === "custom") {
      setCustomStart(pendingStart);
      setCustomEnd(pendingEnd);
    }
    setFilterSheetOpen(false);
  };

  const applyAccountFilter = () => {
    setAccountFilter(pendingAccountFilter);
    setAccountSheetOpen(false);
  };

  const applyTypeFilter = () => {
    setTypeFilter(pendingTypeFilter);
    setTypeSheetOpen(false);
  };

  useEffect(() => {
    const handler = () => {
      if (!accounts || accounts.length === 0) {
        setSetupOpen(true);
      } else {
        setDialogOpen(true);
      }
    };
    window.addEventListener("fr-open-add-tx", handler);
    return () => window.removeEventListener("fr-open-add-tx", handler);
  }, [accounts]);

  const chartTitle = activeChartType === "income"
    ? t.transactions.incomeOverview
    : activeChartType === "transfer"
      ? t.transactions.transferOverview
      : t.transactions.spendingOverview;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[240px]" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  const typeLabels: Record<string, string> = {
    income: t.transactions.income,
    expense: t.transactions.expense,
    transfer: t.transactions.transfer,
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold" data-testid="text-transactions-title">{t.transactions.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.transactions.subtitle}</p>
        </div>
        <SetupFirstAccountModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          onSuccess={() => { setSetupOpen(false); setDialogOpen(true); }}
        />

        <Button
          data-testid="button-add-tx"
          onClick={() => {
            if (!accounts || accounts.length === 0) {
              setSetupOpen(true);
            } else {
              setActionPickerOpen(true);
            }
          }}
        >
          <Plus className="w-4 h-4 mr-2" /> {t.transactions.addTx}
        </Button>

        <Dialog open={actionPickerOpen} onOpenChange={(open) => { if (!open) { setActionPickerOpen(false); setSelectedAction(null); } }}>
          <DialogContentBottomSheet>
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mt-3" />
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-base font-serif font-bold">{(t.dashboard as any).addActionTitle}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{(t.dashboard as any).addActionDesc}</p>
            </div>
            <div className="px-5 pb-6 space-y-1">
              {TX_TAB_CONFIG.slice(0, 5).map((cfg) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={cfg.type}
                    type="button"
                    onClick={() => {
                      setSelectedAction(cfg.type as TxTabType);
                      setActionPickerOpen(false);
                      setDialogOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                    data-testid={`tx-action-${cfg.type}`}
                  >
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", cfg.color)}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{(t.dashboard as any)[cfg.labelKey]}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </DialogContentBottomSheet>
        </Dialog>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContentBottomSheet>
            <DialogHeader className="px-6 max-md:px-6 md:px-0 pt-1 md:pt-0">
              <DialogTitle className="text-lg">{t.transactions.dialogTitle}</DialogTitle>
              <DialogDescription>{t.transactions.dialogDesc}</DialogDescription>
            </DialogHeader>
            <TransactionForm accounts={accounts ?? []} onClose={() => { setDialogOpen(false); setSelectedAction(null); }} initialTab={selectedAction || undefined} />
          </DialogContentBottomSheet>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-2" data-testid="filter-date-range">
        <button
          type="button"
          onClick={openFilterSheet}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full border border-border bg-muted/40 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors overflow-hidden"
          data-testid="button-open-filter"
        >
          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs truncate">{filterLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => { setPendingAccountFilter(accountFilter); setAccountSheetOpen(true); }}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full border border-border bg-muted/40 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors overflow-hidden"
          data-testid="button-open-account-filter"
        >
          <Wallet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs truncate">{accountFilterLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => { setPendingTypeFilter(typeFilter); setTypeSheetOpen(true); }}
          className="flex items-center justify-center gap-1 px-2 py-2 rounded-full border border-border bg-muted/40 text-sm font-medium text-foreground hover:bg-muted/70 transition-colors overflow-hidden"
          data-testid="button-open-type-filter"
        >
          <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs truncate">{typeFilterLabel}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
      </div>

      <Dialog open={filterSheetOpen} onOpenChange={(v) => { if (!v) setFilterSheetOpen(false); }}>
        <DialogContentBottomSheet>
          <div className="px-6 pt-2 pb-6 flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.transactions.filterByDate}</p>
            <div className="flex rounded-lg border border-border p-1 gap-1 bg-muted/40">
              {(["last7", "thisMonth", "custom"] as const).map((f) => {
                const label = f === "last7" ? t.transactions.last7Days
                  : f === "thisMonth" ? t.transactions.thisMonth
                  : t.transactions.customRange;
                return (
                  <button
                    key={f}
                    type="button"
                    className={cn(
                      "flex-1 py-2 rounded-md text-sm font-medium transition-all duration-150",
                      pendingFilter === f
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setPendingFilter(f)}
                    data-testid={`button-filter-${f}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {pendingFilter === "custom" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.transactions.startDate}</label>
                  <Input
                    type="date"
                    value={pendingStart}
                    onChange={(e) => setPendingStart(e.target.value)}
                    className="min-h-[48px]"
                    data-testid="input-custom-start"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.transactions.endDate}</label>
                  <Input
                    type="date"
                    value={pendingEnd}
                    onChange={(e) => setPendingEnd(e.target.value)}
                    className="min-h-[48px]"
                    data-testid="input-custom-end"
                  />
                </div>
              </div>
            )}

            <Button onClick={applyFilter} className="w-full min-h-[48px]">
              {t.transactions.applyFilter}
            </Button>
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      <Dialog open={accountSheetOpen} onOpenChange={(v) => { if (!v) setAccountSheetOpen(false); }}>
        <DialogContentBottomSheet>
          <div className="px-6 pt-2 pb-6 flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.transactions.filterByAccount}</p>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setPendingAccountFilter(null)}
                className={cn(
                  "flex items-center justify-between w-full px-4 py-3 rounded-lg border text-sm font-medium transition-colors",
                  pendingAccountFilter === null
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                )}
              >
                <span>{t.transactions.allAccounts}</span>
                {pendingAccountFilter === null && <Check className="w-4 h-4 text-primary" />}
              </button>
              {(accounts ?? []).map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setPendingAccountFilter(acc.id)}
                  className={cn(
                    "flex items-center justify-between w-full px-4 py-3 rounded-lg border text-sm font-medium transition-colors",
                    pendingAccountFilter === acc.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {acc.color && (
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                    )}
                    <span>{acc.name}</span>
                  </div>
                  {pendingAccountFilter === acc.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>
            <Button onClick={applyAccountFilter} className="w-full min-h-[48px]">
              {t.transactions.applyFilter}
            </Button>
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      <Dialog open={typeSheetOpen} onOpenChange={(v) => { if (!v) setTypeSheetOpen(false); }}>
        <DialogContentBottomSheet>
          <div className="px-6 pt-2 pb-6 flex flex-col gap-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.transactions.filterByType}</p>
            <div className="flex rounded-lg border border-border p-1 gap-1 bg-muted/40">
              {(["all", "income", "expense", "transfer"] as const).map((f) => {
                const label = f === "all" ? t.transactions.typeAll
                  : f === "income" ? t.transactions.income
                  : f === "expense" ? t.transactions.expense
                  : t.transactions.transfer;
                return (
                  <button
                    key={f}
                    type="button"
                    className={cn(
                      "flex-1 py-2 rounded-md text-xs font-medium transition-all duration-150",
                      pendingTypeFilter === f
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground"
                    )}
                    onClick={() => setPendingTypeFilter(f)}
                    data-testid={`button-type-filter-${f}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Button onClick={applyTypeFilter} className="w-full min-h-[48px]">
              {t.transactions.applyFilter}
            </Button>
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      <Card data-testid="card-spending-chart">
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">{chartTitle}</h3>
          {chartReady ? (
            <SpendingChart transactions={chartData} t={t} language={language} chartType={activeChartType} />
          ) : (
            <Skeleton className="h-[200px]" />
          )}
        </CardContent>
      </Card>

      {filteredTransactions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <ArrowLeftRight className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">{t.transactions.noTx}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t.transactions.noTxDesc}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleGrouped.map((group) => (
            <div key={group.dateKey}>
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{group.label}</span>
                {group.totalExpense > 0 && (
                  <span className="text-[11px] text-muted-foreground font-mono">- {formatCurrency(group.totalExpense)}</span>
                )}
              </div>
              <div className="space-y-2">
                {group.transactions.map((tx) => {
                  const isSavingsDeposit = tx.category === "Savings" && tx.note?.startsWith("Deposit to");
                  const cfg = typeConfig[tx.type as keyof typeof typeConfig];
                  const Icon = isSavingsDeposit ? PiggyBank : cfg.icon;
                  const iconColor = isSavingsDeposit ? "text-teal-600 dark:text-teal-400" : cfg.color;
                  const iconBg = isSavingsDeposit ? "bg-teal-500/10" : cfg.bg;
                  const goalName = isSavingsDeposit ? tx.note?.replace("Deposit to ", "") : null;
                  const txTime = tx.createdAt ? format(new Date(tx.createdAt), "HH:mm") : "";
                  return (
                    <Card key={tx.id} className="hover-elevate transition-all duration-200" data-testid={`card-tx-${tx.id}`}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${iconBg}`}>
                          <Icon className={`w-4 h-4 ${iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">
                              {isSavingsDeposit
                                ? goalName
                                : tx.type === "transfer"
                                  ? `${getAccountName(tx.fromAccountId)} → ${getAccountName(tx.toAccountId)}`
                                  : (tx.category ? ((t.categories as Record<string, string>)[tx.category] || tx.category) : typeLabels[tx.type] || cfg.label)}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {isSavingsDeposit ? (language === "en" ? "Goal" : "Nabung") : typeLabels[tx.type] || cfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground">{txTime}</span>
                            {!isSavingsDeposit && tx.note && <span className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.note}</span>}
                            {isSavingsDeposit && <span className="text-xs text-muted-foreground">{getAccountName(tx.fromAccountId)}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`font-mono font-semibold text-sm ${
                            tx.type === "income" ? "text-green-600 dark:text-green-400" :
                            tx.type === "expense" ? "text-red-500 dark:text-red-400" :
                            isSavingsDeposit ? "text-emerald-600 dark:text-emerald-400" :
                            "text-foreground"
                          }`}>
                            {tx.type === "income" ? "+" : tx.type === "expense" ? "-" : ""}
                            {isSavingsDeposit ? formatCurrency(String(Math.abs(Number(tx.amount)))) : formatCurrency(tx.amount)}
                          </span>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {tx.type === "income" ? getAccountName(tx.toAccountId) :
                             tx.type === "expense" ? getAccountName(tx.fromAccountId) : ""}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteTxMutation.mutate(tx.id)}
                          disabled={deleteTxMutation.isPending}
                          data-testid={`button-delete-tx-${tx.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={loadMore}
            >
              {language === "en" ? `Show more (${filteredTransactions.length - visibleCount} remaining)` : `Tampilkan lagi (${filteredTransactions.length - visibleCount} sisa)`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
