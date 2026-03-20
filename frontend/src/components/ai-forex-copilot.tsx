import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Brain, TrendingUp, TrendingDown, Minus,
  Zap, ShieldAlert, Copy, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  BarChart3, Activity, Newspaper, DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AIForexSignal {
  pair: string;
  direction: "LONG" | "SHORT" | "NO_TRADE";
  style: "scalp" | "day" | "swing" | "position";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  riskReward: number;
  riskLevel: "low" | "medium" | "high";
  agentsConsensus: {
    technical:    "bullish" | "bearish" | "neutral";
    momentum:     "bullish" | "bearish" | "neutral";
    sentiment:    "bullish" | "bearish" | "neutral";
    fundamentals: "bullish" | "bearish" | "neutral";
  };
  debate: { bull: string; bear: string; judge: string };
  reasoning: string;
  timestamp: string;
}

// ─── i18n strings ────────────────────────────────────────────────────────────

const i18n = {
  en: {
    title:           "AI Trading Copilot",
    corePairs:       "Core Assets",
    forexPairs:      "Forex Pairs",
    analyzeBtn:      (p: string) => `Analyze ${p}`,
    analyzingBtn:    (p: string) => `Analyzing ${p}…`,
    noTrade:         "NO TRADE",
    noTradeMsg:      "🚫 Market condition unclear. Avoid trading.",
    noTradeConf:     (c: number) => `Confidence ${c}% < 55% threshold`,
    agentDebate:     "AI Agent Debate",
    bullAgent:       "🟢 Bull Agent",
    bearAgent:       "🔴 Bear Agent",
    judge:           "⚖️ Judge",
    reasoning:       "Explainable AI Reasoning",
    riskWarning:     "This analysis is for educational purposes only. Past patterns do not guarantee future results. Always use proper risk management and never risk more than you can afford to lose.",
    copySignal:      "Copy Signal",
    reAnalyze:       "Re-analyze",
    cachedNote:      (t: string) => `Analyzed ${t} · Cached 3 min`,
    emptyTitle:      "Select a pair and press Analyze",
    emptySubtitle:   "Uses real market data + technical analysis",
    confidence:      "Confidence",
    rr:              "R:R",
    style:           "Style",
    risk:            "Risk",
    entry:           "Entry",
    stopLoss:        "Stop Loss",
    takeProfit:      "Take Profit",
    agents: {
      technical:    "Technical",
      momentum:     "Momentum",
      sentiment:    "Sentiment",
      fundamentals: "Fundamentals",
    },
    votes: {
      bullish: "Bullish",
      bearish: "Bearish",
      neutral: "Neutral",
    },
    styles: {
      scalp:    "Scalp",
      day:      "Day",
      swing:    "Swing",
      position: "Position",
    },
    risks: {
      low:    "Low",
      medium: "Medium",
      high:   "High",
    },
    copiedTitle: "Signal copied!",
    copiedDesc:  "Paste it anywhere.",
    errorTitle:  "Analysis failed",
  },
  id: {
    title:           "AI Trading Copilot",
    corePairs:       "Aset Utama",
    forexPairs:      "Pasangan Forex",
    analyzeBtn:      (p: string) => `Analisis ${p}`,
    analyzingBtn:    (p: string) => `Menganalisis ${p}…`,
    noTrade:         "JANGAN TRADING",
    noTradeMsg:      "🚫 Kondisi pasar tidak jelas. Hindari trading.",
    noTradeConf:     (c: number) => `Keyakinan ${c}% < batas 55%`,
    agentDebate:     "Debat Agen AI",
    bullAgent:       "🟢 Agen Bull",
    bearAgent:       "🔴 Agen Bear",
    judge:           "⚖️ Hakim",
    reasoning:       "Penjelasan Analisis AI",
    riskWarning:     "Analisis ini hanya untuk tujuan edukasi. Pola masa lalu tidak menjamin hasil di masa depan. Selalu gunakan manajemen risiko yang tepat dan jangan pernah menanggung risiko melebihi kemampuan Anda.",
    copySignal:      "Salin Sinyal",
    reAnalyze:       "Analisis Ulang",
    cachedNote:      (t: string) => `Dianalisis ${t} · Cache 3 menit`,
    emptyTitle:      "Pilih pasangan dan tekan Analisis",
    emptySubtitle:   "Menggunakan data pasar nyata + analisis teknikal",
    confidence:      "Keyakinan",
    rr:              "R:R",
    style:           "Gaya",
    risk:            "Risiko",
    entry:           "Entry",
    stopLoss:        "Stop Loss",
    takeProfit:      "Take Profit",
    agents: {
      technical:    "Teknikal",
      momentum:     "Momentum",
      sentiment:    "Sentimen",
      fundamentals: "Fundamental",
    },
    votes: {
      bullish: "Bullish",
      bearish: "Bearish",
      neutral: "Netral",
    },
    styles: {
      scalp:    "Scalp",
      day:      "Day",
      swing:    "Swing",
      position: "Posisi",
    },
    risks: {
      low:    "Rendah",
      medium: "Sedang",
      high:   "Tinggi",
    },
    copiedTitle: "Sinyal disalin!",
    copiedDesc:  "Paste di mana saja.",
    errorTitle:  "Analisis gagal",
  },
};

// ─── Pair groups ──────────────────────────────────────────────────────────────

const CORE_PAIRS  = ["XAU/USD", "BTC/USD"];
const FOREX_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "NZD/USD", "USD/CAD"];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function voteColor(vote: string) {
  if (vote === "bullish") return "text-emerald-600 dark:text-emerald-400";
  if (vote === "bearish") return "text-red-500 dark:text-red-400";
  return "text-amber-500 dark:text-amber-400";
}

function voteBg(vote: string) {
  if (vote === "bullish") return "bg-emerald-500/10 border-emerald-500/20";
  if (vote === "bearish") return "bg-red-500/10 border-red-500/20";
  return "bg-amber-500/10 border-amber-500/20";
}

function VoteIcon({ vote }: { vote: string }) {
  if (vote === "bullish") return <TrendingUp  className="w-3.5 h-3.5" />;
  if (vote === "bearish") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function AgentIcon({ agent }: { agent: string }) {
  if (agent === "technical")    return <BarChart3  className="w-4 h-4" />;
  if (agent === "momentum")     return <Activity   className="w-4 h-4" />;
  if (agent === "sentiment")    return <Newspaper  className="w-4 h-4" />;
  if (agent === "fundamentals") return <DollarSign className="w-4 h-4" />;
  return <Brain className="w-4 h-4" />;
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function CopilotSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[0,1,2,3].map(i => (
          <div key={i} className="rounded-lg border p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-8 w-24 mx-auto" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

// ─── Pair button ──────────────────────────────────────────────────────────────

function PairButton({
  pair, selected, isCore, onClick,
}: {
  pair: string; selected: boolean; isCore: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1.5 transition-colors whitespace-nowrap flex-shrink-0 text-xs font-medium relative",
        selected
          ? "bg-[#19432c] text-white"
          : isCore
            ? "hover:bg-[#19432c]/10 text-[#19432c] dark:text-emerald-400 font-semibold"
            : "hover:bg-muted text-muted-foreground",
      )}
    >
      {isCore && !selected && (
        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#19432c] dark:bg-emerald-400" />
      )}
      {pair}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIForexCopilot() {
  const { toast }                           = useToast();
  const { language }                        = useLanguage();
  const tx                                  = i18n[language as "en" | "id"] ?? i18n.id;
  const [selectedPair, setSelectedPair]     = useState("XAU/USD");
  const [signal, setSignal]                 = useState<AIForexSignal | null>(null);
  const [debateOpen, setDebateOpen]         = useState(false);

  const analyze = useMutation({
    mutationFn: (pair: string) =>
      apiRequest("POST", "/api/forex/ai-analyze", { pair }).then(r => r.json()),
    onSuccess: (data: AIForexSignal) => {
      setSignal(data);
      setDebateOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: tx.errorTitle, description: err.message, variant: "destructive" });
    },
  });

  const selectPair = (p: string) => { setSelectedPair(p); setSignal(null); };

  const copySignal = () => {
    if (!signal) return;
    const text = signal.direction === "NO_TRADE"
      ? `🚫 AI Copilot — NO TRADE on ${signal.pair}\n${tx.noTradeMsg}\n${new Date(signal.timestamp).toLocaleString()}`
      : `📊 AI Copilot Signal\nPair: ${signal.pair}\nDirection: ${signal.direction}\nEntry: ${signal.entry}\nSL: ${signal.stopLoss}\nTP: ${signal.takeProfit}\nConfidence: ${signal.confidence}%\nRR: 1:${signal.riskReward}\nStyle: ${signal.style}\n${new Date(signal.timestamp).toLocaleString()}`;
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: tx.copiedTitle, description: tx.copiedDesc })
    );
  };

  const dirConfig = signal ? {
    LONG:     { label: "LONG",          bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", icon: <TrendingUp   className="w-5 h-5" /> },
    SHORT:    { label: "SHORT",         bg: "bg-red-500/15",     text: "text-red-600 dark:text-red-400",         border: "border-red-500/30",     icon: <TrendingDown className="w-5 h-5" /> },
    NO_TRADE: { label: tx.noTrade,      bg: "bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",     border: "border-amber-500/30",   icon: <AlertTriangle className="w-5 h-5" /> },
  }[signal.direction] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-500" />
          {tx.title}
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
            BETA
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">

        {/* ── Core pairs (XAU/USD · BTC/USD) */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            ⭐ {tx.corePairs}
          </p>
          <div className="flex items-center rounded-lg border border-[#19432c]/30 dark:border-emerald-500/20 overflow-hidden bg-[#19432c]/5 dark:bg-emerald-900/10">
            {CORE_PAIRS.map(p => (
              <PairButton key={p} pair={p} selected={selectedPair === p} isCore onClick={() => selectPair(p)} />
            ))}
          </div>
        </div>

        {/* ── Forex pairs */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            {tx.forexPairs}
          </p>
          <div className="flex items-center rounded-lg border border-border overflow-hidden flex-wrap">
            {FOREX_PAIRS.map(p => (
              <PairButton key={p} pair={p} selected={selectedPair === p} isCore={false} onClick={() => selectPair(p)} />
            ))}
          </div>
        </div>

        {/* ── Analyze button */}
        <Button
          className="w-full bg-[#19432c] hover:bg-emerald-800 text-white text-xs"
          size="sm"
          onClick={() => analyze.mutate(selectedPair)}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />{tx.analyzingBtn(selectedPair)}</>
          ) : (
            <><Zap className="w-3.5 h-3.5 mr-1.5" />{tx.analyzeBtn(selectedPair)}</>
          )}
        </Button>

        {/* ── Skeleton */}
        {analyze.isPending && <CopilotSkeleton />}

        {/* ── Results */}
        {signal && !analyze.isPending && (
          <div className="space-y-3">

            {/* 1 — Multi-Agent Summary */}
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(signal.agentsConsensus) as [string, string][]).map(([agent, vote]) => (
                <div key={agent} className={cn("rounded-lg border p-2.5 flex items-center gap-2", voteBg(vote))}>
                  <span className={cn("shrink-0", voteColor(vote))}>
                    <AgentIcon agent={agent} />
                  </span>
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
                    <p className="text-[10px] text-muted-foreground">{tx.noTradeConf(signal.confidence)}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className={cn("flex items-center justify-center gap-2 text-xl font-bold", dirConfig.text)}>
                      {dirConfig.icon} {dirConfig.label}
                    </div>

                    {/* Entry / SL / TP */}
                    <div className="grid grid-cols-3 gap-2 text-left">
                      {[
                        { label: tx.entry,      value: signal.entry },
                        { label: tx.stopLoss,   value: signal.stopLoss },
                        { label: tx.takeProfit, value: signal.takeProfit },
                      ].map(item => (
                        <div key={item.label} className="rounded-md bg-background/60 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-semibold font-mono">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Confidence / RR / Style / Risk */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.confidence}</p>
                        <p className={cn("text-xs font-bold", dirConfig.text)}>{signal.confidence}%</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.rr}</p>
                        <p className="text-xs font-bold">1:{signal.riskReward}</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.style}</p>
                        <p className="text-xs font-semibold">
                          {tx.styles[signal.style as keyof typeof tx.styles] ?? signal.style}
                        </p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">{tx.risk}</p>
                        <p className={cn("text-xs font-semibold",
                          signal.riskLevel === "high"   ? "text-red-500" :
                          signal.riskLevel === "medium" ? "text-amber-500" : "text-emerald-500"
                        )}>
                          {tx.risks[signal.riskLevel as keyof typeof tx.risks] ?? signal.riskLevel}
                        </p>
                      </div>
                    </div>

                    {/* Confidence bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{tx.confidence}</span><span>{signal.confidence}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-700",
                            signal.direction === "LONG" ? "bg-emerald-500" : "bg-red-500"
                          )}
                          style={{ width: `${signal.confidence}%` }}
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
                    { label: tx.bullAgent, text: signal.debate.bull,  color: "text-emerald-600 dark:text-emerald-400" },
                    { label: tx.bearAgent, text: signal.debate.bear,  color: "text-red-500 dark:text-red-400" },
                    { label: tx.judge,     text: signal.debate.judge, color: "text-violet-600 dark:text-violet-400" },
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
              <p className="text-[11px] text-muted-foreground leading-relaxed">{signal.reasoning}</p>
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
              <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => analyze.mutate(selectedPair)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> {tx.reAnalyze}
              </Button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              {tx.cachedNote(new Date(signal.timestamp).toLocaleTimeString())}
            </p>
          </div>
        )}

        {/* ── Empty state */}
        {!signal && !analyze.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">{tx.emptyTitle}</p>
            <p className="text-[10px] mt-1 opacity-70">{tx.emptySubtitle}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
