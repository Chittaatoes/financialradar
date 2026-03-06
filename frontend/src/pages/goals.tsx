import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContentBottomSheet, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Target, Calendar, TrendingUp, PiggyBank, Lightbulb, AlertTriangle, Trash2, Pencil, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useLanguage } from "@/lib/i18n";
import type { Account, Goal, Transaction } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { differenceInDays, parseISO, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

const goalFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  targetAmount: z.string().min(1, "Target amount is required"),
  deadline: z.string().min(1, "Deadline is required"),
  accountId: z.string().optional(),
});

function GoalForm({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const form = useForm({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetAmount: "",
      deadline: "",
      accountId: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof goalFormSchema>) =>
      apiRequest("POST", "/api/goals", {
        name: data.name,
        targetAmount: data.targetAmount,
        deadline: data.deadline,
        accountId: data.accountId ? parseInt(data.accountId) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Goal created!" });
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.name}</FormLabel>
              <FormControl>
                <Input placeholder={t.goals.namePlaceholder} {...field} data-testid="input-goal-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.targetAmount}</FormLabel>
              <FormControl>
                <CurrencyInput placeholder="10.000.000" value={field.value} onChange={field.onChange} data-testid="input-goal-target" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.dashboard.deadline}</FormLabel>
              <FormControl>
                <Input type="date" {...field} data-testid="input-goal-deadline" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.linkedAccount}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-goal-account">
                    <SelectValue placeholder={t.transactions.selectAccount} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t.accounts.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-goal">
            {mutation.isPending ? "..." : t.goals.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function EditGoalForm({ goal, accounts, onClose }: { goal: Goal; accounts: Account[]; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const form = useForm({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: goal.name,
      targetAmount: String(goal.targetAmount),
      deadline: goal.deadline,
      accountId: goal.accountId ? String(goal.accountId) : "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof goalFormSchema>) =>
      apiRequest("PATCH", `/api/goals/${goal.id}`, {
        name: data.name,
        targetAmount: data.targetAmount,
        deadline: data.deadline,
        accountId: data.accountId ? parseInt(data.accountId) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-save"] });
      toast({ title: t.goals.updated });
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.name}</FormLabel>
              <FormControl>
                <Input placeholder={t.goals.namePlaceholder} {...field} data-testid="input-edit-goal-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetAmount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.targetAmount}</FormLabel>
              <FormControl>
                <CurrencyInput placeholder="10.000.000" value={field.value} onChange={field.onChange} data-testid="input-edit-goal-target" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="deadline"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.dashboard.deadline}</FormLabel>
              <FormControl>
                <Input type="date" {...field} data-testid="input-edit-goal-deadline" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.linkedAccount}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-edit-goal-account">
                    <SelectValue placeholder={t.transactions.selectAccount} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t.accounts.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-update-goal">
            {mutation.isPending ? "..." : t.goals.update}
          </Button>
        </div>
      </form>
    </Form>
  );
}

const depositSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  fromAccountId: z.string().min(1, "Rekening harus dipilih"),
});

function DepositForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });

  const form = useForm({
    resolver: zodResolver(depositSchema),
    defaultValues: { amount: "", fromAccountId: "" },
  });

  const watchFromId = form.watch("fromAccountId");
  const watchAmt = form.watch("amount");
  const selectedFrom = accounts?.find(a => String(a.id) === watchFromId);
  const hasBadBalance = selectedFrom && watchAmt && Number(watchAmt) > Number(selectedFrom.balance);

  const mutation = useMutation({
    mutationFn: (data: { amount: string; fromAccountId: string }) =>
      apiRequest("POST", `/api/goals/${goal.id}/deposit`, {
        amount: data.amount,
        fromAccountId: parseInt(data.fromAccountId),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/goals", goal.id, "history"] });
      toast({ title: "Deposit recorded!" });
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.goals.depositAmount}</FormLabel>
              <FormControl>
                <CurrencyInput placeholder="0" value={field.value} onChange={field.onChange} data-testid="input-deposit-amount" />
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
                  <SelectTrigger data-testid="select-deposit-from">
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t.accounts.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending || !!hasBadBalance || !watchFromId} data-testid="button-deposit">
            {mutation.isPending ? "..." : t.goals.submitDeposit}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function GoalHistory({ goalId }: { goalId: number }) {
  const { data: deposits, isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/goals", goalId, "history"],
  });

  if (isLoading) {
    return (
      <div className="space-y-2 pt-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!deposits || deposits.length === 0) {
    return (
      <p className="text-xs text-muted-foreground pt-3 text-center py-4">Belum ada setoran</p>
    );
  }

  return (
    <div className="pt-3 space-y-0">
      {deposits.map((tx, i) => (
        <div key={tx.id}>
          {i > 0 && <div className="h-px bg-foreground/[0.06] mx-0" />}
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-muted-foreground">
              {format(parseISO(tx.date), "dd MMM yyyy")}
            </span>
            <span className="text-xs font-mono font-semibold text-foreground">
              {formatCurrency(Number(tx.amount))}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Goals() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: goals, isLoading } = useQuery<Goal[]>({ queryKey: ["/api/goals"] });

  const deleteGoalMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/smart-save"] });
      toast({ title: t.goals.deleted });
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });
  const { data: accounts } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: smartSave } = useQuery<{
    recommendations: { goalId: number; goalName: string; dailySuggestion: number; remaining: number; daysLeft: number; hasIncomeThisWeek: boolean; isOverspending: boolean }[];
    weeklyIncome: number;
    weeklyExpense: number;
  }>({ queryKey: ["/api/smart-save"] });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        {[1, 2].map(i => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold" data-testid="text-goals-title">{t.goals.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.goals.subtitle}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-goal">
              <Plus className="w-4 h-4 mr-2" /> {t.goals.addGoal}
            </Button>
          </DialogTrigger>
          <DialogContentBottomSheet>
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-2 pb-4 shrink-0 md:-mx-6 md:-mt-6">
              <DialogHeader className="text-center md:text-left space-y-1">
                <DialogTitle className="font-serif">{t.goals.dialogTitle}</DialogTitle>
                <DialogDescription>{t.goals.dialogDesc}</DialogDescription>
              </DialogHeader>
            </div>
            <div className="overflow-y-auto px-6 pt-4 pb-6 md:px-0 md:pt-2 md:pb-0">
              <GoalForm accounts={accounts ?? []} onClose={() => setDialogOpen(false)} />
            </div>
          </DialogContentBottomSheet>
        </Dialog>
      </div>

      <Dialog open={!!depositGoal} onOpenChange={(open) => !open && setDepositGoal(null)}>
        <DialogContentBottomSheet>
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-2 pb-4 shrink-0 md:-mx-6 md:-mt-6">
            <DialogHeader className="text-center md:text-left space-y-1">
              <DialogTitle className="font-serif">{t.goals.depositTitle} {depositGoal?.name}</DialogTitle>
              <DialogDescription>{t.goals.depositDesc}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto px-6 pt-4 pb-6 md:px-0 md:pt-2 md:pb-0">
            {depositGoal && <DepositForm goal={depositGoal} onClose={() => setDepositGoal(null)} />}
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      <Dialog open={!!editGoal} onOpenChange={(open) => !open && setEditGoal(null)}>
        <DialogContentBottomSheet>
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-2 pb-4 shrink-0 md:-mx-6 md:-mt-6">
            <DialogHeader className="text-center md:text-left space-y-1">
              <DialogTitle className="font-serif">{t.goals.editGoalTitle}</DialogTitle>
              <DialogDescription>{t.goals.editGoalDesc}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto px-6 pt-4 pb-6 md:px-0 md:pt-2 md:pb-0">
            {editGoal && <EditGoalForm goal={editGoal} accounts={accounts ?? []} onClose={() => setEditGoal(null)} />}
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      {smartSave && smartSave.recommendations.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">{t.goals.smartSave}</span>
            </div>
            {smartSave.recommendations.some(r => r.isOverspending) && (
              <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded-md p-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{t.goals.overspendingWarning}</span>
              </div>
            )}
            <div className="space-y-2">
              {smartSave.recommendations.map((rec) => (
                <div key={rec.goalId} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{rec.goalName}</p>
                    <p className="text-xs text-muted-foreground">{rec.daysLeft} {t.goals.daysLeft}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono font-bold text-primary">
                      {formatCurrency(rec.dailySuggestion)}{t.goals.perDay}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(rec.remaining)} {t.goals.remainingLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!goals || goals.length === 0) ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Target className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-foreground">{t.goals.noGoals}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t.goals.noGoalsDesc}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const current = parseFloat(String(goal.currentAmount));
            const target = parseFloat(String(goal.targetAmount));
            const progress = target > 0 ? (current / target) * 100 : 0;
            const remaining = target - current;
            const daysLeft = differenceInDays(parseISO(goal.deadline), new Date());
            const dailySuggestion = daysLeft > 0 && remaining > 0 ? remaining / daysLeft : 0;
            const completed = current >= target;

            return (
              <Card key={goal.id} className="hover-elevate transition-all duration-200" data-testid={`card-goal-${goal.id}`}>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                        <Target className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{goal.name}</h3>
                        {completed && (
                          <span className="text-xs text-green-600 dark:text-green-400 font-medium">{t.goals.completed}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!completed && (
                        <Button variant="outline" size="sm" onClick={() => setDepositGoal(goal)} data-testid={`button-deposit-${goal.id}`}>
                          <PiggyBank className="w-4 h-4 mr-1" /> {t.goals.deposit}
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditGoal(goal)}
                        data-testid={`button-edit-goal-${goal.id}`}
                      >
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteGoalMutation.mutate(goal.id)}
                        disabled={deleteGoalMutation.isPending}
                        data-testid={`button-delete-goal-${goal.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 text-sm mb-1">
                      <span className="font-mono text-muted-foreground">
                        {formatCurrency(current)} / {formatCurrency(target)}
                      </span>
                      <span className="font-medium">{Math.round(progress)}%</span>
                    </div>
                    <Progress value={Math.min(progress, 100)} className="h-2" />
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <TrendingUp className="w-3 h-3" />
                        <span className="text-[10px]">{t.goals.remaining}</span>
                      </div>
                      <p className="text-xs font-mono font-semibold">{formatCurrency(Math.max(remaining, 0))}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px]">{t.goals.daysLeft}</span>
                      </div>
                      <p className="text-xs font-mono font-semibold">{Math.max(daysLeft, 0)}</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                        <PiggyBank className="w-3 h-3" />
                        <span className="text-[10px]">{t.goals.daily}</span>
                      </div>
                      <p className="text-xs font-mono font-semibold">
                        {dailySuggestion > 0 ? formatCurrency(Math.ceil(dailySuggestion)) : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-foreground/[0.07] -mx-5" />

                  <button
                    type="button"
                    onClick={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
                    className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors -mx-0 py-0.5"
                    data-testid={`button-toggle-history-${goal.id}`}
                  >
                    <span>Riwayat Setoran</span>
                    <motion.span
                      animate={{ rotate: expandedGoalId === goal.id ? 180 : 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </motion.span>
                  </button>

                  <AnimatePresence initial={false}>
                    {expandedGoalId === goal.id && (
                      <motion.div
                        key="history"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <GoalHistory goalId={goal.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
