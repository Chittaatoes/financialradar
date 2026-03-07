import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContentBottomSheet, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CheckCircle, Sparkles, Percent, DollarSign, ChevronLeft } from "lucide-react";
import { format } from "date-fns";

type Strategy = "percentage" | "fixed";

interface WizardState {
  income: string;
  strategy: Strategy;
  needsPct: number;
  wantsPct: number;
  savingsPct: number;
  investmentPct: number;
  needsAmt: string;
  wantsAmt: string;
  savingsAmt: string;
  investmentAmt: string;
}

const TOTAL_STEPS = 4;

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i === current
              ? "w-7 bg-primary"
              : i < current
              ? "w-4 bg-primary/40"
              : "w-4 bg-muted-foreground/20"
          )}
        />
      ))}
    </div>
  );
}

function Step1Income({
  state,
  onChange,
  onNext,
  t,
}: {
  state: WizardState;
  onChange: (v: Partial<WizardState>) => void;
  onNext: () => void;
  t: any;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-primary/15">
          <span className="text-3xl">💰</span>
        </div>
        <div>
          <h2 className="text-xl font-bold">{t.budget.wizardTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.budget.wizardSubtitle}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.budget.wizardIncomeLabel}</label>
        <CurrencyInput
          value={state.income}
          onChange={(v) => onChange({ income: v })}
          placeholder="0"
          className="min-h-[52px] text-lg"
          data-testid="wizard-income-input"
        />
      </div>

      <Button
        className="w-full min-h-[52px] text-base font-semibold"
        disabled={!state.income || parseFloat(state.income) <= 0}
        onClick={onNext}
        data-testid="wizard-next-1"
      >
        {t.budget.nextStrategy}
      </Button>
    </div>
  );
}

function Step2Strategy({
  state,
  onChange,
  onNext,
  onBack,
  t,
}: {
  state: WizardState;
  onChange: (v: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  t: any;
}) {
  const options: { key: Strategy; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      key: "percentage",
      label: t.budget.strategyPercentage,
      desc: t.budget.strategyPercentageDesc,
      icon: <Percent className="w-5 h-5 text-primary" />,
    },
    {
      key: "fixed",
      label: t.budget.strategyFixed,
      desc: t.budget.strategyFixedDesc,
      icon: <DollarSign className="w-5 h-5 text-primary" />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-xl font-bold">{t.budget.wizardStrategyTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.budget.wizardStrategySubtitle}</p>
      </div>

      <div className="flex flex-col gap-3">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange({ strategy: opt.key })}
            className={cn(
              "w-full text-left rounded-2xl border-2 p-4 flex items-center gap-4 transition-all duration-200",
              state.strategy === opt.key
                ? "border-primary bg-primary/5"
                : "border-border hover:border-border/80"
            )}
            data-testid={`wizard-strategy-${opt.key}`}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
              state.strategy === opt.key ? "bg-primary/15" : "bg-muted"
            )}>
              {opt.icon}
            </div>
            <div>
              <p className="font-semibold text-sm">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 min-h-[48px]">
          <ChevronLeft className="w-4 h-4 mr-1" /> {t.budget.back}
        </Button>
        <Button onClick={onNext} className="flex-2 flex-1 min-h-[48px] font-semibold" data-testid="wizard-next-2">
          {t.budget.nextAllocation}
        </Button>
      </div>
    </div>
  );
}

const GROUP_COLORS = {
  needs: { dot: "bg-purple-400", track: "bg-purple-400" },
  wants: { dot: "bg-orange-400", track: "bg-orange-400" },
  savings: { dot: "bg-blue-400", track: "bg-blue-400" },
  investment: { dot: "bg-green-400", track: "bg-green-400" },
};

function Step3Percentage({
  state,
  onChange,
  onNext,
  onBack,
  t,
}: {
  state: WizardState;
  onChange: (v: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  t: any;
}) {
  const income = parseFloat(state.income) || 0;
  const total = state.needsPct + state.wantsPct + state.savingsPct + state.investmentPct;
  const isValid = total === 100;

  const rows: { key: keyof WizardState; pctKey: "needsPct" | "wantsPct" | "savingsPct" | "investmentPct"; label: string; color: typeof GROUP_COLORS.needs }[] = [
    { key: "needsPct", pctKey: "needsPct", label: t.budget.needsPct, color: GROUP_COLORS.needs },
    { key: "wantsPct", pctKey: "wantsPct", label: t.budget.wantsPct, color: GROUP_COLORS.wants },
    { key: "savingsPct", pctKey: "savingsPct", label: t.budget.savingsPct, color: GROUP_COLORS.savings },
    { key: "investmentPct", pctKey: "investmentPct", label: t.budget.investmentPct, color: GROUP_COLORS.investment },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold">{t.budget.wizardAllocTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t.budget.wizardAllocSubtitle}</p>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((row) => {
          const pct = state[row.pctKey] as number;
          const amt = income * pct / 100;
          return (
            <div key={row.key} className="rounded-xl bg-muted/40 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2.5 h-2.5 rounded-full", row.color.dot)} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground font-mono">{formatCurrency(amt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  onChange={(e) => onChange({ [row.pctKey]: Number(e.target.value) } as Partial<WizardState>)}
                  className="flex-1 accent-primary h-1.5 rounded-full"
                  data-testid={`wizard-slider-${row.pctKey}`}
                />
                <span className="text-sm font-bold w-10 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn(
        "rounded-xl px-4 py-3 text-center text-sm font-bold tracking-wider",
        isValid ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        {t.budget.totalLabel}: {total}% / 100%
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 min-h-[48px]">
          <ChevronLeft className="w-4 h-4 mr-1" /> {t.budget.back}
        </Button>
        <Button onClick={onNext} disabled={!isValid} className="flex-1 min-h-[48px] font-semibold" data-testid="wizard-next-3">
          {t.budget.nextPeriod}
        </Button>
      </div>
    </div>
  );
}

function Step3Fixed({
  state,
  onChange,
  onNext,
  onBack,
  t,
}: {
  state: WizardState;
  onChange: (v: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
  t: any;
}) {
  const income = parseFloat(state.income) || 0;
  const needs = parseFloat(state.needsAmt) || 0;
  const wants = parseFloat(state.wantsAmt) || 0;
  const savings = parseFloat(state.savingsAmt) || 0;
  const investment = parseFloat(state.investmentAmt) || 0;
  const total = needs + wants + savings + investment;
  const remaining = income - total;
  const isValid = total <= income;

  const rows: { amtKey: "needsAmt" | "wantsAmt" | "savingsAmt" | "investmentAmt"; label: string; color: typeof GROUP_COLORS.needs }[] = [
    { amtKey: "needsAmt", label: t.budget.needsPct, color: GROUP_COLORS.needs },
    { amtKey: "wantsAmt", label: t.budget.wantsPct, color: GROUP_COLORS.wants },
    { amtKey: "savingsAmt", label: t.budget.savingsPct, color: GROUP_COLORS.savings },
    { amtKey: "investmentAmt", label: t.budget.investmentPct, color: GROUP_COLORS.investment },
  ];

  const subtitleText = (t.budget.wizardAllocSubtitleFixed as string).replace("{income}", formatCurrency(income));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-xl font-bold">{t.budget.wizardAllocTitle}</h2>
        <p className="text-sm text-muted-foreground mt-1">{subtitleText}</p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.amtKey} className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn("w-2 h-2 rounded-full", row.color.dot)} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{row.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground uppercase">Tetap</span>
            </div>
            <CurrencyInput
              value={state[row.amtKey] as string}
              onChange={(v) => onChange({ [row.amtKey]: v } as Partial<WizardState>)}
              placeholder="0"
              className="min-h-[44px]"
              data-testid={`wizard-fixed-${row.amtKey}`}
            />
          </div>
        ))}
      </div>

      <div className={cn(
        "rounded-xl px-4 py-3 text-center text-sm font-bold tracking-wider",
        remaining < 0 ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
      )}>
        {t.budget.remainingLabel}: {formatCurrency(remaining)}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 min-h-[48px]">
          <ChevronLeft className="w-4 h-4 mr-1" /> {t.budget.back}
        </Button>
        <Button onClick={onNext} disabled={!isValid} className="flex-1 min-h-[48px] font-semibold" data-testid="wizard-next-3b">
          {t.budget.nextPeriod}
        </Button>
      </div>
    </div>
  );
}

function Step4Confirm({
  state,
  onConfirm,
  onBack,
  isPending,
  t,
}: {
  state: WizardState;
  onConfirm: () => void;
  onBack: () => void;
  isPending: boolean;
  t: any;
}) {
  const income = parseFloat(state.income) || 0;

  const getGroupAmount = (key: "needs" | "wants" | "savings" | "investment") => {
    if (state.strategy === "percentage") {
      const pctMap = { needs: state.needsPct, wants: state.wantsPct, savings: state.savingsPct, investment: state.investmentPct };
      return income * pctMap[key] / 100;
    }
    const amtMap = { needs: state.needsAmt, wants: state.wantsAmt, savings: state.savingsAmt, investment: state.investmentAmt };
    return parseFloat(amtMap[key]) || 0;
  };

  const strategyLabel = state.strategy === "percentage" ? t.budget.strategyPercentage : t.budget.strategyFixed;

  const groups = [
    { key: "needs" as const, label: t.budget.needsPct, color: GROUP_COLORS.needs },
    { key: "wants" as const, label: t.budget.wantsPct, color: GROUP_COLORS.wants },
    { key: "savings" as const, label: t.budget.savingsPct, color: GROUP_COLORS.savings },
    { key: "investment" as const, label: t.budget.investmentPct, color: GROUP_COLORS.investment },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-primary/10">
            <Sparkles className="w-9 h-9 text-primary" />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-background border-2 border-border flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-primary" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-bold">{t.budget.confirmTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.budget.confirmSubtitle}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border divide-y divide-border overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.budget.confirmIncome}</span>
          <span className="font-mono font-bold text-primary">{formatCurrency(income)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.budget.confirmStrategy}</span>
          <span className="font-medium text-sm">{strategyLabel}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t.budget.confirmPeriod}</span>
          <span className="font-medium text-sm">{t.budget.periodMonthly}</span>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", g.color.dot)} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
            </div>
            <span className="font-mono text-sm">{formatCurrency(getGroupAmount(g.key))}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" onClick={onBack} className="flex-1 min-h-[48px]">
          <ChevronLeft className="w-4 h-4 mr-1" /> {t.budget.back}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isPending}
          className="flex-1 min-h-[52px] text-base font-bold"
          data-testid="wizard-confirm"
        >
          {isPending ? "..." : t.budget.confirmBtn}
        </Button>
      </div>
    </div>
  );
}

interface BudgetSetupWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  defaultIncome?: number;
}

export function BudgetSetupWizard({ open, onClose, onComplete, defaultIncome }: BudgetSetupWizardProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const currentMonth = format(new Date(), "yyyy-MM");

  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    income: defaultIncome ? String(defaultIncome) : "",
    strategy: "percentage",
    needsPct: 50,
    wantsPct: 25,
    savingsPct: 15,
    investmentPct: 10,
    needsAmt: "",
    wantsAmt: "",
    savingsAmt: "",
    investmentAmt: "",
  });

  const update = (v: Partial<WizardState>) => setState((s) => ({ ...s, ...v }));

  const confirmMutation = useMutation({
    mutationFn: () => {
      const income = parseFloat(state.income);
      let needsAmount: number, wantsAmount: number, savingsAmount: number, investmentAmount: number;
      if (state.strategy === "percentage") {
        needsAmount = income * state.needsPct / 100;
        wantsAmount = income * state.wantsPct / 100;
        savingsAmount = income * state.savingsPct / 100;
        investmentAmount = income * state.investmentPct / 100;
      } else {
        needsAmount = parseFloat(state.needsAmt) || 0;
        wantsAmount = parseFloat(state.wantsAmt) || 0;
        savingsAmount = parseFloat(state.savingsAmt) || 0;
        investmentAmount = parseFloat(state.investmentAmt) || 0;
      }
      return apiRequest("POST", "/api/budget-plan", {
        month: currentMonth,
        income,
        strategy: state.strategy,
        needsAmount,
        wantsAmount,
        savingsAmount,
        investmentAmount,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget-plan"] });
      queryClient.invalidateQueries({ queryKey: ["/api/budget/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      onComplete();
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const handleClose = () => {
    onClose();
    setTimeout(() => { setStep(0); }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContentBottomSheet aria-describedby={undefined}>
        <VisuallyHidden.Root>
          <DialogTitle>Budget Setup Wizard</DialogTitle>
        </VisuallyHidden.Root>
        <span aria-hidden="true" id="budget-wizard-desc" className="sr-only">Budget setup wizard</span>
        <div className="px-6 pt-2 pb-6">
          <StepDots current={step} total={TOTAL_STEPS} />

          {step === 0 && (
            <Step1Income state={state} onChange={update} onNext={() => setStep(1)} t={t} />
          )}
          {step === 1 && (
            <Step2Strategy state={state} onChange={update} onNext={() => setStep(2)} onBack={() => setStep(0)} t={t} />
          )}
          {step === 2 && state.strategy === "percentage" && (
            <Step3Percentage state={state} onChange={update} onNext={() => setStep(3)} onBack={() => setStep(1)} t={t} />
          )}
          {step === 2 && state.strategy === "fixed" && (
            <Step3Fixed state={state} onChange={update} onNext={() => setStep(3)} onBack={() => setStep(1)} t={t} />
          )}
          {step === 3 && (
            <Step4Confirm
              state={state}
              onConfirm={() => confirmMutation.mutate()}
              onBack={() => setStep(2)}
              isPending={confirmMutation.isPending}
              t={t}
            />
          )}
        </div>
      </DialogContentBottomSheet>
    </Dialog>
  );
}
