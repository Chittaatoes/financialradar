import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useLanguage } from "@/lib/i18n";

interface NetWorthData {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  history: { month: string; netWorth: number; assets: number; liabilities: number }[];
}

export default function NetWorth() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery<NetWorthData>({
    queryKey: ["/api/net-worth"],
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const netWorth = data?.netWorth ?? 0;
  const isPositive = netWorth > 0;
  const isNegative = netWorth < 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-serif font-bold" data-testid="text-networth-title">{t.netWorth.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.netWorth.subtitle}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="hover-elevate transition-all duration-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t.netWorth.totalAssets}</p>
            <p className="text-lg font-mono font-bold mt-1 text-green-600 dark:text-green-400" data-testid="text-nw-assets">
              {formatCurrency(data?.totalAssets ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="hover-elevate transition-all duration-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t.netWorth.totalLiabilities}</p>
            <p className="text-lg font-mono font-bold mt-1 text-red-500 dark:text-red-400" data-testid="text-nw-liabilities">
              {formatCurrency(data?.totalLiabilities ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="hover-elevate transition-all duration-200">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">{t.netWorth.netWorthLabel}</p>
            <div className="flex items-center justify-center gap-2 mt-1">
              {isPositive && <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />}
              {isNegative && <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />}
              {!isPositive && !isNegative && <Minus className="w-4 h-4 text-muted-foreground" />}
              <p className={`text-lg font-mono font-bold ${
                isPositive ? "text-green-600 dark:text-green-400" :
                isNegative ? "text-red-500 dark:text-red-400" : "text-foreground"
              }`} data-testid="text-nw-total">
                {formatCurrency(netWorth)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold mb-4">{t.netWorth.growthTitle}</h3>
          {(data?.history && data.history.length > 1) ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.history}>
                <defs>
                  <linearGradient id="colorNw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(145 48% 32%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(145 48% 32%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickFormatter={(v: number) => {
                    const sign = v < 0 ? "-" : "";
                    const abs = Math.abs(v);
                    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
                    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(0)}jt`;
                    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
                    return String(v);
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number) => [formatCurrency(value), t.netWorth.netWorthLabel]}
                />
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  stroke="hsl(145 48% 32%)"
                  fill="url(#colorNw)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
              {t.netWorth.noChart}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
