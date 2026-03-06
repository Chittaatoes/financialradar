import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

interface WeeklyInsightData {
  totalExpense: number;
  lastWeekExpense: number;
  changePercent: number;
  topCategories: { category: string; amount: number }[];
  dailyBreakdown: { day: string; amount: number }[];
}

export default function WeeklyInsight() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery<WeeklyInsightData>({
    queryKey: ["/api/weekly-insight"],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <div className="grid sm:grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const changePercent = data?.changePercent ?? 0;
  const isUp = changePercent > 0;
  const isDown = changePercent < 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-serif font-bold" data-testid="text-insight-title">{t.weeklyInsight.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.weeklyInsight.subtitle}</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card className="hover-elevate transition-all duration-200">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{t.weeklyInsight.thisWeek}</span>
              <div className="flex items-center gap-1">
                {isUp && <TrendingUp className="w-4 h-4 text-red-500 dark:text-red-400" />}
                {isDown && <TrendingDown className="w-4 h-4 text-green-600 dark:text-green-400" />}
                {!isUp && !isDown && <Minus className="w-4 h-4 text-muted-foreground" />}
                <span className={`text-sm font-medium ${
                  isUp ? "text-red-500 dark:text-red-400" :
                  isDown ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                }`}>
                  {changePercent > 0 ? "+" : ""}{Math.round(changePercent)}%
                </span>
              </div>
            </div>
            <p className="text-2xl font-mono font-bold" data-testid="text-weekly-expense">
              {formatCurrency(data?.totalExpense ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t.weeklyInsight.lastWeek}: {formatCurrency(data?.lastWeekExpense ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all duration-200">
          <CardContent className="p-5 space-y-3">
            <span className="text-sm text-muted-foreground">{t.weeklyInsight.topCategories}</span>
            {data?.topCategories && data.topCategories.length > 0 ? (
              <div className="space-y-2">
                {data.topCategories.slice(0, 4).map((cat, i) => (
                  <div key={cat.category} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm truncate">{(t.categories as Record<string, string>)[cat.category] || cat.category}</span>
                    </div>
                    <span className="text-sm font-mono font-medium shrink-0">{formatCurrency(cat.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t.weeklyInsight.noSpending}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">{t.weeklyInsight.dailyBreakdown}</h3>
          {(data?.dailyBreakdown && data.dailyBreakdown.length > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickFormatter={(v) => formatCurrency(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), t.weeklyInsight.spending]}
                />
                <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              {t.weeklyInsight.noData}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
