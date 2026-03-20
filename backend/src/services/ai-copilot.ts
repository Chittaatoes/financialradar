// ─── AI Forex Copilot — Real Technical Analysis Engine ───────────────────────
// Uses real forex rate data from Frankfurter API (free, no API key required)
// Calculates genuine technical indicators — NO random signals

import { marketCache } from "./market-cache";

const FRANKFURTER_BASE = "https://api.frankfurter.app";

export const SUPPORTED_PAIRS: Record<string, { base: string; target: string; isJPY: boolean }> = {
  "EUR/USD": { base: "EUR", target: "USD", isJPY: false },
  "GBP/USD": { base: "GBP", target: "USD", isJPY: false },
  "USD/JPY": { base: "USD", target: "JPY", isJPY: true  },
  "AUD/USD": { base: "AUD", target: "USD", isJPY: false },
  "USD/CHF": { base: "USD", target: "CHF", isJPY: false },
  "NZD/USD": { base: "NZD", target: "USD", isJPY: false },
  "USD/CAD": { base: "USD", target: "CAD", isJPY: false },
};

export interface AIForexSignal {
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

type Vote = "bullish" | "bearish" | "neutral";

// ─── Math helpers ────────────────────────────────────────────────────────────

function sma(arr: number[], period: number): number {
  const slice = arr.slice(-Math.min(period, arr.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function stdDev(arr: number[]): number {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

function roc(arr: number[], period: number): number {
  if (arr.length <= period) return 0;
  const cur  = arr[arr.length - 1];
  const prev = arr[arr.length - 1 - period];
  return ((cur - prev) / prev) * 100;
}

// ─── Data fetch ──────────────────────────────────────────────────────────────

async function fetchRates(base: string, target: string): Promise<number[]> {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 60);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const url  = `${FRANKFURTER_BASE}/${fmt(start)}..${fmt(end)}?from=${base}&to=${target}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`Frankfurter API ${resp.status}`);

  const json  = await resp.json() as { rates: Record<string, Record<string, number>> };
  const rates = Object.values(json.rates)
    .map(r => r[target])
    .filter((v): v is number => typeof v === "number" && !isNaN(v));

  if (rates.length < 10) throw new Error("Insufficient rate history");
  return rates;
}

// ─── Core analysis ───────────────────────────────────────────────────────────

export async function analyzeForexPair(pair: string): Promise<AIForexSignal> {
  const CACHE_TTL = 3 * 60 * 1000; // 3 minutes
  const cacheKey  = `ai_copilot_${pair.replace("/", "_")}`;
  const hit       = marketCache[cacheKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as AIForexSignal;

  const cfg = SUPPORTED_PAIRS[pair];
  if (!cfg) throw new Error(`Unsupported pair: ${pair}`);

  const rates       = await fetchRates(cfg.base, cfg.target);
  const current     = rates[rates.length - 1];
  const decimals    = cfg.isJPY ? 3 : 5;

  // Indicators
  const sma10       = sma(rates, 10);
  const sma20       = sma(rates, 20);
  const sma50       = sma(rates, 50);
  const roc5        = roc(rates, 5);
  const roc20       = roc(rates, 20);
  const vol20       = stdDev(rates.slice(-20));
  const normVol     = (vol20 / current) * 100;            // volatility as % of price
  const recentSlice = rates.slice(-5);
  const upDays      = recentSlice.filter((r, i) => i > 0 && r > recentSlice[i - 1]).length;

  // ── Agent 1 — Technical (SMA crossover + price location)
  let technical: Vote;
  if (sma10 > sma20 && current > sma20 && sma20 > sma50) technical = "bullish";
  else if (sma10 < sma20 && current < sma20 && sma20 < sma50) technical = "bearish";
  else if (sma10 > sma20 && current > sma20) technical = "bullish";
  else if (sma10 < sma20 && current < sma20) technical = "bearish";
  else technical = "neutral";

  // ── Agent 2 — Momentum (ROC 5-day + 20-day confirmation)
  let momentum: Vote;
  if (roc5 > 0.25 && roc20 > 0)       momentum = "bullish";
  else if (roc5 < -0.25 && roc20 < 0) momentum = "bearish";
  else                                  momentum = "neutral";

  // ── Agent 3 — Sentiment (candle-based: recent close pattern)
  let sentiment: Vote;
  if (upDays >= 4)                          sentiment = "bullish";
  else if (upDays <= 1)                     sentiment = "bearish";
  else if (upDays === 3 && roc5 > 0)        sentiment = "bullish";
  else if (upDays === 2 && roc5 < 0)        sentiment = "bearish";
  else                                       sentiment = "neutral";

  // ── Agent 4 — Fundamentals (long-term 20d trend strength)
  let fundamentals: Vote;
  if (roc20 > 1.2)       fundamentals = "bullish";
  else if (roc20 < -1.2) fundamentals = "bearish";
  else                    fundamentals = "neutral";

  // ── Decision matrix
  const votes       = [technical, momentum, sentiment, fundamentals];
  const bullCount   = votes.filter(v => v === "bullish").length;
  const bearCount   = votes.filter(v => v === "bearish").length;

  let direction: "LONG" | "SHORT" | "NO_TRADE";
  let confidence: number;

  if (bullCount >= 3) {
    direction  = "LONG";
    confidence = 58 + bullCount * 8 + Math.min(Math.abs(roc5) * 4, 14);
  } else if (bearCount >= 3) {
    direction  = "SHORT";
    confidence = 58 + bearCount * 8 + Math.min(Math.abs(roc5) * 4, 14);
  } else if (bullCount === 2 && bearCount === 0) {
    direction  = "LONG";
    confidence = 52 + Math.abs(roc5) * 3;
  } else if (bearCount === 2 && bullCount === 0) {
    direction  = "SHORT";
    confidence = 52 + Math.abs(roc5) * 3;
  } else {
    direction  = "NO_TRADE";
    confidence = 35 + Math.abs(roc5);
  }

  confidence = Math.min(93, Math.max(20, confidence));
  if (confidence < 55) direction = "NO_TRADE";

  // ── Style detection
  let style: "scalp" | "day" | "swing" | "position";
  if      (normVol > 1.5)              style = "scalp";
  else if (normVol > 0.8)              style = "day";
  else if (Math.abs(roc20) > 1.5)     style = "swing";
  else                                 style = "position";

  // ── Entry / SL / TP  (1:2 risk-reward minimum)
  const atrProxy    = vol20 * 1.4;
  const slDist      = Math.max(atrProxy, current * 0.0015);
  const tpDist      = slDist * 2.0;
  const entry       = current;

  const stopLoss    = direction === "SHORT" ? entry + slDist : entry - slDist;
  const takeProfit  = direction === "SHORT" ? entry - tpDist : entry + tpDist;
  const riskReward  = tpDist / slDist;

  // ── Risk level
  let riskLevel: "low" | "medium" | "high";
  if      (normVol > 1.5) riskLevel = "high";
  else if (normVol > 0.7) riskLevel = "medium";
  else                     riskLevel = "low";

  // ── Debate strings
  const sma10Pct  = ((sma10 - sma20) / sma20 * 100).toFixed(3);
  const roc5Lbl   = roc5 >= 0 ? `+${roc5.toFixed(2)}%` : `${roc5.toFixed(2)}%`;
  const roc20Lbl  = roc20 >= 0 ? `+${roc20.toFixed(2)}%` : `${roc20.toFixed(2)}%`;
  const volLbl    = normVol.toFixed(2);
  const fmt       = (n: number) => n.toFixed(decimals);

  const bullDebate = bullCount >= bearCount
    ? `Technical structure favors bulls: SMA10 is ${sma10Pct}% ${parseFloat(sma10Pct) >= 0 ? "above" : "below"} SMA20, price is ${current > sma20 ? "above" : "below"} the 20-day average. 5-day momentum at ${roc5Lbl} and 20-day trend at ${roc20Lbl} support the ${momentum} outlook. ${upDays}/5 recent sessions closed higher.`
    : `Despite majority bearish signals, ${bullCount} agent(s) remain bullish. If price reclaims SMA10 at ${fmt(sma10)}, a reversal toward ${fmt(takeProfit)} is possible. Watch for catalysts that shift momentum.`;

  const bearDebate = bearCount >= bullCount
    ? `${bearCount} agents signal bearish conditions. Price action shows ${upDays}/5 positive closes — weak recovery. 20-day ROC at ${roc20Lbl} indicates sustained ${roc20 < 0 ? "downward pressure" : "indecision"}. Volatility at ${volLbl}% adds risk. SMA alignment is ${technical === "bearish" ? "bearish (SMA10 < SMA20)" : "mixed"}.`
    : `Bearish risks remain: volatility at ${volLbl}% could trigger sharp reversals. ${bearCount} agent(s) flag warning signals. Any negative macro data could quickly push ${pair} toward ${fmt(stopLoss)}.`;

  const judgeDebate = direction === "NO_TRADE"
    ? `Weighing all evidence: ${bullCount} bullish vs ${bearCount} bearish agents. Confidence at ${confidence.toFixed(0)}% falls below the 55% required threshold. Mixed structure and ${normVol > 1 ? "elevated volatility" : "unclear trend"} make this a high-risk entry. Disciplined decision: stand aside and wait for confirmation.`
    : `Verdict: ${direction} on ${pair}. ${Math.max(bullCount, bearCount)}/4 agents aligned. Confidence: ${confidence.toFixed(0)}%. Entry ${fmt(entry)} | SL ${fmt(stopLoss)} | TP ${fmt(takeProfit)} | RR 1:${riskReward.toFixed(1)}. Style: ${style}. ${riskLevel === "high" ? "Reduce position size due to high volatility." : "Standard position sizing applies."}`;

  const reasoning = direction === "NO_TRADE"
    ? `Analysis of ${pair} shows conflicting signals across the four analytical agents (${bullCount} bullish, ${bearCount} bearish, ${4 - bullCount - bearCount} neutral). Technical: ${technical} — SMA10 is ${sma10Pct}% from SMA20. Momentum: ${momentum} at ${roc5Lbl} (5d) / ${roc20Lbl} (20d). Sentiment: ${upDays}/5 recent closes higher. Fundamentals: ${fundamentals} based on 20-day trend. Volatility: ${volLbl}%. Confidence ${confidence.toFixed(0)}% < 55% threshold → NO TRADE. Wait for clearer market structure before risking capital.`
    : `${pair} shows a ${direction} setup with ${confidence.toFixed(0)}% confidence. Four analytical agents: Technical (${technical}): SMA10 at ${fmt(sma10)}, SMA20 at ${fmt(sma20)}, price ${current > sma20 ? "above" : "below"} average. Momentum (${momentum}): ${roc5Lbl} over 5 days, ${roc20Lbl} over 20 days. Sentiment (${sentiment}): ${upDays}/5 recent sessions positive. Fundamentals (${fundamentals}): sustained ${roc20Lbl} 20-day trend. Trade plan: Enter ${direction} at ${fmt(entry)}, stop loss ${fmt(stopLoss)}, take profit ${fmt(takeProfit)}. Style: ${style} trade. Risk/Reward: 1:${riskReward.toFixed(1)}. Risk level: ${riskLevel}. ${riskLevel === "high" ? "⚠️ High volatility detected — consider reducing position size." : riskLevel === "medium" ? "Moderate conditions — use standard risk management." : "Favorable low-volatility environment for clean entry."}`;

  const signal: AIForexSignal = {
    pair,
    direction,
    style,
    entry:      parseFloat(fmt(entry)),
    stopLoss:   parseFloat(fmt(stopLoss)),
    takeProfit: parseFloat(fmt(takeProfit)),
    confidence: parseFloat(confidence.toFixed(1)),
    riskReward: parseFloat(riskReward.toFixed(2)),
    riskLevel,
    agentsConsensus: { technical, momentum, sentiment, fundamentals },
    debate: { bull: bullDebate, bear: bearDebate, judge: judgeDebate },
    reasoning,
    timestamp: new Date().toISOString(),
  };

  marketCache[cacheKey] = { data: signal, ts: Date.now() };
  return signal;
}
