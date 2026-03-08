import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";

interface SpendingInsightData {
  totalExpense: number;
  totalIncome: number;
}

interface BudgetSummaryCardProps {
  hidden: boolean;
  animating: boolean;
}

const MASKED_LONG = "Rp......";
const MASKED_SHORT = "******";

export function BudgetSummaryCard({ hidden, animating }: BudgetSummaryCardProps) {
  const { data, isLoading } = useQuery<SpendingInsightData>({
    queryKey: ["/api/spending-insight?period=monthly"],
  });

  if (isLoading) {
    return (
      <Card className="border-0 overflow-hidden" style={{ background: "linear-gradient(135deg, #0f4c2e 0%, #1a3a28 50%, #162b20 100%)" }}>
        <CardContent className="p-5 space-y-4">
          <Skeleton className="h-4 w-28 bg-white/10" />
          <Skeleton className="h-10 w-40 bg-white/10" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 bg-white/10 rounded-xl" />
            <Skeleton className="h-16 bg-white/10 rounded-xl" />
          </div>
          <Skeleton className="h-12 bg-white/10 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const monthlyIncome = data?.totalIncome ?? 0;
  const monthlyExpenses = data?.totalExpense ?? 0;
  const remainingBudget = monthlyIncome - monthlyExpenses;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  const remainingDays = daysInMonth - today + 1;
  const dailyBudget = remainingDays > 0 ? Math.max(0, remainingBudget / remainingDays) : 0;

  const usagePercent = monthlyIncome > 0 ? Math.min((monthlyExpenses / monthlyIncome) * 100, 100) : 0;
  const overBudget = monthlyExpenses > monthlyIncome;

  const expectedSpending = monthlyIncome > 0 ? (monthlyIncome / daysInMonth) * today : 0;
  let status: "on-track" | "careful" | "overspending";
  let statusLabel: string;
  let StatusIcon: typeof CheckCircle2;
  let statusColor: string;
  let statusBg: string;

  if (monthlyExpenses <= expectedSpending) {
    status = "on-track";
    statusLabel = "On Track";
    StatusIcon = CheckCircle2;
    statusColor = "text-emerald-400";
    statusBg = "bg-emerald-500/15";
  } else if (monthlyExpenses <= expectedSpending * 1.2) {
    status = "careful";
    statusLabel = "Be Careful";
    StatusIcon = AlertTriangle;
    statusColor = "text-amber-400";
    statusBg = "bg-amber-500/15";
  } else {
    status = "overspending";
    statusLabel = "Overspending";
    StatusIcon = AlertCircle;
    statusColor = "text-red-400";
    statusBg = "bg-red-500/15";
  }

  const amountStyle = {
    opacity: animating ? 0 : 1,
    transform: animating ? "scale(0.98)" : "scale(1)",
    transition: "opacity 180ms ease-in-out, transform 180ms ease-in-out",
  };

  return (
    <Card
      className="border-0 text-white overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0f4c2e 0%, #1a3a28 50%, #162b20 100%)" }}
      data-testid="card-budget-summary"
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white/60">Today's Budget</p>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusBg}`}>
            <StatusIcon className={`w-3 h-3 ${statusColor}`} />
            <span className={`text-[11px] font-semibold ${statusColor}`}>{statusLabel}</span>
          </div>
        </div>

        <div>
          <p className="text-[11px] text-white/40 mb-1">Budget Aman Hari Ini</p>
          <p
            className="text-3xl sm:text-4xl font-bold font-mono tracking-tight"
            style={amountStyle}
            data-testid="text-daily-budget"
          >
            {hidden ? MASKED_LONG : formatCurrency(Math.round(dailyBudget))}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/8 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400/70" />
              <span className="text-[11px] text-white/50">Pemasukan Bulan Ini</span>
            </div>
            <p
              className="text-sm font-mono font-semibold"
              style={amountStyle}
              data-testid="text-monthly-income"
            >
              {hidden ? MASKED_SHORT : formatCurrency(monthlyIncome)}
            </p>
          </div>
          <div className="rounded-xl bg-white/8 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-red-400/70" />
              <span className="text-[11px] text-white/50">Pengeluaran Bulan Ini</span>
            </div>
            <p
              className="text-sm font-mono font-semibold"
              style={amountStyle}
              data-testid="text-monthly-expenses"
            >
              {hidden ? MASKED_SHORT : formatCurrency(monthlyExpenses)}
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">Sisa Budget Bulan Ini</span>
            <span
              className={`text-sm font-mono font-semibold ${overBudget ? "text-red-400" : "text-emerald-400/80"}`}
              style={amountStyle}
              data-testid="text-remaining-budget"
            >
              {hidden ? MASKED_SHORT : formatCurrency(remainingBudget)}
            </span>
          </div>
          <div className="space-y-1">
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${
                  status === "overspending"
                    ? "bg-red-500/80"
                    : status === "careful"
                    ? "bg-amber-500/80"
                    : "bg-emerald-500/70"
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                data-testid="progress-budget"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-white/35">
              <span>{Math.round(usagePercent)}% terpakai</span>
              <span>Hari ke-{today} dari {daysInMonth}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
