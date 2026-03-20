import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Brain, Zap, RefreshCw, Copy, Clock, ShieldAlert,
  ChevronDown, ChevronUp, CheckCircle2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

type TradingStyle = "scalp" | "day" | "swing";

interface AIForexSignal {
  pair:             string;
  tradingStyle:     TradingStyle;
  direction:        "LONG" | "SHORT" | "NO_TRADE";
  confidence:       number;
  entry:            string;
  stopLoss:         string;
  takeProfit:       string;
  riskReward:       number;
  riskLevel:        "low" | "medium" | "high";
  tfLabel:          string;
  durationEstimate: string;
  reasoning:        string;
  agentsConsensus:  Record<string, string>;
  debate:           { bull: string; bear: string; judge: string };
  timestamp:        number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRS: string[] = [
  "XAU/USD", "BTC/USD",
  "EUR/USD", "GBP/USD", "USD/JPY",
  "AUD/USD", "NZD/USD", "USD/CHF", "USD/CAD",
];

const STYLES: { value: TradingStyle; label: { en: string; id: string }; sub: { en: string; id: string } }[] = [
  { value: "scalp", label: { en: "Scalp", id: "Scalp"     }, sub: { en: "M1–M15",  id: "M1–M15"  } },
  { value: "day",   label: { en: "Day",   id: "Day Trade"  }, sub: { en: "H1–H4",   id: "H1–H4"   } },
  { value: "swing", label: { en: "Swing", id: "Swing"      }, sub: { en: "D1–W1",   id: "D1–W1"   } },
];

// ─── i18n ─────────────────────────────────────────────────────────────────────

function useTx(lang: string) {
  const id = lang === "id";
  return {
    title:        id ? "AI Copilot" : "AI Copilot",
    subtitle:     id ? "Analisis teknikal multi-agen" : "Multi-agent technical analysis",
    pair:         id ? "Pair" : "Pair",
    style:        id ? "Gaya Trading" : "Trading Style",
    styleLabel:   { scalp: "Scalp", day: "Day Trade", swing: "Swing" } as Record<string, string>,
    analyzeBtn:   (p: string, s: string) => id ? `Analisis ${p} (${s})` : `Analyze ${p} (${s})`,
    analyzingBtn: (p: string) => id ? `Menganalisis ${p}…` : `Analyzing ${p}…`,
    agents:       {
      technical:    id ? "Teknikal" : "Technical",
      momentum:     id ? "Momentum" : "Momentum",
      sentiment:    id ? "Sentimen" : "Sentiment",
      fundamentals: id ? "Fundamental" : "Fundamentals",
    } as Record<string, string>,
    votes: {
      bullish: id ? "Bullish" : "Bullish",
      bearish: id ? "Bearish" : "Bearish",
      neutral: id ? "Netral" : "Neutral",
    } as Record<string, string>,
    noTrade:      id ? "JANGAN MASUK" : "NO TRADE",
    noTradeMsg:   id ? "Kondisi pasar tidak jelas. Tunggu setup lebih bersih." : "Market conditions unclear. Wait for a cleaner setup.",
    noTradeConf:  (c: number) => id ? `Confidence ${c.toFixed(0)}% < 55% minimum` : `Confidence ${c.toFixed(0)}% < 55% minimum`,
    entry:        id ? "Entry" : "Entry",
    stopLoss:     id ? "Stop Loss" : "Stop Loss",
    takeProfit:   id ? "Take Profit" : "Take Profit",
    confidence:   id ? "Confidence" : "Confidence",
    rr:           id ? "R:R" : "R:R",
    risk:         id ? "Risiko" : "Risk",
    duration:     id ? "Durasi" : "Duration",
    risks:        { low: id ? "Rendah" : "Low", medium: id ? "Sedang" : "Medium", high: id ? "Tinggi" : "High" } as Record<string, string>,
    agentDebate:  id ? "Debat AI" : "AI Debate",
    bullAgent:    id ? "Bull Agent" : "Bull Agent",
    bearAgent:    id ? "Bear Agent" : "Bear Agent",
    judge:        id ? "Judge" : "Judge",
    reasoning:    id ? "Kesimpulan" : "Reasoning",
    riskWarning:  id
      ? "Sinyal ini bersifat informatif, bukan saran investasi. Selalu gunakan manajemen risiko."
      : "This signal is informational only, not financial advice. Always use proper risk management.",
    copySignal:   id ? "Salin Sinyal" : "Copy Signal",
    reAnalyze:    id ? "Analisis Ulang" : "Re-Analyze",
    cachedNote:   (time: string, tf: string) =>
      id ? `Dianalisis ${time} · ${tf}` : `Analyzed at ${time} · ${tf}`,
    emptyTitle:   id ? "Belum ada sinyal" : "No signal yet",
    emptySubtitle: id ? "Pilih pair & gaya, lalu tekan Analisis" : "Choose a pair & style, then press Analyze",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeValue<T>(value: T | null | undefined, fallback: T): T {
  return value ?? fallback;
}

function voteBg(vote: string) {
  if (vote === "bullish") return "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800";
  if (vote === "bearish") return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
  return "bg-muted/40 border-border";
}

function voteColor(vote: string) {
  if (vote === "bullish") return "text-emerald-600 dark:text-emerald-400";
  if (vote === "bearish") return "text-red-500 dark:text-red-400";
  return "text-muted-foreground";
}

const styleColor: Record<string, string> = {
  scalp: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  day:   "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
  swing: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
};

function AgentIcon({ agent }: { agent: string }) {
  if (agent === "technical")    return <TrendingUp className="w-3.5 h-3.5" />;
  if (agent === "momentum")     return <Zap className="w-3.5 h-3.5" />;
  if (agent === "sentiment")    return <Brain className="w-3.5 h-3.5" />;
  if (agent === "fundamentals") return <BarChart className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function VoteIcon({ vote }: { vote: string }) {
  if (vote === "bullish") return <TrendingUp className="w-3 h-3" />;
  if (vote === "bearish") return <TrendingDown className="w-3 h-3" />;
  return <Minus className="w-3 h-3" />;
}

function BarChart({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6"  y1="20" x2="6"  y2="14" />
    </svg>
  );
}

function CopilotSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <Skeleton className="h-10 rounded-lg" />
      <Skeleton className="h-16 rounded-lg" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AIForexCopilot() {
  const { language } = useLanguage();
  const tx = useTx(language ?? "id");

  const [selectedPair,  setSelectedPair]  = useState<string>("XAU/USD");
  const [selectedStyle, setSelectedStyle] = useState<TradingStyle>("day");
  const [signal,        setSignal]        = useState<AIForexSignal | null>(null);
  const [debateOpen,    setDebateOpen]    = useState(false);

  const analyze = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/forex/ai-analyze", {
        pair:  safeValue(selectedPair,  "XAU/USD"),
        style: safeValue(selectedStyle, "day"),
      }).then(r => r.json() as Promise<AIForexSignal>),
    onSuccess: (data) => setSignal(data),
  });

  function runAnalyze() {
    analyze.mutate();
  }

  function copySignal() {
    if (!signal) return;
    const text = [
      `${safeValue(signal.pair, "")} [${safeValue(signal.tradingStyle, "").toUpperCase()}]`,
      `Direction: ${safeValue(signal.direction, "")}`,
      `Entry: ${safeValue(signal.entry, "")}`,
      `SL: ${safeValue(signal.stopLoss, "")}`,
      `TP: ${safeValue(signal.takeProfit, "")}`,
      `RR: 1:${safeValue(signal.riskReward, 0)}`,
      `Confidence: ${safeValue(signal.confidence, 0)}%`,
      `Risk: ${safeValue(signal.riskLevel, "")}`,
      `TF: ${safeValue(signal.tfLabel, "")}`,
      `Duration: ${safeValue(signal.durationEstimate, "")}`,
    ].join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const dir = signal?.direction;
  const dirConfig = dir === "LONG"
    ? { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-300 dark:border-emerald-700",
        text: "text-emerald-600 dark:text-emerald-400", icon: <TrendingUp className="w-6 h-6" />, label: "LONG — BUY" }
    : dir === "SHORT"
    ? { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-300 dark:border-red-700",
        text: "text-red-500 dark:text-red-400",       icon: <TrendingDown className="w-6 h-6" />, label: "SHORT — SELL" }
    : dir === "NO_TRADE"
    ? { bg: "bg-muted/50",                            border: "border-border",
        text: "text-muted-foreground",                icon: <Minus className="w-6 h-6" />,        label: "NO TRADE" }
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="w-4 h-4 text-violet-500" />
          {tx.title}
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">{tx.subtitle}</p>
      </CardHeader>

      <CardContent className="space-y-3">

        {/* ── Pair selector */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{tx.pair}</p>
          <div className="flex flex-wrap gap-1.5">
            {(PAIRS || []).map(p => (
              <button
                key={p}
                onClick={() => setSelectedPair(p)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  safeValue(selectedPair, "XAU/USD") === p
                    ? "bg-[#19432c] text-white border-[#19432c]"
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* ── Style selector */}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">{tx.style}</p>
          <div className="flex gap-2">
            {STYLES.map(s => (
              <button
                key={s.value}
                onClick={() => setSelectedStyle(s.value)}
                className={cn(
                  "flex-1 rounded-lg border py-1.5 text-center transition-colors",
                  safeValue(selectedStyle, "day") === s.value
                    ? "bg-[#19432c] text-white border-[#19432c]"
                    : "border-border text-muted-foreground hover:border-foreground/30",
                )}
              >
                <p className="text-[11px] font-semibold leading-none">
                  {s.label[language === "id" ? "id" : "en"]}
                </p>
                <p className="text-[9px] opacity-70 mt-0.5">
                  {s.sub[language === "id" ? "id" : "en"]}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Analyze button */}
        <Button
          className="w-full bg-[#19432c] hover:bg-emerald-800 text-white text-xs"
          size="sm"
          onClick={runAnalyze}
          disabled={analyze.isPending}
        >
          {analyze.isPending
            ? <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />{tx.analyzingBtn(safeValue(selectedPair, "XAU/USD"))}</>
            : <><Zap className="w-3.5 h-3.5 mr-1.5" />{tx.analyzeBtn(safeValue(selectedPair, "XAU/USD"), tx.styleLabel[safeValue(selectedStyle, "day")] ?? safeValue(selectedStyle, "day"))}</>
          }
        </Button>

        {/* ── Skeleton */}
        {analyze.isPending && <CopilotSkeleton />}

        {/* ── Results */}
        {signal && !analyze.isPending && (
          <div className="space-y-3">

            {/* TF badge */}
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", styleColor[safeValue(signal.tradingStyle, "day")] ?? "bg-muted text-foreground")}>
                {tx.styleLabel[safeValue(signal.tradingStyle, "day")] ?? signal.tradingStyle ?? ""}
              </span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" /> {safeValue(signal.tfLabel, "")}
              </span>
            </div>

            {/* 1 — Multi-Agent Summary */}
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(safeValue(signal.agentsConsensus, {}) as Record<string, string>)).map(([agent, vote]) => (
                <div key={agent} className={cn("rounded-lg border p-2.5 flex items-center gap-2", voteBg(vote))}>
                  <span className={cn("shrink-0", voteColor(vote))}><AgentIcon agent={agent} /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-none mb-0.5">
                      {tx.agents[agent as keyof typeof tx.agents] ?? agent}
                    </p>
                    <p className={cn("text-xs font-semibold flex items-center gap-1", voteColor(vote))}>
                      <VoteIcon vote={vote} />
                      {tx.votes[vote as keyof typeof tx.votes] ?? vote}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* 2 — Final Decision */}
            {dirConfig && (
              <div className={cn("rounded-xl border p-4 text-center", dirConfig.bg, dirConfig.border)}>
                {signal.direction === "NO_TRADE" ? (
                  <div className="space-y-1">
                    <div className={cn("flex items-center justify-center gap-2 text-lg font-bold", dirConfig.text)}>
                      {dirConfig.icon} {tx.noTrade}
                    </div>
                    <p className="text-xs text-muted-foreground">{tx.noTradeMsg}</p>
                    <p className="text-[10px] text-muted-foreground">{tx.noTradeConf(safeValue(signal.confidence, 0))}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={cn("flex items-center justify-center gap-2 text-xl font-bold", dirConfig.text)}>
                      {dirConfig.icon} {dirConfig.label}
                    </div>

                    {/* Entry / SL / TP */}
                    <div className="grid grid-cols-3 gap-2 text-left">
                      {[
                        { label: tx.entry,      value: safeValue(signal.entry,      "–") },
                        { label: tx.stopLoss,   value: safeValue(signal.stopLoss,   "–") },
                        { label: tx.takeProfit, value: safeValue(signal.takeProfit, "–") },
                      ].map(item => (
                        <div key={item.label} className="rounded-md bg-background/60 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-semibold font-mono">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Confidence / RR / Risk / Duration */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.confidence}</p>
                        <p className={cn("text-xs font-bold", dirConfig.text)}>{safeValue(signal.confidence, 0)}%</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.rr}</p>
                        <p className="text-xs font-bold">1:{safeValue(signal.riskReward, 0)}</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.risk}</p>
                        <p className={cn("text-xs font-semibold",
                          signal.riskLevel === "high"   ? "text-red-500" :
                          signal.riskLevel === "medium" ? "text-amber-500" : "text-emerald-500"
                        )}>
                          {tx.risks[safeValue(signal.riskLevel, "low") as keyof typeof tx.risks] ?? safeValue(signal.riskLevel, "low")}
                        </p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.duration}</p>
                        <p className="text-xs font-semibold leading-tight">{safeValue(signal.durationEstimate, "–")}</p>
                      </div>
                    </div>

                    {/* Confidence bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{tx.confidence}</span><span>{safeValue(signal.confidence, 0)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-700",
                            signal.direction === "LONG" ? "bg-emerald-500" : "bg-red-500"
                          )}
                          style={{ width: `${safeValue(signal.confidence, 0)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3 — AI Debate (collapsible) */}
            <div className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setDebateOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold hover:bg-muted transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-violet-500" /> {tx.agentDebate}
                </span>
                {debateOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {debateOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  {[
                    { label: tx.bullAgent, text: signal.debate?.bull  ?? "", color: "text-emerald-600 dark:text-emerald-400" },
                    { label: tx.bearAgent, text: signal.debate?.bear  ?? "", color: "text-red-500 dark:text-red-400" },
                    { label: tx.judge,     text: signal.debate?.judge ?? "", color: "text-violet-600 dark:text-violet-400" },
                  ].map(item => (
                    <div key={item.label}>
                      <p className={cn("text-[10px] font-semibold mb-0.5", item.color)}>{item.label}</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4 — Reasoning */}
            <div className="rounded-lg border border-border p-3 bg-muted/30">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {tx.reasoning}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{safeValue(signal.reasoning, "")}</p>
            </div>

            {/* Risk warning */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">{tx.riskWarning}</p>
            </div>

            {/* 5 — Action buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={copySignal}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> {tx.copySignal}
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={runAnalyze}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {tx.reAnalyze}
              </Button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              {tx.cachedNote(
                signal.timestamp ? new Date(signal.timestamp).toLocaleTimeString() : "–",
                safeValue(signal.tfLabel, ""),
              )}
            </p>
          </div>
        )}

        {/* ── Empty state */}
        {!signal && !analyze.isPending && (
          <div className="text-center py-5 text-muted-foreground">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs font-medium">{tx.emptyTitle}</p>
            <p className="text-[10px] mt-1 opacity-70">{tx.emptySubtitle}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
