import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Clock, Globe, Zap, Brain, BarChart3, Shield,
} from "lucide-react";

// ─── API types ────────────────────────────────────────────────────────────────
interface MacroEvent {
  event: string;
  country: string;
  date: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  impact: string;
  currency?: string;
}

interface IndicatorPoint {
  id: string;
  value: number | null;
  prevValue: number | null;
  date: string | null;
}

interface MacroIndicators {
  interestRate: IndicatorPoint | null;
  inflation: IndicatorPoint | null;
  moneySupply: IndicatorPoint | null;
  unemployment: IndicatorPoint | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function minutesUntil(dateStr: string): number {
  return (new Date(dateStr).getTime() - Date.now()) / 60_000;
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function detectEventType(name: string): "CPI" | "NFP" | "FOMC" | "GDP" | "UNEMPLOYMENT" | "OTHER" {
  const n = name.toUpperCase();
  if (n.includes("CPI") || n.includes("CONSUMER PRICE")) return "CPI";
  if (n.includes("NON FARM") || n.includes("NONFARM") || n.includes("NFP") || n.includes("PAYROLL")) return "NFP";
  if (n.includes("FOMC") || n.includes("FEDERAL FUND") || n.includes("INTEREST RATE") || n.includes("FED RATE")) return "FOMC";
  if (n.includes("GDP") || n.includes("GROSS DOMESTIC")) return "GDP";
  if (n.includes("UNEMPLOYMENT") || n.includes("JOBLESS")) return "UNEMPLOYMENT";
  return "OTHER";
}

type Bias = "Bullish" | "Bearish" | "Neutral" | "Volatile";

interface AssetBias { usd: Bias; gold: Bias; btc: Bias }

interface Scenario {
  label: string;
  description: string;
  usd: "↑" | "↓" | "→";
  gold: "↑" | "↓" | "→";
  btc: "↑" | "↓" | "→";
}

function buildScenarios(eventType: ReturnType<typeof detectEventType>): [Scenario, Scenario] {
  switch (eventType) {
    case "CPI":
      return [
        { label: "Scenario A", description: "CPI higher than forecast (hot inflation)", usd: "↑", gold: "↑", btc: "↓" },
        { label: "Scenario B", description: "CPI lower than forecast (cooling inflation)", usd: "↓", gold: "↓", btc: "↑" },
      ];
    case "NFP":
      return [
        { label: "Scenario A", description: "NFP higher than forecast (strong jobs)", usd: "↑", gold: "↓", btc: "↓" },
        { label: "Scenario B", description: "NFP lower than forecast (weak jobs)", usd: "↓", gold: "↑", btc: "→" },
      ];
    case "FOMC":
      return [
        { label: "Scenario A", description: "Rate hike or hawkish signal", usd: "↑", gold: "↓", btc: "↓" },
        { label: "Scenario B", description: "Rate cut or dovish signal", usd: "↓", gold: "↑", btc: "↑" },
      ];
    case "GDP":
      return [
        { label: "Scenario A", description: "GDP beats expectations (growth)", usd: "↑", gold: "↓", btc: "↑" },
        { label: "Scenario B", description: "GDP misses expectations (contraction)", usd: "↓", gold: "↑", btc: "↓" },
      ];
    case "UNEMPLOYMENT":
      return [
        { label: "Scenario A", description: "Unemployment higher than expected", usd: "↓", gold: "↑", btc: "↓" },
        { label: "Scenario B", description: "Unemployment lower than expected", usd: "↑", gold: "↓", btc: "↑" },
      ];
    default:
      return [
        { label: "Scenario A", description: "Better than expected result", usd: "↑", gold: "→", btc: "→" },
        { label: "Scenario B", description: "Worse than expected result", usd: "↓", gold: "↑", btc: "↓" },
      ];
  }
}

function buildInsight(ind: MacroIndicators): string {
  const rate = ind.interestRate?.value ?? null;
  const cpi  = ind.inflation?.value ?? null;
  const m2   = ind.moneySupply?.value ?? null;
  const m2p  = ind.moneySupply?.prevValue ?? null;
  const unem = ind.unemployment?.value ?? null;
  const lines: string[] = [];

  if (rate !== null) {
    if (rate >= 5) lines.push(`Interest rates are elevated at ${rate}%, signaling a hawkish Fed stance.`);
    else if (rate >= 3) lines.push(`Interest rates are moderate at ${rate}%, reflecting a cautious monetary policy.`);
    else lines.push(`Interest rates remain low at ${rate}%, supporting risk assets.`);
  }
  if (cpi !== null) {
    if (cpi > 300) {
      const annualised = ((cpi / 280) - 1) * 100;
      if (annualised > 4) lines.push(`Inflation (CPI index ${cpi.toFixed(1)}) remains elevated, keeping pressure on the Fed.`);
      else lines.push(`Inflation (CPI index ${cpi.toFixed(1)}) appears to be cooling gradually.`);
    }
  }
  if (m2 !== null && m2p !== null) {
    const m2Delta = m2 - m2p;
    if (m2Delta < 0) lines.push(`Money supply is contracting (M2 down by $${Math.abs(m2Delta).toFixed(0)}B), a bearish signal for risk assets.`);
    else lines.push(`Money supply is expanding (M2 up by $${m2Delta.toFixed(0)}B), broadly supportive of markets.`);
  }
  if (unem !== null) {
    if (unem > 4.5) lines.push(`Unemployment is rising at ${unem}%, signaling economic softness.`);
    else lines.push(`Unemployment remains contained at ${unem}%, reflecting labor market resilience.`);
  }
  if (lines.length === 0) return "Loading macro data…";

  const envTag = (rate ?? 0) >= 4
    ? "This overall macro environment is hawkish, which typically supports the US dollar."
    : "This macro environment may support risk assets and emerging market currencies.";
  return lines.join(" ") + " " + envTag;
}

function buildBias(ind: MacroIndicators): AssetBias {
  const rate = ind.interestRate?.value ?? 0;
  const m2   = ind.moneySupply?.value ?? 0;
  const m2p  = ind.moneySupply?.prevValue ?? 0;
  const unem = ind.unemployment?.value ?? 0;
  const uemp = ind.unemployment?.prevValue ?? 0;

  const m2Shrinking    = m2 < m2p;
  const unemRising     = unem > uemp;
  const rateHigh       = rate >= 4.5;
  const rateCut        = rate < (ind.interestRate?.prevValue ?? rate);

  const usd: Bias = rateHigh && !rateCut ? "Bullish" : unemRising ? "Bearish" : "Neutral";
  const gold: Bias = !rateHigh ? "Bullish" : m2Shrinking ? "Bearish" : "Neutral";
  const btc: Bias = m2Shrinking ? "Bearish" : rateHigh ? "Volatile" : "Bullish";

  return { usd, gold, btc };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const BIAS_STYLE: Record<Bias, string> = {
  Bullish:  "text-emerald-600 dark:text-emerald-400",
  Bearish:  "text-red-500 dark:text-red-400",
  Neutral:  "text-muted-foreground",
  Volatile: "text-amber-500 dark:text-amber-400",
};

const BIAS_ICON: Record<Bias, typeof TrendingUp> = {
  Bullish:  TrendingUp,
  Bearish:  TrendingDown,
  Neutral:  Minus,
  Volatile: Zap,
};

function BiasRow({ label, emoji, bias }: { label: string; emoji: string; bias: Bias }) {
  const Icon = BIAS_ICON[bias];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className={`flex items-center gap-1.5 font-semibold text-sm ${BIAS_STYLE[bias]}`}>
        <Icon className="w-3.5 h-3.5" />
        {bias}
      </div>
    </div>
  );
}

const ARROW_COLOR = { "↑": "text-emerald-500", "↓": "text-red-500", "→": "text-muted-foreground" };

function ScenarioCard({ s }: { s: Scenario }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</p>
        <p className="text-sm font-medium mt-0.5">{s.description}</p>
      </div>
      <div className="flex gap-4">
        {[
          { label: "USD", arrow: s.usd, emoji: "💵" },
          { label: "Gold", arrow: s.gold, emoji: "🥇" },
          { label: "BTC", arrow: s.btc, emoji: "₿" },
        ].map(({ label, arrow, emoji }) => (
          <div key={label} className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{emoji} {label}</span>
            <span className={`text-lg font-bold ${ARROW_COLOR[arrow as keyof typeof ARROW_COLOR]}`}>{arrow}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function RiskMeter({ level }: { level: RiskLevel }) {
  const config = {
    LOW:    { bars: 1, color: "bg-emerald-500", label: "Low Risk", desc: "No significant events today." },
    MEDIUM: { bars: 3, color: "bg-amber-500",   label: "Medium Risk", desc: "Moderate market event scheduled." },
    HIGH:   { bars: 5, color: "bg-red-500",      label: "High Risk", desc: "Major macro event today. Expect volatility." },
  }[level];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${
          level === "HIGH" ? "text-red-500 dark:text-red-400" :
          level === "MEDIUM" ? "text-amber-500 dark:text-amber-400" :
          "text-emerald-600 dark:text-emerald-400"
        }`}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground">{level}</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 flex-1 rounded-full transition-all duration-500 ${
              i < config.bars ? config.color : "bg-muted"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{config.desc}</p>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function MacroRadar() {
  const [now, setNow] = useState(Date.now());

  const { data: events = [], isLoading: eventsLoading } = useQuery<MacroEvent[]>({
    queryKey: ["/api/macro-radar/events"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: indicators, isLoading: indLoading } = useQuery<MacroIndicators>({
    queryKey: ["/api/macro-radar/indicators"],
    refetchInterval: 10 * 60 * 1000,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Derived values
  const nextEvent = useMemo(() => events[0] ?? null, [events]);
  const minsUntil = useMemo(() => nextEvent ? minutesUntil(nextEvent.date) : Infinity, [nextEvent, now]);
  const msUntil   = useMemo(() => nextEvent ? new Date(nextEvent.date).getTime() - now : 0, [nextEvent, now]);

  const eventType  = useMemo(() => nextEvent ? detectEventType(nextEvent.event) : "OTHER", [nextEvent]);
  const scenarios  = useMemo(() => buildScenarios(eventType), [eventType]);

  const todayEvents = useMemo(() => events.filter((e) => isToday(e.date)), [events]);
  const riskLevel: RiskLevel = useMemo(() => {
    if (todayEvents.length >= 2) return "HIGH";
    if (todayEvents.length === 1) return "MEDIUM";
    return "LOW";
  }, [todayEvents]);

  const insight = useMemo(
    () => (indicators ? buildInsight(indicators) : "Loading macro data…"),
    [indicators],
  );
  const bias = useMemo(
    () => (indicators ? buildBias(indicators) : { usd: "Neutral" as Bias, gold: "Neutral" as Bias, btc: "Neutral" as Bias }),
    [indicators],
  );

  const isLoading = eventsLoading || indLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto pb-8">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">Macro Radar</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Real-time economic events &amp; macro insights for traders
        </p>
      </div>

      {/* ── 7. Volatility Warning (highest urgency — show at top if <15 min) ── */}
      {minsUntil >= 0 && minsUntil <= 15 && nextEvent && (
        <Card className="rounded-2xl border-0 bg-red-500/10 dark:bg-red-500/15 border border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">⚠ Volatility Warning</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                  Major macro event approaching in less than 15 minutes. Widen stops or stay flat.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 1. High Impact News Alert ──────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              High Impact Event
            </p>
          </div>

          {nextEvent ? (
            <>
              {minsUntil >= 0 && minsUntil <= 30 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    ⚠ High Impact Event Incoming in &lt; 30 min
                  </p>
                </div>
              )}

              <div>
                <p className="text-lg font-bold leading-tight">{nextEvent.event}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{nextEvent.country}</span>
                  {nextEvent.currency && (
                    <span className="text-xs font-semibold bg-muted rounded px-1.5 py-0.5">
                      {nextEvent.currency}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{fmtDate(nextEvent.date)}</p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Forecast", val: nextEvent.forecast },
                  { label: "Previous", val: nextEvent.previous },
                  { label: "Actual",   val: nextEvent.actual },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-xl bg-muted/40 p-3 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold mt-0.5">
                      {val != null ? val : "—"}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No upcoming high-impact events found.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Countdown Timer ────────────────────────────────────────── */}
      {nextEvent && msUntil > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
                <Clock className="w-4 h-4 text-sky-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Countdown
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2 truncate">
                {nextEvent.event} release in
              </p>
              <p className={`text-5xl font-mono font-bold tracking-widest ${
                minsUntil <= 15 ? "text-red-500 dark:text-red-400" :
                minsUntil <= 30 ? "text-amber-500 dark:text-amber-400" :
                "text-foreground"
              }`}>
                {fmtCountdown(msUntil)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                {fmtDate(nextEvent.date)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {nextEvent && msUntil <= 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 text-center py-8">
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              ✓ Event Released
            </p>
            <p className="text-xs text-muted-foreground mt-1">{nextEvent.event} data is now live.</p>
          </CardContent>
        </Card>
      )}

      {/* ── 3. Event Impact Prediction ────────────────────────────────── */}
      {nextEvent && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-violet-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Event Impact Prediction
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Based on: <span className="font-medium text-foreground">{nextEvent.event}</span></p>
            {scenarios.map((s) => <ScenarioCard key={s.label} s={s} />)}
          </CardContent>
        </Card>
      )}

      {/* ── 4. AI Macro Insight ───────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm border-0 bg-emerald-50 dark:bg-emerald-950/30">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              AI Macro Insight
            </p>
          </div>
          <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">
            {insight}
          </p>
          {indicators && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { label: "Fed Funds Rate", val: indicators.interestRate?.value, unit: "%" },
                { label: "Unemployment",   val: indicators.unemployment?.value,  unit: "%" },
                { label: "M2 Money Supply",val: indicators.moneySupply?.value,   unit: "B" },
                { label: "CPI Index",      val: indicators.inflation?.value,     unit: "" },
              ].map(({ label, val, unit }) => (
                <div key={label} className="rounded-lg bg-emerald-500/10 px-3 py-2">
                  <p className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-wider">{label}</p>
                  <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                    {val != null ? `${val.toFixed(unit === "B" ? 0 : 2)}${unit}` : "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 5. Market Risk Meter ──────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Market Risk Meter
            </p>
          </div>
          <RiskMeter level={riskLevel} />
          {todayEvents.length > 0 && (
            <div className="pt-1 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Today's High-Impact Events ({todayEvents.length})
              </p>
              {todayEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                  <span className="font-medium truncate max-w-[60%]">{e.event}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 6. AI Trading Context ─────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              AI Trading Context
            </p>
          </div>
          <BiasRow label="US Dollar (USD)" emoji="💵" bias={bias.usd} />
          <BiasRow label="Gold (XAUUSD)"   emoji="🥇" bias={bias.gold} />
          <BiasRow label="Bitcoin (BTC)"   emoji="₿"  bias={bias.btc} />
          <p className="text-[10px] text-muted-foreground/60 pt-2">
            Based on FRED data: Fed Funds Rate, M2, Unemployment
          </p>
        </CardContent>
      </Card>

      {/* ── Upcoming events list ───────────────────────────────────────── */}
      {events.length > 1 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Upcoming High-Impact Events
            </p>
            <div className="space-y-0">
              {events.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-start justify-between py-2.5 border-b border-border last:border-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.event}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{e.country}</span>
                      {e.currency && (
                        <span className="text-[10px] font-semibold bg-muted rounded px-1 py-0.5">{e.currency}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-muted-foreground tabular-nums">
                      {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
