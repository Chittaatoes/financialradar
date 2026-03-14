import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart3, Calendar, ChevronDown, ChevronRight, Lightbulb, TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { formatCurrency } from "@/lib/constants";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { Transaction } from "@shared/schema";

// ─── Palette ─────────────────────────────────────────────────────────────────
const DONUT_COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4",
  "#84cc16", "#e11d48",
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getMonthRange(): [Date, Date] {
  const now = new Date();
  return [
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(now.getFullYear(), now.getMonth() + 1, 0),
  ];
}
function formatDateShort(d: Date, lang: string): string {
  return d.toLocaleDateString(lang === "id" ? "id-ID" : "en-US", { day: "numeric", month: "short" });
}
function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDateInput(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

type PeriodMode = "monthly" | "custom";

interface SpendingInsightData {
  period: string;
  totalExpense: number;
  prevTotalExpense: number;
  totalIncome: number;
  changePercent: number;
  topCategories: { category: string; amount: number }[];
  breakdown: { label: string; amount: number }[];
}

// ─── Custom centre label for donut ────────────────────────────────────────────
function DonutCentreLabel({ cx, cy, total }: { cx: number; cy: number; total: number }) {
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
      <tspan x={cx} dy="-0.4em" className="text-[11px]" fill="hsl(var(--muted-foreground))" fontSize="11">
        Total
      </tspan>
      <tspan x={cx} dy="1.4em" fill="hsl(var(--foreground))" fontWeight="700" fontSize="14">
        {total >= 1_000_000
          ? `Rp ${(total / 1_000_000).toFixed(1)}jt`
          : `Rp ${(total / 1_000).toFixed(0)}K`}
      </tspan>
    </text>
  );
}

export default function ReportsPage() {
  const { language } = useLanguage();
  const ct = {} as Record<string, string>;

  const [defaultFrom, defaultTo] = getMonthRange();
  const [mode, setMode] = useState<PeriodMode>("monthly");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: insight } = useQuery<SpendingInsightData>({
    queryKey: ["/api/spending-insight?period=monthly"],
  });

  // ─── Derived spending data from transactions ──────────────────────────────
  const categoryData = useMemo(() => {
    const fromStr = formatDateInput(fromDate);
    const toStr = formatDateInput(toDate);
    const expenses = transactions.filter((tx) => {
      if (tx.type !== "expense") return false;
      const txDate = typeof tx.date === "string" ? tx.date.slice(0, 10) : "";
      return txDate >= fromStr && txDate <= toStr;
    });
    const grouped: Record<string, number> = {};
    for (const tx of expenses) {
      const cat = tx.category || "Other";
      grouped[cat] = (grouped[cat] || 0) + Number(tx.amount);
    }
    const total = Object.values(grouped).reduce((s, v) => s + v, 0);
    const sorted = Object.entries(grouped)
      .map(([name, amount]) => ({
        name,
        displayName: ct[name] || name,
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
    return { items: sorted, total };
  }, [transactions, fromDate, toDate]);

  // ─── Trend chart: thin breakdown from spending-insight ────────────────────
  const trendData = useMemo(() => {
    const raw = insight?.breakdown ?? [];
    if (raw.length === 0) return [];
    // Show every ~5th label on mobile to avoid crowding
    return raw.map((point, i) => ({
      label: i % 5 === 0 ? point.label : "",
      fullLabel: point.label,
      amount: point.amount,
    }));
  }, [insight]);

  // ─── Auto-generated insights ──────────────────────────────────────────────
  const insightLines = useMemo(() => {
    const items = categoryData.items;
    if (items.length === 0) return [];
    const lines: string[] = [];
    const top = items[0];
    if (language === "id") {
      lines.push(`${top.percentage}% pengeluaran kamu bulan ini ada di ${top.displayName}.`);
      if (items[1]) lines.push(`${items[1].displayName} adalah pengeluaran terbesar kedua kamu.`);
      if (items.length >= 3) {
        const top3pct = items.slice(0, 3).reduce((s, it) => s + it.percentage, 0);
        lines.push(`3 kategori teratas menyumbang ${top3pct}% dari total pengeluaran.`);
      }
    } else {
      lines.push(`${top.percentage}% of your spending this period went to ${top.displayName}.`);
      if (items[1]) lines.push(`${items[1].displayName} is your second largest expense.`);
      if (items.length >= 3) {
        const top3pct = items.slice(0, 3).reduce((s, it) => s + it.percentage, 0);
        lines.push(`Your top 3 categories account for ${top3pct}% of total spending.`);
      }
    }
    return lines;
  }, [categoryData, language]);

  const handleMonthly = () => {
    const [f, t2] = getMonthRange();
    setFromDate(f);
    setToDate(t2);
    setMode("monthly");
    setFilterOpen(false);
  };

  const isLoading = txLoading;
  const hasData = categoryData.items.length > 0;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">

      {/* ── 1. Title ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {language === "id" ? "Laporan" : "Reports"}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {language === "id"
            ? "Analisis pengeluaran dan kesehatan finansial kamu."
            : "Spending analysis and financial health overview."}
        </p>
      </div>

      {/* ── 2. Date Filter ──────────────────────────────────────────────── */}
      <div className="relative">
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border bg-card shadow-sm hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>
            {formatDateShort(fromDate, language)} – {formatDateShort(toDate, language)}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${filterOpen ? "rotate-180" : ""}`} />
        </button>

        {filterOpen && (
          <Card className="absolute top-11 left-0 z-20 rounded-2xl shadow-lg border w-72">
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleMonthly}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {language === "id" ? "Bulanan" : "Monthly"}
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "custom" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Custom
                </button>
              </div>
              {mode === "custom" && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {language === "id" ? "Dari" : "From"}
                    </label>
                    <input
                      type="date"
                      value={formatDateInput(fromDate)}
                      onChange={(e) => setFromDate(parseDateInput(e.target.value))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {language === "id" ? "Ke" : "To"}
                    </label>
                    <input
                      type="date"
                      value={formatDateInput(toDate)}
                      onChange={(e) => setToDate(parseDateInput(e.target.value))}
                      className="w-full mt-1 px-3 py-2 rounded-lg border bg-background text-sm"
                    />
                  </div>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                  >
                    {language === "id" ? "Terapkan" : "Apply"}
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {filterOpen && <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />}

      {/* ── 3. Spending Overview (Hero Donut) ───────────────────────────── */}
      {isLoading ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5"><Skeleton className="h-[260px]" /></CardContent>
        </Card>
      ) : hasData ? (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {language === "id" ? "Ringkasan Pengeluaran" : "Spending Overview"}
            </p>
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData.items}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={98}
                    paddingAngle={2}
                    dataKey="amount"
                    nameKey="name"
                    animationBegin={0}
                    animationDuration={600}
                    labelLine={false}
                  >
                    {categoryData.items.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      ct[name] || name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Total below chart */}
              <div className="text-center mt-1 pb-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  {language === "id" ? "Total Pengeluaran" : "Total Spending"}
                </p>
                <p className="text-2xl font-bold font-mono mt-0.5 text-foreground">
                  {formatCurrency(categoryData.total)}
                </p>
              </div>
            </div>

            {/* Colour legend — top 5 */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 justify-center">
              {categoryData.items.slice(0, 6).map((item, i) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    {item.displayName}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {language === "id"
                ? "Tidak ada pengeluaran dalam periode ini."
                : "No expenses found in this period."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── 4. Spending Trend (Line Chart) ──────────────────────────────── */}
      {trendData.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {language === "id" ? "Tren Pengeluaran" : "Spending Trend"}
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                    return String(v);
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  labelFormatter={(_: any, payload: any[]) => payload?.[0]?.payload?.fullLabel || ""}
                  formatter={(value: number) => [formatCurrency(value), language === "id" ? "Pengeluaran" : "Spending"]}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#10b981" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── 5. Top Categories ───────────────────────────────────────────── */}
      {hasData && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {language === "id" ? "Kategori Teratas" : "Top Categories"}
            </p>
            <div className="space-y-4">
              {categoryData.items.slice(0, 8).map((item, i) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      <span className="text-sm font-medium truncate">{item.displayName}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className="text-sm font-mono font-semibold">
                        {formatCurrency(item.amount)}
                      </span>
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 6. Insights ─────────────────────────────────────────────────── */}
      {insightLines.length > 0 && (
        <Card className="rounded-2xl shadow-sm border-0 bg-emerald-50 dark:bg-emerald-950/30">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                {language === "id" ? "Insight" : "Insights"}
              </p>
            </div>
            <ul className="space-y-2">
              {insightLines.map((line, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-snug">{line}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ── 7. Finance Score CTA ────────────────────────────────────────── */}
      <Link href="/score">
        <Card className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99] border-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5 text-violet-600 dark:text-violet-400" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  {language === "id" ? "Skor Kesehatan Finansial" : "Financial Health Score"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {language === "id"
                    ? "Lihat seberapa sehat kondisi keuangan kamu."
                    : "See how healthy your finances are overall."}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                  {language === "id" ? "Cek" : "Check"}
                </span>
                <ChevronRight className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
