import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Brain, TrendingUp, TrendingDown, Minus,
  Zap, ShieldAlert, Copy, BookOpen, RefreshCw,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  BarChart3, Activity, Newspaper, DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "NZD/USD", "USD/CAD"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function voteColor(vote: "bullish" | "bearish" | "neutral") {
  if (vote === "bullish") return "text-emerald-600 dark:text-emerald-400";
  if (vote === "bearish") return "text-red-500 dark:text-red-400";
  return "text-amber-500 dark:text-amber-400";
}

function voteBg(vote: "bullish" | "bearish" | "neutral") {
  if (vote === "bullish") return "bg-emerald-500/10 border-emerald-500/20";
  if (vote === "bearish") return "bg-red-500/10 border-red-500/20";
  return "bg-amber-500/10 border-amber-500/20";
}

function VoteIcon({ vote }: { vote: "bullish" | "bearish" | "neutral" }) {
  if (vote === "bullish") return <TrendingUp  className="w-3.5 h-3.5" />;
  if (vote === "bearish") return <TrendingDown className="w-3.5 h-3.5" />;
  return <Minus className="w-3.5 h-3.5" />;
}

function AgentIcon({ agent }: { agent: string }) {
  if (agent === "technical")    return <BarChart3   className="w-4 h-4" />;
  if (agent === "momentum")     return <Activity     className="w-4 h-4" />;
  if (agent === "sentiment")    return <Newspaper    className="w-4 h-4" />;
  if (agent === "fundamentals") return <DollarSign   className="w-4 h-4" />;
  return <Brain className="w-4 h-4" />;
}

const AGENT_LABELS: Record<string, string> = {
  technical:    "Technical",
  momentum:     "Momentum",
  sentiment:    "Sentiment",
  fundamentals: "Fundamentals",
};

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

// ─── Main component ───────────────────────────────────────────────────────────

export function AIForexCopilot() {
  const { toast } = useToast();
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [signal, setSignal]             = useState<AIForexSignal | null>(null);
  const [debateOpen, setDebateOpen]     = useState(false);

  const analyze = useMutation({
    mutationFn: (pair: string) =>
      apiRequest("POST", "/api/forex/ai-analyze", { pair }).then(r => r.json()),
    onSuccess: (data: AIForexSignal) => {
      setSignal(data);
      setDebateOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
    },
  });

  const copySignal = () => {
    if (!signal) return;
    const text = signal.direction === "NO_TRADE"
      ? `🚫 AI Copilot — NO TRADE on ${signal.pair}\nMarket unclear. Avoid trading.\n${new Date(signal.timestamp).toLocaleString()}`
      : `📊 AI Copilot Signal\nPair: ${signal.pair}\nDirection: ${signal.direction}\nEntry: ${signal.entry}\nSL: ${signal.stopLoss}\nTP: ${signal.takeProfit}\nConfidence: ${signal.confidence}%\nRR: 1:${signal.riskReward}\nStyle: ${signal.style}\n${new Date(signal.timestamp).toLocaleString()}`;
    navigator.clipboard.writeText(text).then(() =>
      toast({ title: "Signal copied!", description: "Paste it anywhere." })
    );
  };

  const directionConfig = signal ? {
    LONG:     { label: "LONG",     bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", icon: <TrendingUp  className="w-5 h-5" /> },
    SHORT:    { label: "SHORT",    bg: "bg-red-500/15",     text: "text-red-600 dark:text-red-400",         border: "border-red-500/30",     icon: <TrendingDown className="w-5 h-5" /> },
    NO_TRADE: { label: "NO TRADE", bg: "bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",     border: "border-amber-500/30",   icon: <AlertTriangle className="w-5 h-5" /> },
  }[signal.direction] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="w-4 h-4 text-violet-500" />
          AI Trading Copilot
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
            BETA
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">

        {/* Pair selector + Analyze */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium flex-wrap">
            {PAIRS.map(p => (
              <button
                key={p}
                onClick={() => { setSelectedPair(p); setSignal(null); }}
                className={cn(
                  "px-2.5 py-1.5 transition-colors whitespace-nowrap flex-shrink-0",
                  selectedPair === p
                    ? "bg-[#19432c] text-white"
                    : "hover:bg-muted text-muted-foreground"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <Button
          className="w-full bg-[#19432c] hover:bg-emerald-800 text-white text-xs"
          size="sm"
          onClick={() => analyze.mutate(selectedPair)}
          disabled={analyze.isPending}
        >
          {analyze.isPending ? (
            <><RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Analyzing {selectedPair}…</>
          ) : (
            <><Zap className="w-3.5 h-3.5 mr-1.5" /> Analyze {selectedPair}</>
          )}
        </Button>

        {/* Loading skeleton */}
        {analyze.isPending && <CopilotSkeleton />}

        {/* Results */}
        {signal && !analyze.isPending && (
          <div className="space-y-3">

            {/* 1 — Multi-Agent Summary */}
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(signal.agentsConsensus) as [string, "bullish"|"bearish"|"neutral"][]).map(([agent, vote]) => (
                <div
                  key={agent}
                  className={cn("rounded-lg border p-2.5 flex items-center gap-2", voteBg(vote))}
                >
                  <span className={cn("shrink-0", voteColor(vote))}>
                    <AgentIcon agent={agent} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{AGENT_LABELS[agent]}</p>
                    <p className={cn("text-xs font-semibold capitalize flex items-center gap-1", voteColor(vote))}>
                      <VoteIcon vote={vote} />
                      {vote}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* 2 — Final Decision */}
            {directionConfig && (
              <div className={cn("rounded-xl border p-4 text-center", directionConfig.bg, directionConfig.border)}>
                {signal.direction === "NO_TRADE" ? (
                  <div className="space-y-1">
                    <div className={cn("flex items-center justify-center gap-2 text-lg font-bold", directionConfig.text)}>
                      {directionConfig.icon} NO TRADE
                    </div>
                    <p className="text-xs text-muted-foreground">🚫 Market condition unclear. Avoid trading.</p>
                    <p className="text-[10px] text-muted-foreground">Confidence {signal.confidence}% &lt; 55% threshold</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Direction badge */}
                    <div className={cn("flex items-center justify-center gap-2 text-xl font-bold", directionConfig.text)}>
                      {directionConfig.icon} {directionConfig.label}
                    </div>

                    {/* Key metrics grid */}
                    <div className="grid grid-cols-3 gap-2 text-left">
                      {[
                        { label: "Entry",  value: signal.entry },
                        { label: "Stop Loss", value: signal.stopLoss },
                        { label: "Take Profit", value: signal.takeProfit },
                      ].map(item => (
                        <div key={item.label} className="rounded-md bg-background/60 px-2 py-1.5">
                          <p className="text-[10px] text-muted-foreground">{item.label}</p>
                          <p className="text-xs font-semibold font-mono">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Confidence + RR + Style + Risk */}
                    <div className="grid grid-cols-4 gap-1.5">
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Confidence</p>
                        <p className={cn("text-xs font-bold", directionConfig.text)}>{signal.confidence}%</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">R:R</p>
                        <p className="text-xs font-bold">1:{signal.riskReward}</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Style</p>
                        <p className="text-xs font-semibold capitalize">{signal.style}</p>
                      </div>
                      <div className="rounded-md bg-background/60 px-2 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Risk</p>
                        <p className={cn("text-xs font-semibold capitalize",
                          signal.riskLevel === "high" ? "text-red-500" :
                          signal.riskLevel === "medium" ? "text-amber-500" : "text-emerald-500"
                        )}>{signal.riskLevel}</p>
                      </div>
                    </div>

                    {/* Confidence bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Confidence</span><span>{signal.confidence}%</span>
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
                  <Brain className="w-3.5 h-3.5 text-violet-500" /> AI Agent Debate
                </span>
                {debateOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {debateOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  {[
                    { label: "🟢 Bull Agent", text: signal.debate.bull, color: "text-emerald-600 dark:text-emerald-400" },
                    { label: "🔴 Bear Agent", text: signal.debate.bear, color: "text-red-500 dark:text-red-400" },
                    { label: "⚖️ Judge",      text: signal.debate.judge, color: "text-violet-600 dark:text-violet-400" },
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
                <CheckCircle2 className="w-3 h-3" /> Explainable AI Reasoning
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{signal.reasoning}</p>
            </div>

            {/* Risk warning */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                This analysis is for educational purposes only. Past patterns do not guarantee future results. Always use proper risk management and never risk more than you can afford to lose.
              </p>
            </div>

            {/* 5 — Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                className="flex-1 text-xs"
                onClick={copySignal}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Signal
              </Button>
              <Button
                variant="outline" size="sm"
                className="flex-1 text-xs"
                onClick={() => analyze.mutate(selectedPair)}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-analyze
              </Button>
            </div>

            <p className="text-center text-[10px] text-muted-foreground">
              Analyzed {new Date(signal.timestamp).toLocaleTimeString()} · Cached 3 min
            </p>
          </div>
        )}

        {/* Empty state */}
        {!signal && !analyze.isPending && (
          <div className="text-center py-6 text-muted-foreground">
            <Brain className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Select a pair and press Analyze</p>
            <p className="text-[10px] mt-1 opacity-70">Uses real market data + technical analysis</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
