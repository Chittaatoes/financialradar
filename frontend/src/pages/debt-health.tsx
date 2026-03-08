import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContentBottomSheet, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContentBottomSheet,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Plus, Shield, Trash2, AlertTriangle, CheckCircle2, AlertCircle,
  ChevronDown, Info, Landmark, Wallet, TrendingDown,
} from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useLanguage } from "@/lib/i18n";
import type { Liability } from "@shared/schema";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface DebtHealthData {
  totalAssets: number;
  totalLiabilities: number;
  debtRatio: number;
  status: "healthy" | "caution" | "danger";
  riskProfile: string;
  healthyLimit: number;
  monthlyIncome: number;
  totalMonthlyInstallments: number;
  dsr: number;
  remainingAfterDebt: number;
  pressureStatus: "stable" | "moderate" | "high";
}

const liabilityFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.string().optional(),
  debtType: z.enum(["credit_card", "personal_loan", "mortgage", "business_loan", "other"]),
  hasInstallment: z.boolean(),
  totalLoanAmount: z.string().optional(),
  monthlyPayment: z.string().optional(),
  remainingMonths: z.string().optional(),
  dueDay: z.string().optional(),
  interestRate: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.hasInstallment) {
    if (!data.monthlyPayment || parseFloat(data.monthlyPayment) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Monthly payment is required for installments", path: ["monthlyPayment"] });
    }
    if (!data.remainingMonths || parseInt(data.remainingMonths) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Remaining months is required for installments", path: ["remainingMonths"] });
    }
  } else {
    if (!data.amount || parseFloat(data.amount) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount is required", path: ["amount"] });
    }
  }
});

function LiabilityForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const form = useForm({
    resolver: zodResolver(liabilityFormSchema),
    defaultValues: {
      name: "",
      amount: "",
      debtType: "other" as const,
      hasInstallment: false,
      totalLoanAmount: "",
      monthlyPayment: "",
      remainingMonths: "",
      dueDay: "",
      interestRate: "",
    },
  });

  const hasInstallment = useWatch({ control: form.control, name: "hasInstallment" });
  const watchMonthly = useWatch({ control: form.control, name: "monthlyPayment" });
  const watchMonths = useWatch({ control: form.control, name: "remainingMonths" });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof liabilityFormSchema>) => {
      let computedAmount = data.amount || "0";
      if (data.hasInstallment && data.monthlyPayment && data.remainingMonths) {
        computedAmount = String(parseFloat(data.monthlyPayment) * parseInt(data.remainingMonths));
      }
      const payload: Record<string, any> = {
        name: data.name,
        amount: computedAmount,
        debtType: data.debtType,
      };
      if (data.hasInstallment) {
        if (data.totalLoanAmount) payload.totalLoanAmount = data.totalLoanAmount;
        if (data.monthlyPayment) payload.monthlyPayment = data.monthlyPayment;
        if (data.remainingMonths) payload.remainingMonths = parseInt(data.remainingMonths);
        if (data.dueDay) payload.dueDay = parseInt(data.dueDay);
        if (data.interestRate) payload.interestRate = data.interestRate;
      }
      return apiRequest("POST", "/api/liabilities", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/debt-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/net-worth"] });
      toast({ title: "Liability added" });
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
              <FormLabel>{t.debtHealth.name}</FormLabel>
              <FormControl>
                <Input placeholder={t.debtHealth.namePlaceholder} {...field} data-testid="input-liability-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="debtType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.debtHealth.debtTypeLabel}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-debt-type">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="credit_card" data-testid="option-credit-card">{t.debtHealth.creditCard}</SelectItem>
                  <SelectItem value="personal_loan" data-testid="option-personal-loan">{t.debtHealth.personalLoan}</SelectItem>
                  <SelectItem value="mortgage" data-testid="option-mortgage">{t.debtHealth.mortgage}</SelectItem>
                  <SelectItem value="business_loan" data-testid="option-business-loan">{t.debtHealth.businessLoan}</SelectItem>
                  <SelectItem value="other" data-testid="option-other">{t.debtHealth.otherDebt}</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="hasInstallment"
          render={({ field }) => (
            <FormItem>
              <div className="flex rounded-md overflow-visible border" role="radiogroup" aria-label={t.debtHealth.installment}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!field.value}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${!field.value ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                  onClick={() => field.onChange(false)}
                  data-testid="button-debt-onetime"
                >
                  {t.debtHealth.oneTime}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={field.value}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${field.value ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                  onClick={() => field.onChange(true)}
                  data-testid="button-debt-installment"
                >
                  {t.debtHealth.installment}
                </button>
              </div>
            </FormItem>
          )}
        />

        {!hasInstallment && (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.debtHealth.totalDebtAmount}</FormLabel>
                <FormControl>
                  <CurrencyInput placeholder="0" value={field.value} onChange={field.onChange} data-testid="input-liability-amount" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {hasInstallment && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="monthlyPayment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.debtHealth.monthlyPayment}</FormLabel>
                    <FormControl>
                      <CurrencyInput placeholder="0" value={field.value} onChange={field.onChange} data-testid="input-liability-monthly" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="remainingMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.debtHealth.remainingMonths}</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="12" {...field} data-testid="input-liability-months" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {watchMonthly && watchMonths && (
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">{t.debtHealth.totalDebtAmount}: </span>
                <span className="font-semibold font-mono">{formatCurrency(parseFloat(watchMonthly) * parseInt(watchMonths))}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="dueDay"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.debtHealth.dueDayOfMonth}</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" max="31" placeholder="15" {...field} data-testid="input-liability-dueday" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.debtHealth.interestRate}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="0.00" {...field} data-testid="input-liability-rate" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-background pb-1">
          <Button type="button" variant="outline" onClick={onClose}>{t.debtHealth.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-liability">
            {mutation.isPending ? "..." : t.debtHealth.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function RiskProfileSelector({ currentProfile, healthyLimit }: { currentProfile: string; healthyLimit: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (riskProfile: string) =>
      apiRequest("PATCH", "/api/profile/risk-profile", { riskProfile }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/debt-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const profileLabels: Record<string, string> = {
    conservative: t.debtHealth.conservative,
    moderate: t.debtHealth.moderate,
    aggressive: t.debtHealth.aggressive,
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Landmark className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t.debtHealth.riskProfile}</span>
      </div>
      <Select
        value={currentProfile}
        onValueChange={(val) => mutation.mutate(val)}
        disabled={mutation.isPending}
      >
        <SelectTrigger className="w-[160px]" data-testid="select-risk-profile">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="conservative" data-testid="option-conservative">{profileLabels.conservative}</SelectItem>
          <SelectItem value="moderate" data-testid="option-moderate">{profileLabels.moderate}</SelectItem>
          <SelectItem value="aggressive" data-testid="option-aggressive">{profileLabels.aggressive}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function WhatThisMeansSection({ status, riskProfile, healthyLimit, debtRatio }: { status: string; riskProfile: string; healthyLimit: number; debtRatio: number }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const insights: Record<string, string> = {
    healthy: t.debtHealth.insightHealthy,
    caution: t.debtHealth.insightCaution,
    danger: t.debtHealth.insightDanger,
  };

  const moderateTip = t.debtHealth.insightModerateTip.replace("{limit}", String(healthyLimit));
  const profileTips: Record<string, string> = {
    conservative: t.debtHealth.insightConservativeTip.replace("{limit}", String(healthyLimit)),
    moderate: moderateTip,
    balanced: moderateTip,
    aggressive: t.debtHealth.insightAggressiveTip.replace("{limit}", String(healthyLimit)),
  };

  const statusColors: Record<string, string> = {
    healthy: "border-l-green-500",
    caution: "border-l-yellow-500",
    danger: "border-l-red-500",
  };

  return (
    <Card data-testid="card-what-this-means">
      <CardContent className="p-0">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 p-4 text-left hover-elevate rounded-md"
          onClick={() => setExpanded(!expanded)}
          data-testid="button-toggle-insight"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{t.debtHealth.whatThisMeans}</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-3" data-testid="section-insight-content">
            {debtRatio > 100 ? (
              <div className="pl-3 border-l-2 border-l-amber-500">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t.debtHealth.highRatioMessage}
                </p>
              </div>
            ) : (
              <div className={`pl-3 border-l-2 ${statusColors[status] ?? "border-l-muted"}`}>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {insights[status]}
                </p>
              </div>
            )}
            <div className="pl-3 border-l-2 border-l-muted">
              <p className="text-xs text-muted-foreground leading-relaxed italic">
                {profileTips[riskProfile]}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getRemainingBalance(l: Liability): number {
  if (l.monthlyPayment && l.remainingMonths) {
    return parseFloat(String(l.monthlyPayment)) * l.remainingMonths;
  }
  return parseFloat(String(l.amount));
}

function LiabilityCard({ l, onDelete, isPending }: { l: Liability; onDelete: (id: number) => void; isPending: boolean }) {
  const { t } = useLanguage();

  const remaining = getRemainingBalance(l);
  const isInstallment = !!(l.monthlyPayment && l.remainingMonths);
  const debtTypeLabels: Record<string, string> = {
    credit_card: t.debtHealth.creditCard,
    personal_loan: t.debtHealth.personalLoan,
    mortgage: t.debtHealth.mortgage,
    business_loan: t.debtHealth.businessLoan,
    other: t.debtHealth.otherDebt,
  };

  let progressPct = 0;
  if (isInstallment && l.totalLoanAmount) {
    const total = parseFloat(String(l.totalLoanAmount));
    if (total > 0) {
      progressPct = Math.max(0, Math.min(100, ((total - remaining) / total) * 100));
    }
  }

  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-liability-${l.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium">{l.name}</p>
              <Badge variant="secondary" className="text-[10px]">
                {debtTypeLabels[l.debtType] ?? l.debtType}
              </Badge>
            </div>
            <p className="text-lg font-mono font-bold mt-1">{formatCurrency(remaining)}</p>
            {isInstallment && (
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                <span>{formatCurrency(l.monthlyPayment!)} {t.debtHealth.perMonth}</span>
                <span>{l.remainingMonths} {t.debtHealth.monthsLeft}</span>
                {l.dueDay && <span>Due: {l.dueDay}</span>}
              </div>
            )}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid={`button-delete-liability-${l.id}`}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContentBottomSheet>
              <AlertDialogHeader className="text-center md:text-left mb-4">
                <AlertDialogTitle>{t.debtHealth.deleteTitle}</AlertDialogTitle>
                <AlertDialogDescription>{t.debtHealth.deleteDesc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2 sm:space-x-0">
                <AlertDialogAction
                  className="w-full"
                  onClick={() => onDelete(l.id)}
                  disabled={isPending}
                  data-testid={`button-confirm-delete-${l.id}`}
                >
                  {t.debtHealth.delete}
                </AlertDialogAction>
                <AlertDialogCancel className="w-full mt-0 border-0 bg-muted/50 hover:bg-muted">
                  {t.debtHealth.cancel}
                </AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContentBottomSheet>
          </AlertDialog>
        </div>

        {isInstallment && l.totalLoanAmount && progressPct > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
              <span>{Math.round(progressPct)}% {t.debtHealth.completed}</span>
              {l.totalLoanAmount && (
                <span>{formatCurrency(l.totalLoanAmount)}</span>
              )}
            </div>
            <Progress value={progressPct} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DebtHealth() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: health, isLoading: healthLoading } = useQuery<DebtHealthData>({
    queryKey: ["/api/debt-health"],
  });

  const { data: liabilities, isLoading: liabLoading } = useQuery<Liability[]>({
    queryKey: ["/api/liabilities"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/liabilities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/debt-health"] });
      queryClient.invalidateQueries({ queryKey: ["/api/net-worth"] });
      toast({ title: "Liability removed" });
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

  const isLoading = healthLoading || liabLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const status = health?.status ?? "healthy";
  const riskProfile = health?.riskProfile === "balanced" ? "moderate" : (health?.riskProfile ?? "moderate");
  const healthyLimit = health?.healthyLimit ?? 30;
  const debtRatio = health?.debtRatio ?? 0;

  const statusLabels: Record<string, string> = {
    healthy: t.debtHealth.healthy,
    caution: t.debtHealth.caution,
    danger: t.debtHealth.danger,
  };
  const statusColors: Record<string, { color: string; bg: string }> = {
    healthy: { color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
    caution: { color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-500/10" },
    danger: { color: "text-red-500 dark:text-red-400", bg: "bg-red-500/10" },
  };
  const statusIcons: Record<string, typeof CheckCircle2> = {
    healthy: CheckCircle2,
    caution: AlertTriangle,
    danger: AlertCircle,
  };

  const StatusIcon = statusIcons[status];
  const colorCfg = statusColors[status];

  const installmentLiabilities = (liabilities ?? []).filter(l => l.monthlyPayment && l.remainingMonths);
  const otherLiabilities = (liabilities ?? []).filter(l => !(l.monthlyPayment && l.remainingMonths));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold" data-testid="text-debt-title">{t.debtHealth.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.debtHealth.subtitle}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-liability">
              <Plus className="w-4 h-4 mr-2" /> {t.debtHealth.addLiability}
            </Button>
          </DialogTrigger>
          <DialogContentBottomSheet>
            <DialogHeader className="px-6 max-md:px-6 md:px-0 pt-1 md:pt-0">
              <DialogTitle className="text-lg">{t.debtHealth.dialogTitle}</DialogTitle>
              <DialogDescription>{t.debtHealth.dialogDesc}</DialogDescription>
            </DialogHeader>
            <div className="px-6 max-md:px-6 md:px-0 pb-6 max-md:pb-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh]">
              <LiabilityForm onClose={() => setDialogOpen(false)} />
            </div>
          </DialogContentBottomSheet>
        </Dialog>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-base font-bold">{t.debtHealth.debtToAssetRatio}</h3>
        </div>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-md flex items-center justify-center ${colorCfg.bg}`}>
                <StatusIcon className={`w-5 h-5 ${colorCfg.color}`} />
              </div>
              <div>
                <h3 className={`text-sm font-bold ${colorCfg.color}`} data-testid="text-debt-status">{statusLabels[status]}</h3>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">{t.debtHealth.totalAssets}</p>
                <p className="font-mono font-semibold text-sm mt-0.5" data-testid="text-debt-assets">{formatCurrency(health?.totalAssets ?? 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">{t.debtHealth.totalLiabilities}</p>
                <p className="font-mono font-semibold text-sm mt-0.5" data-testid="text-debt-liabilities">{formatCurrency(health?.totalLiabilities ?? 0)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">{t.debtHealth.debtRatio}</p>
                <p className={`font-mono font-bold text-sm mt-0.5 ${colorCfg.color}`} data-testid="text-debt-ratio">
                  {Math.round(debtRatio)}%
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="relative">
                <Progress value={Math.min(debtRatio, 100)} className="h-2.5" />
                <div
                  className="absolute top-0 h-2.5 w-0.5 bg-foreground/60"
                  style={{ left: `${Math.min(healthyLimit, 100)}%` }}
                  title={`${t.debtHealth.healthyLimit}: ${healthyLimit}%`}
                  data-testid="marker-healthy-limit"
                />
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>0%</span>
                <span className="font-medium">{healthyLimit}% {t.debtHealth.healthyLimit}</span>
                <span>100%</span>
              </div>
            </div>

            <RiskProfileSelector currentProfile={riskProfile} healthyLimit={healthyLimit} />
          </CardContent>
        </Card>
      </div>

      <WhatThisMeansSection status={status} riskProfile={riskProfile} healthyLimit={healthyLimit} debtRatio={debtRatio} />

      <div>
        <h3 className="font-semibold mb-3">{t.debtHealth.liabilitiesList}</h3>
        {(!liabilities || liabilities.length === 0) ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t.debtHealth.noLiabilities}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {installmentLiabilities.map((l) => (
              <LiabilityCard
                key={l.id}
                l={l}
                onDelete={(id) => deleteMutation.mutate(id)}
                isPending={deleteMutation.isPending}
              />
            ))}
            {otherLiabilities.map((l) => (
              <LiabilityCard
                key={l.id}
                l={l}
                onDelete={(id) => deleteMutation.mutate(id)}
                isPending={deleteMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
