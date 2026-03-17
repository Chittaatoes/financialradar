import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Wallet, Landmark, Smartphone, PiggyBank, BarChart2 } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceDot,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

// ─── API shapes ───────────────────────────────────────────────────────────────
interface NetWorthData {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  history: { month: string; netWorth: number; assets: number; liabilities: number }[];
}

interface DashboardData {
  totalAssets: number;
  totalCash: number;
  totalBank: number;
  totalEwallet: number;
  totalSaving: number;
  totalStock: number;
}

// ─── Y-axis compact formatter ─────────────────────────────────────────────────
function fmtAxis(v: number): string {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000)     return `${sign}${(abs / 1_000_000).toFixed(0)}jt`;
  if (abs >= 1_000)         return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return String(v);
}

export default function NetWorth() {
  const { t, language } = useLanguage();

  const { data, isLoading } = useQuery<NetWorthData>({
    queryKey: ["/api/net-worth"],
  });

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
        <Skeleton className="h-36" />
      </div>
    );
  }

  const netWorth = data?.netWorth ?? 0;
  const totalAssets = data?.totalAssets ?? 0;
  const totalLiabilities = data?.totalLiabilities ?? 0;
  const isPositive = netWorth > 0;
  const isNegative = netWorth < 0;

  // Month-over-month change from history
  const history = data?.history ?? [];
  const monthlyChange = history.length >= 2
    ? history[history.length - 1].netWorth - history[history.length - 2].netWorth
    : null;

  // Latest data point index for the reference dot
  const lastIdx = history.length > 0 ? history.length - 1 : -1;
  const lastPoint = lastIdx >= 0 ? history[lastIdx] : null;

  // Asset breakdown from /api/dashboard
  const assetBreakdown = [
    {
      label: language === "id" ? "Tunai" : "Cash",
      icon: Wallet,
      value: dashboard?.totalCash ?? 0,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: language === "id" ? "Bank" : "Bank",
      icon: Landmark,
      value: dashboard?.totalBank ?? 0,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: language === "id" ? "E-Wallet" : "E-Wallet",
      icon: Smartphone,
      value: dashboard?.totalEwallet ?? 0,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-500/10",
    },
    {
      label: language === "id" ? "Tabungan" : "Savings",
      icon: PiggyBank,
      value: dashboard?.totalSaving ?? 0,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: language === "id" ? "Saham" : "Stocks",
      icon: BarChart2,
      value: dashboard?.totalStock ?? 0,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-500/10",
    },
  ].filter((item) => item.value > 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-2xl mx-auto">

      {/* ── 1. Net Worth Hero ──────────────────────────────────────────── */}
      <Card
        className="rounded-2xl border-0 text-white overflow-hidden"
        style={{ background: "linear-gradient(135deg, #133825 0%, #0c2318 100%)" }}
        data-testid="card-networth-hero"
      >
        <CardContent className="p-6">
          <p className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-2">
            {t.netWorth.netWorthLabel}
          </p>

          <div className="flex items-baseline gap-3 flex-wrap">
            {isPositive && <TrendingUp className="w-6 h-6 text-emerald-400 shrink-0" />}
            {isNegative && <TrendingDown className="w-6 h-6 text-red-400 shrink-0" />}
            {!isPositive && !isNegative && <Minus className="w-6 h-6 text-white/50 shrink-0" />}
            <p
              className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${
                isPositive ? "text-emerald-300"
                : isNegative ? "text-red-400"
                : "text-white"
              }`}
              data-testid="text-nw-total"
            >
              {formatCurrency(netWorth)}
            </p>
          </div>

          {/* Month-over-month change */}
          {monthlyChange !== null && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
              {monthlyChange >= 0
                ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                : <TrendingDown className="w-3 h-3 text-red-400" />
              }
              <span className={`text-xs font-semibold ${monthlyChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {monthlyChange >= 0 ? "+" : ""}{formatCurrency(monthlyChange)}{" "}
                <span className="font-normal text-white/50">
                  {language === "id" ? "bulan ini" : "this month"}
                </span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Assets vs Liabilities ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-6 rounded-full bg-emerald-500" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t.netWorth.totalAssets}
              </p>
            </div>
            <p
              className="text-xl font-mono font-bold text-emerald-600 dark:text-emerald-400 leading-tight"
              data-testid="text-nw-assets"
            >
              {formatCurrency(totalAssets)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-6 rounded-full bg-red-500" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t.netWorth.totalLiabilities}
              </p>
            </div>
            <p
              className="text-xl font-mono font-bold text-red-600 dark:text-red-400 leading-tight"
              data-testid="text-nw-liabilities"
            >
              {formatCurrency(totalLiabilities)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Assets vs Liabilities visual bar */}
      {(totalAssets > 0 || totalLiabilities > 0) && (
        <div className="px-1">
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            {totalAssets > 0 && (
              <div
                className="bg-emerald-500 rounded-l-full transition-all duration-700"
                style={{ flex: totalAssets }}
              />
            )}
            {totalLiabilities > 0 && (
              <div
                className="bg-red-500 rounded-r-full transition-all duration-700"
                style={{ flex: totalLiabilities }}
              />
            )}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {language === "id" ? "Aset" : "Assets"}
            </span>
            <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">
              {language === "id" ? "Kewajiban" : "Liabilities"}
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Growth Over Time Chart ────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            {t.netWorth.growthTitle}
          </p>
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNwPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorNwNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                  tickFormatter={fmtAxis}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), t.netWorth.netWorthLabel]}
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke={netWorth >= 0 ? "#10b981" : "#ef4444"}
                  fill={netWorth >= 0 ? "url(#colorNwPos)" : "url(#colorNwNeg)"}
                  strokeWidth={2.5}
                  dot={false}
                />
                {/* Highlight the latest data point */}
                {lastPoint && (
                  <ReferenceDot
                    x={lastPoint.month}
                    y={lastPoint.netWorth}
                    r={5}
                    fill={netWorth >= 0 ? "#10b981" : "#ef4444"}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t.netWorth.noChart}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 4. Asset Breakdown ───────────────────────────────────────────── */}
      {assetBreakdown.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {language === "id" ? "Rincian Aset" : "Asset Breakdown"}
            </p>
            <div className="space-y-3">
              {assetBreakdown.map((item) => {
                const Icon = item.icon;
                const pct = totalAssets > 0 ? Math.round((item.value / totalAssets) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg ${item.bg} flex items-center justify-center`}>
                          <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-mono font-semibold">{formatCurrency(item.value)}</span>
                        <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: item.bg.includes("emerald")
                            ? "#10b981"
                            : item.bg.includes("blue")
                            ? "#3b82f6"
                            : item.bg.includes("violet")
                            ? "#8b5cf6"
                            : "#f59e0b",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
