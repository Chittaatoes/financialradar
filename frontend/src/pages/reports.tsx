import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, ChevronRight, Calendar, ChevronDown } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { formatCurrency } from "@/lib/constants";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { Transaction } from "@shared/schema";

const DONUT_COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#3b82f6",
  "#ec4899", "#14b8a6", "#8b5cf6", "#f97316", "#06b6d4",
  "#84cc16", "#e11d48",
];

function getMonthRange(): [Date, Date] {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return [from, to];
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

export default function ReportsPage() {
  const { t, language } = useLanguage();
  const pt = (t as any).profile || {};
  const nt = t.nav || {};
  const ct = t.categories || {};

  const [defaultFrom, defaultTo] = getMonthRange();
  const [mode, setMode] = useState<PeriodMode>("monthly");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [filterOpen, setFilterOpen] = useState(false);

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

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
        amount,
        percentage: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return { items: sorted, total };
  }, [transactions, fromDate, toDate]);

  const handleMonthly = () => {
    const [f, t2] = getMonthRange();
    setFromDate(f);
    setToDate(t2);
    setMode("monthly");
    setFilterOpen(false);
  };

  const reports = [
    {
      key: "score",
      icon: BarChart3,
      title: nt.score || "Skor Keuangan",
      desc: pt.financeScoreDesc || "Lihat kesehatan finansial Anda secara keseluruhan.",
      path: "/score",
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10 dark:bg-violet-500/15",
    },
    {
      key: "networth",
      icon: TrendingUp,
      title: nt.netWorth || "Kekayaan Bersih",
      desc: pt.netWorthDesc || "Total aset dikurangi kewajiban.",
      path: "/networth",
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10 dark:bg-sky-500/15",
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {(t as any).mainMenu?.reports || "Laporan"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {language === "id"
            ? "Lihat ringkasan dan analisis keuangan Anda."
            : "View your financial summary and analysis."}
        </p>
      </div>

      <div className="space-y-3">
        {reports.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.path}>
              <Card className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${item.color}`} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="relative">
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-card shadow-sm hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span>
            {formatDateShort(fromDate, language)} - {formatDateShort(toDate, language)}
          </span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${filterOpen ? "rotate-180" : ""}`} />
        </button>

        {filterOpen && (
          <Card className="absolute top-12 left-0 z-20 rounded-2xl shadow-lg border w-72">
            <CardContent className="p-4 space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={handleMonthly}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "monthly"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {language === "id" ? "Bulanan" : "Monthly"}
                </button>
                <button
                  onClick={() => setMode("custom")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    mode === "custom"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
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

      {filterOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
      )}

      {isLoading ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <Skeleton className="h-[250px]" />
          </CardContent>
        </Card>
      ) : categoryData.items.length > 0 ? (
        <>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-4">
                {language === "id" ? "Rincian Pengeluaran" : "Spending Breakdown"}
              </h3>
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categoryData.items}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      dataKey="amount"
                      nameKey="name"
                      animationBegin={0}
                      animationDuration={600}
                      label={({ percentage, cx, cy, midAngle, outerRadius: or }) => {
                        if (percentage < 5) return null;
                        const RADIAN = Math.PI / 180;
                        const radius = or + 18;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" className="text-[11px] fill-foreground font-medium">
                            {percentage}%
                          </text>
                        );
                      }}
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
                        (ct as any)[name] || name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-1">
                  Total: {formatCurrency(categoryData.total)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3">
                {language === "id" ? "Kategori Teratas" : "Top Categories"}
              </h3>
              <div className="space-y-1">
                {categoryData.items.map((item, i) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${DONUT_COLORS[i % DONUT_COLORS.length]}20` }}
                    >
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(ct as any)[item.name] || item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {language === "id"
                ? "Tidak ada pengeluaran dalam periode ini."
                : "No expenses in this period."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
