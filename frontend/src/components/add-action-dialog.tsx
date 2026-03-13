import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { playSound } from "@/hooks/use-sound";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContentBottomSheet, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  PiggyBank, CreditCard, Wallet, Camera,
} from "lucide-react";
import { Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, EXPENSE_CATEGORY_GROUPS, INCOME_CATEGORIES } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { saveLocalTransaction } from "@/lib/offline-transactions";
import { useLanguage } from "@/lib/i18n";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import type { Account, CustomCategory, Goal, Liability } from "@shared/schema";
import { ScanPanel } from "@/components/scan-panel";
import { CalculatorSheet } from "@/components/calculator-sheet";

export type TxTabType = "expense" | "income" | "transfer" | "savings" | "debt_payment";
export type ActionType = "income" | "expense" | "transfer" | "savings" | "debt_payment" | "no_spend";

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
          className="flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-150 select-none border-2 border-dashed border-gray-300 dark:border-gray-600 bg-transparent hover:border-solid hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 group"
          data-testid="button-tab-scan"
        >
          <div className="rounded-lg p-1.5 bg-muted/30 group-hover:bg-green-500/10 transition-colors">
            <Camera className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors" />
          </div>
          <span className="text-[10px] font-medium leading-none text-gray-500 dark:text-gray-400 group-hover:text-green-800 dark:group-hover:text-green-400 transition-colors">
            Scan
          </span>
        </button>
        {row2Right.map(renderTab)}
      </div>
    </div>
  );
}

function TransactionForm({ txType, onClose, t }: { txType: "income" | "expense" | "transfer"; onClose: () => void; t: any }) {
  const { toast } = useToast();
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: customCategories } = useQuery<CustomCategory[]>({ queryKey: ["/api/custom-categories"] });
  const [calcOpen, setCalcOpen] = useState(false);

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
  const userCategories = customCategories?.filter(c =>
    c.type === watchType ||
    (watchType === "expense" && (c.type === "needs" || c.type === "wants"))
  ) || [];

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
    onSuccess: (_res, variables) => {
      playSound("transaction");
      if (!navigator.onLine) {
        saveLocalTransaction(
          {
            type: variables.type,
            amount: variables.amount,
            date: variables.date,
            category: variables.category || null,
            note: variables.note || null,
            fromAccountId: (variables.type === "expense" || variables.type === "transfer") && variables.fromAccountId
              ? parseInt(variables.fromAccountId) : null,
            toAccountId: (variables.type === "income" || variables.type === "transfer") && variables.toAccountId
              ? parseInt(variables.toAccountId) : null,
          },
          queryClient,
        ).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/spending-insight") });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-focus"] });
      toast({ title: t.transactions.submit, description: !navigator.onLine ? "⏳ Tersimpan, akan disinkronkan" : "+5 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = `${API_URL}/api/login`; }, 500);
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
        <div className="space-y-3 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.date}</FormLabel>
                <FormControl>
                  <Input type="date" className="max-md:min-h-[40px] max-md:h-10 min-h-[48px] appearance-none [&::-webkit-date-and-time-value]:text-left" {...field} data-testid="input-quick-date" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.amount}</FormLabel>
                <div className="flex gap-2 items-center">
                  <FormControl>
                    <CurrencyInput placeholder="0" className="max-md:min-h-[40px] max-md:h-10 min-h-[48px] text-lg flex-1" value={field.value} onChange={field.onChange} data-testid="input-quick-amount" />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="shrink-0 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-md border border-input bg-background hover:bg-muted transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} onConfirm={(val) => form.setValue("amount", val)} />

          {(watchType === "expense" || watchType === "transfer") && (
            <FormField
              control={form.control}
              name="fromAccountId"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">{t.transactions.fromAccount}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-quick-from">
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
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">{t.transactions.toAccount}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-quick-to">
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
                <FormItem className="space-y-1">
                  <FormLabel className="text-xs">{t.transactions.category}</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-quick-category">
                        <SelectValue placeholder={t.transactions.selectCategory} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[200px]">
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
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.note}</FormLabel>
                <FormControl>
                  <Textarea placeholder={t.transactions.notePlaceholder} className="resize-none max-md:min-h-[40px] max-md:h-10 min-h-[48px]" {...field} data-testid="input-quick-note" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-2 pb-4 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-1.5 md:flex-row md:justify-end">
          <Button
            type="submit"
            disabled={mutation.isPending || !!hasInsufficientBalance}
            className="w-full md:w-auto min-h-[44px] max-md:min-h-[44px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2"
            data-testid="button-quick-save"
          >
            {mutation.isPending ? "..." : t.transactions.submit}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[36px] max-md:min-h-[36px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
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
  const [calcOpen, setCalcOpen] = useState(false);

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
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: t.dashboard.savingsRecorded, description: "+8 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = `${API_URL}/api/login`; }, 500);
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
        <div className="space-y-3 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-2">
          <FormField
            control={form.control}
            name="goalId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.dashboard.selectGoal}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-savings-goal">
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
            <div className="rounded-md bg-muted/50 p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-1">
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
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.amount}</FormLabel>
                <div className="flex gap-2 items-center">
                  <FormControl>
                    <CurrencyInput placeholder="0" className="max-md:min-h-[40px] max-md:h-10 min-h-[48px] text-lg flex-1" value={field.value} onChange={field.onChange} data-testid="input-savings-amount" />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="shrink-0 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-md border border-input bg-background hover:bg-muted transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} onConfirm={(val) => form.setValue("amount", val)} />
          <FormField
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-savings-from">
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
        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-2 pb-4 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-1.5 md:flex-row md:justify-end">
          <Button type="submit" disabled={mutation.isPending || !!hasBadBalance || !watchFromId} className="w-full md:w-auto min-h-[44px] max-md:min-h-[44px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2" data-testid="button-savings-save">
            {mutation.isPending ? "..." : t.dashboard.depositToGoal}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[36px] max-md:min-h-[36px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
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
  const [calcOpen, setCalcOpen] = useState(false);

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
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: t.dashboard.debtPaymentRecorded, description: "+8 XP" });
      form.reset();
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = `${API_URL}/api/login`; }, 500);
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
        <div className="space-y-3 px-6 max-md:px-6 md:px-0 max-md:flex-1 max-md:overflow-y-auto scrollbar-hide max-md:pb-2">
          <FormField
            control={form.control}
            name="liabilityId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.dashboard.selectDebt}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-debt-liability">
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
            <div className="rounded-md bg-muted/50 p-2.5">
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
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.amount}</FormLabel>
                <div className="flex gap-2 items-center">
                  <FormControl>
                    <CurrencyInput placeholder="0" className="max-md:min-h-[40px] max-md:h-10 min-h-[48px] text-lg flex-1" value={field.value} onChange={field.onChange} data-testid="input-debt-amount" />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="shrink-0 flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-md border border-input bg-background hover:bg-muted transition-colors"
                  >
                    <Calculator className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} onConfirm={(val) => form.setValue("amount", val)} />
          <FormField
            control={form.control}
            name="fromAccountId"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-xs">{t.transactions.fromAccount}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-md:min-h-[40px] max-md:h-10 min-h-[48px]" data-testid="select-debt-from">
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
        <div className="shrink-0 px-6 max-md:px-6 md:px-0 pt-2 pb-4 md:pb-0 max-md:border-t max-md:border-border flex flex-col gap-1.5 md:flex-row md:justify-end">
          <Button type="submit" disabled={mutation.isPending || !!hasDebtBadBalance || !watchDebtFromId} className="w-full md:w-auto min-h-[44px] max-md:min-h-[44px] md:min-h-[36px] text-base md:text-sm rounded-md md:order-2" data-testid="button-debt-save">
            {mutation.isPending ? "..." : t.dashboard.payDebt}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} className="w-full md:w-auto min-h-[36px] max-md:min-h-[36px] md:min-h-[36px] text-sm text-muted-foreground md:order-1">
            {t.accounts.cancel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export interface AddActionDialogProps {
  open: boolean;
  onClose: () => void;
  t: any;
  onStreakTriggered?: () => void;
  initialAction?: ActionType | null;
}

export function AddActionDialog({ open, onClose, t, onStreakTriggered, initialAction }: AddActionDialogProps) {
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
        <DialogHeader className="px-6 max-md:px-6 md:px-0 pt-0.5 md:pt-0 pb-0 shrink-0">
          <DialogTitle className="text-base leading-tight">{t.dashboard.addActionTitle}</DialogTitle>
          <DialogDescription className="text-xs">{t.transactions.dialogDesc}</DialogDescription>
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
