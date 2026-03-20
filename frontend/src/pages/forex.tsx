import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, AlertTriangle, ShieldAlert,
  Target, BarChart3, Clock, Trophy, RefreshCw,
  ChevronDown, ChevronUp, Settings, Plus, Zap,
  CheckCircle2, XCircle, ArrowUpRight, ArrowDownLeft, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { ForexUploadSheet } from "@/components/forex-upload-sheet";
import { RiskCalculatorCard } from "@/components/risk-calculator-card";
import { AIForexCopilot } from "@/components/ai-forex-copilot";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ForexStats {
  today: { profit: number; loss: number; net: number; count: number };
  allTime: { profit: number; loss: number; net: number; count: number; winRate: number };
  lastLossTradeAt: string | null;
  lastTradeAt: string | null;
}

interface TradingRules {
  maxLossPercent: string;
  targetProfitPercent: string;
  maxTradesPerDay: number;
  revengeWindowMinutes: number;
}

interface PsychAlert {
  type: string;
  message: string;
  severity: "warning" | "danger" | "info";
}

interface PsychResult {
  alerts: PsychAlert[];
  todayStats: { count: number; loss: number; profit: number };
}

interface ForexInsights {
  bestPair: string | null;
  worstPair: string | null;
  bySymbol: Array<{ symbol: string; profit: number; loss: number; net: number; wins: number; total: number; winRate: number }>;
  byHour: Array<{ hour: number; profit: number; count: number }>;
}

interface ForexTrade {
  id: number;
  symbol: string;
  type: string;
  lot: string;
  openPrice: string;
  closePrice: string;
  profit: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const USD_IDR_RATE = 15_500;

function fmtProfit(n: number, currency: "USD" | "IDR"): string {
  const sign = n >= 0 ? "+" : "";
  if (currency === "USD") return `${sign}${n.toFixed(2)}`;
  const v = n * USD_IDR_RATE;
  if (Math.abs(v) >= 1_000_000) return `${sign}Rp ${(v / 1_000_000).toFixed(1)}jt`;
  if (Math.abs(v) >= 1_000)     return `${sign}Rp ${(v / 1_000).toFixed(0)}rb`;
  return `${sign}Rp ${Math.round(v)}`;
}

function ProfitBadge({ profit, currency }: { profit: number; currency: "USD" | "IDR" }) {
  const pos = profit >= 0;
  return (
    <span className={cn("flex items-center gap-0.5 font-semibold tabular-nums text-sm",
      pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
      {pos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
      {fmtProfit(profit, currency)}
    </span>
  );
}

function SeverityIcon({ s }: { s: "warning" | "danger" | "info" }) {
  if (s === "danger")  return <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />;
  if (s === "warning") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  return <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />;
}

function SeverityBg(s: "warning" | "danger" | "info") {
  if (s === "danger")  return "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800";
  if (s === "warning") return "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800";
  return "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, positive, neutral }: {
  label: string; value: string; sub?: string; positive?: boolean; neutral?: boolean;
}) {
  const color = neutral ? "text-foreground" : positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return (
    <Card className="flex-1 min-w-[130px]">
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground mb-1 truncate">{label}</p>
        <p className={cn("text-base font-bold tabular-nums leading-tight", color)}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RulesEditor({ rules, onSave }: { rules: TradingRules; onSave: (r: Partial<TradingRules>) => void }) {
  const [draft, setDraft] = useState({ ...rules });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { key: "maxLossPercent", label: "Max Loss / Hari (%)", type: "number", step: "0.1" },
          { key: "targetProfitPercent", label: "Target Profit / Hari (%)", type: "number", step: "0.1" },
          { key: "maxTradesPerDay", label: "Max Trade / Hari", type: "number", step: "1" },
          { key: "revengeWindowMinutes", label: "Jeda Revenge (menit)", type: "number", step: "1" },
        ].map(({ key, label, type, step }) => (
          <div key={key}>
            <label className="text-xs text-muted-foreground block mb-1">{label}</label>
            <input
              type={type}
              step={step}
              value={(draft as any)[key]}
              onChange={e => setDraft(d => ({ ...d, [key]: key.includes("Per") || key === "maxLossPercent" || key === "targetProfitPercent" ? e.target.value : Number(e.target.value) }))}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ))}
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Menyimpan..." : "Simpan Aturan"}
      </Button>
    </div>
  );
}

function TradeRow({
  t, currency, onDelete, deleting,
}: {
  t: ForexTrade;
  currency: "USD" | "IDR";
  onDelete: (id: number) => void;
  deleting: boolean;
}) {
  const profit = Number(t.profit);
  const isWin  = profit >= 0;
  const date   = t.createdAt
    ? new Date(t.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "-";

  return (
    <div className="group flex items-center justify-between py-2 border-b border-border/50 last:border-0 gap-2">
      {/* Left — color bar + info */}
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn("w-1.5 h-8 rounded-full shrink-0", isWin ? "bg-emerald-500" : "bg-red-400")} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm">{t.symbol}</span>
            <Badge variant="outline" className={cn("text-[9px] px-1 py-0 uppercase",
              t.type === "buy" ? "border-emerald-500 text-emerald-600" : "border-red-400 text-red-500")}>
              {t.type}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{t.lot} lot</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{date}</p>
        </div>
      </div>

      {/* Right — profit + delete */}
      <div className="flex items-center gap-2 shrink-0">
        <ProfitBadge profit={profit} currency={currency} />

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              disabled={deleting}
              className={cn(
                "p-1 rounded-md text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors",
                "opacity-0 group-hover:opacity-100 focus:opacity-100",
                deleting && "opacity-50 cursor-not-allowed",
              )}
              title="Hapus trade"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus trade ini?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-semibold">{t.symbol} {t.type.toUpperCase()}</span>
                {" "}({t.lot} lot, {fmtProfit(profit, "USD")}) akan dihapus permanen dan tidak dapat dibatalkan.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(t.id)}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Ya, Hapus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function WinRateBar({ wins, total }: { wins: number; total: number }) {
  const pct = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-10 text-right">{pct.toFixed(0)}%</span>
    </div>
  );
}

function HourChart({ byHour, currency }: { byHour: ForexInsights["byHour"]; currency: "USD" | "IDR" }) {
  if (byHour.length === 0) return <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>;
  const maxAbs = Math.max(...byHour.map(h => Math.abs(h.profit)), 1);
  return (
    <div className="flex items-end gap-1 h-20">
      {byHour.map(h => {
        const pct = Math.abs(h.profit) / maxAbs;
        const pos = h.profit >= 0;
        return (
          <div key={h.hour} className="flex flex-col items-center flex-1 gap-0.5" title={`${h.hour}:00 — ${fmtProfit(h.profit, currency)}`}>
            <div className="flex-1 flex items-end w-full">
              <div
                className={cn("w-full rounded-t-sm min-h-[2px]", pos ? "bg-emerald-500" : "bg-red-400")}
                style={{ height: `${Math.max(pct * 100, 4)}%` }}
              />
            </div>
            <span className="text-[8px] text-muted-foreground">{h.hour}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ForexPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [rulesOpen,  setRulesOpen]    = useState(false);
  const [showAll,    setShowAll]      = useState(false);
  const [currency,   setCurrency]     = useState<"USD" | "IDR">("USD");

  const { data: stats, isLoading: statsLoading } = useQuery<ForexStats>({
    queryKey: ["/api/forex/stats"],
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<TradingRules>({
    queryKey: ["/api/forex/rules"],
  });

  const { data: psych, isLoading: psychLoading } = useQuery<PsychResult>({
    queryKey: ["/api/forex/psychology"],
    queryFn: () => apiRequest("POST", "/api/forex/psychology", {}).then(r => r.json()),
    refetchInterval: 60_000,
  });

  const { data: trades = [], isLoading: tradesLoading } = useQuery<ForexTrade[]>({
    queryKey: ["/api/forex/trades"],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<ForexInsights>({
    queryKey: ["/api/forex/insights"],
    select: (d) => ({
      bestPair:  d?.bestPair  ?? null,
      worstPair: d?.worstPair ?? null,
      bySymbol:  Array.isArray(d?.bySymbol) ? d.bySymbol : [],
      byHour:    Array.isArray(d?.byHour)   ? d.byHour   : [],
    }),
  });

  const saveRules = useMutation({
    mutationFn: (body: Partial<TradingRules>) => apiRequest("PUT", "/api/forex/rules", body).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/forex/rules"] }); qc.invalidateQueries({ queryKey: ["/api/forex/psychology"] }); },
  });

  const deleteTrade = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/forex/trades/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/forex/trades"] });
      qc.invalidateQueries({ queryKey: ["/api/forex/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/forex/insights"] });
      qc.invalidateQueries({ queryKey: ["/api/forex/psychology"] });
    },
  });

  const displayedTrades = showAll ? trades : trades.slice(0, 10);

  const hasDanger  = psych?.alerts.some(a => a.severity === "danger");

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-violet-500" />
            Forex
          </h1>
          <p className="text-xs text-muted-foreground">Trading Journal + Discipline Coach</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { qc.invalidateQueries({ queryKey: ["/api/forex/stats"] }); qc.invalidateQueries({ queryKey: ["/api/forex/psychology"] }); }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-[#19432c] hover:bg-violet-700">
            <Plus className="w-3.5 h-3.5 mr-1" /> Upload Trade
          </Button>
        </div>
      </div>

      {/* Psychology Alerts */}
      {!psychLoading && psych && psych.alerts.length > 0 && (
        <div className="space-y-2">
          {psych.alerts.map((a, i) => (
            <div key={i} className={cn("flex gap-2 p-3 rounded-lg border text-sm", SeverityBg(a.severity))}>
              <SeverityIcon s={a.severity} />
              <p className="leading-snug">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Today Summary */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Hari Ini</h2>
        {statsLoading ? (
          <div className="flex gap-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 flex-1 rounded-xl" />)}
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <StatCard label="Net Profit" value={fmtProfit(stats?.today.net ?? 0, currency)} positive={(stats?.today.net ?? 0) >= 0} />
            <StatCard label="Total Profit" value={fmtProfit(stats?.today.profit ?? 0, currency)} positive />
            <StatCard label="Total Loss"   value={fmtProfit(stats?.today.loss ?? 0, currency)} positive={false} />
            <StatCard label="Trades" value={String(stats?.today.count ?? 0)} neutral />
          </div>
        )}
      </div>

      {/* All-Time Stats */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Statistik Keseluruhan
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {statsLoading ? <Skeleton className="h-16" /> : (
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Net</p>
                <p className={cn("text-sm font-bold tabular-nums", (stats?.allTime.net ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                  {fmtProfit(stats?.allTime.net ?? 0, currency)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Win Rate</p>
                <p className="text-sm font-bold tabular-nums text-blue-600 dark:text-blue-400">
                  {(stats?.allTime.winRate ?? 0).toFixed(1)}%
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Trade</p>
                <p className="text-sm font-bold tabular-nums">{stats?.allTime.count ?? 0}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discipline Rules */}
      <Card>
        <button
          className="w-full flex items-center justify-between py-3 px-4"
          onClick={() => setRulesOpen(o => !o)}
        >
          <span className="text-sm font-semibold flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" /> Aturan Disiplin
          </span>
          {rulesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {rulesOpen && (
          <CardContent className="px-4 pb-4">
            {rulesLoading ? <Skeleton className="h-32" /> : rules ? (
              <RulesEditor rules={rules} onSave={v => saveRules.mutate(v)} />
            ) : null}
          </CardContent>
        )}
      </Card>

      {/* Risk Calculator */}
      <RiskCalculatorCard />

      {/* AI Trading Copilot */}
      <AIForexCopilot />

      {/* Insights */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-violet-500" /> Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {insightsLoading ? <Skeleton className="h-24" /> : insights ? (
            <>
              {/* Best / Worst pair */}
              {(insights.bestPair || insights.worstPair) && (
                <div className="flex gap-3">
                  {insights.bestPair && (
                    <div className="flex-1 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 border border-emerald-100 dark:border-emerald-900">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Best Pair</p>
                        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{insights.bestPair}</p>
                      </div>
                    </div>
                  )}
                  {insights.worstPair && (
                    <div className="flex-1 flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 px-3 py-2 border border-red-100 dark:border-red-900">
                      <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Worst Pair</p>
                        <p className="text-sm font-bold text-red-600 dark:text-red-300">{insights.worstPair}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* By Symbol */}
              {insights.bySymbol.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Win Rate per Pair</p>
                  <div className="space-y-2">
                    {insights.bySymbol.slice(0, 6).map(s => (
                      <div key={s.symbol} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium">{s.symbol}</span>
                          <span className={s.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
                            {fmtProfit(s.net, currency)}
                          </span>
                        </div>
                        <WinRateBar wins={s.wins} total={s.total} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* By Hour */}
              {insights.byHour.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Profit per Jam
                  </p>
                  <HourChart byHour={insights.byHour} currency={currency} />
                </div>
              )}

              {insights.bySymbol.length === 0 && insights.byHour.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Upload trade pertama untuk melihat insights</p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Trade History */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" /> Riwayat Trade
            </CardTitle>
            <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium">
              <button
                onClick={() => setCurrency("USD")}
                className={cn("px-2.5 py-1 transition-colors",
                  currency === "USD" ? "text-white bg-[#19432c]" : "hover:bg-muted text-muted-foreground")}
              >
                USD
              </button>
              <button
                onClick={() => setCurrency("IDR")}
                className={cn("px-2.5 py-1 transition-colors",
                  currency === "IDR" ? "text-white bg-[#19432c]" : "hover:bg-muted text-muted-foreground")}
              >
                IDR
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          {tradesLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <TrendingUp className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Belum ada trade. Upload screenshot MT4/MT5 untuk mulai.</p>
              <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Upload Screenshot
              </Button>
            </div>
          ) : (
            <>
              {displayedTrades.map(t => (
                <TradeRow
                  key={t.id}
                  t={t}
                  currency={currency}
                  onDelete={(id) => deleteTrade.mutate(id)}
                  deleting={deleteTrade.isPending && deleteTrade.variables === t.id}
                />
              ))}
              {trades.length > 10 && (
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={() => setShowAll(o => !o)}>
                  {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${trades.length} trade)`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Floating Upload Sheet */}
      <ForexUploadSheet
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          qc.invalidateQueries({ queryKey: ["/api/forex/trades"] });
          qc.invalidateQueries({ queryKey: ["/api/forex/stats"] });
          qc.invalidateQueries({ queryKey: ["/api/forex/insights"] });
          qc.invalidateQueries({ queryKey: ["/api/forex/psychology"] });
        }}
      />
    </div>
  );
}
