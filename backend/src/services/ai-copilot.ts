// ─── AI Forex Copilot — Real Technical Analysis Engine ───────────────────────
// Forex pairs  → Frankfurter API (free, no key)
// XAU/USD, BTC/USD → CryptoCompare histoday API (free, no key)
// Calculates genuine technical indicators — NO random signals

import { marketCache } from "./market-cache";

const FRANKFURTER_BASE = "https://api.frankfurter.app";
const CC_BASE          = "https://min-api.cryptocompare.com/data/v2/histoday";

export const SUPPORTED_PAIRS: Record<string, {
  base: string; target: string; decimals: number; isCrypto: boolean; pip: number;
}> = {
  // ── Core pairs (XAU & BTC — main focus) ──────────────────────────────────
  "XAU/USD": { base: "PAXG", target: "USD", decimals: 2, isCrypto: true,  pip: 0.10  },
  "BTC/USD": { base: "BTC",  target: "USD", decimals: 2, isCrypto: true,  pip: 1.00  },
  // ── Forex pairs ───────────────────────────────────────────────────────────
  "EUR/USD": { base: "EUR",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "GBP/USD": { base: "GBP",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/JPY": { base: "USD",  target: "JPY", decimals: 3, isCrypto: false, pip: 0.01   },
  "AUD/USD": { base: "AUD",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/CHF": { base: "USD",  target: "CHF", decimals: 5, isCrypto: false, pip: 0.0001 },
  "NZD/USD": { base: "NZD",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/CAD": { base: "USD",  target: "CAD", decimals: 5, isCrypto: false, pip: 0.0001 },
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

// ─── Math helpers ─────────────────────────────────────────────────────────────

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

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function fetchForexRates(base: string, target: string): Promise<number[]> {
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

  if (rates.length < 10) throw new Error("Insufficient forex rate history");
  return rates;
}

async function fetchCryptoRates(symbol: string): Promise<number[]> {
  const url  = `${CC_BASE}?fsym=${symbol}&tsym=USD&limit=60`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`CryptoCompare API ${resp.status}`);

  const json  = await resp.json() as { Data: { Data: Array<{ close: number }> } };
  const rates = json.Data.Data
    .map(d => d.close)
    .filter((v): v is number => typeof v === "number" && v > 0);

  if (rates.length < 10) throw new Error("Insufficient crypto rate history");
  return rates;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

export async function analyzeForexPair(pair: string): Promise<AIForexSignal> {
  const CACHE_TTL = 3 * 60 * 1000;
  const cacheKey  = `ai_copilot_${pair.replace("/", "_")}`;
  const hit       = marketCache[cacheKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as AIForexSignal;

  const cfg = SUPPORTED_PAIRS[pair];
  if (!cfg) throw new Error(`Unsupported pair: ${pair}`);

  const rates = cfg.isCrypto
    ? await fetchCryptoRates(cfg.base)
    : await fetchForexRates(cfg.base, cfg.target);

  const current  = rates[rates.length - 1];
  const decimals = cfg.decimals;

  // ── Indicators
  const sma10       = sma(rates, 10);
  const sma20       = sma(rates, 20);
  const sma50       = sma(rates, 50);
  const roc5        = roc(rates, 5);
  const roc20       = roc(rates, 20);
  const vol20       = stdDev(rates.slice(-20));
  const normVol     = (vol20 / current) * 100;
  const recentSlice = rates.slice(-5);
  const upDays      = recentSlice.filter((r, i) => i > 0 && r > recentSlice[i - 1]).length;

  // Crypto-specific: tighter thresholds because crypto moves more
  const rocThresh    = cfg.isCrypto ? 1.5 : 0.25;
  const roc20Thresh  = cfg.isCrypto ? 5.0 : 1.2;

  // ── Agent 1: Technical (SMA crossover)
  let technical: Vote;
  if      (sma10 > sma20 && current > sma20 && sma20 > sma50) technical = "bullish";
  else if (sma10 < sma20 && current < sma20 && sma20 < sma50) technical = "bearish";
  else if (sma10 > sma20 && current > sma20)                  technical = "bullish";
  else if (sma10 < sma20 && current < sma20)                  technical = "bearish";
  else                                                          technical = "neutral";

  // ── Agent 2: Momentum (ROC)
  let momentum: Vote;
  if      (roc5 > rocThresh  && roc20 > 0)  momentum = "bullish";
  else if (roc5 < -rocThresh && roc20 < 0)  momentum = "bearish";
  else                                        momentum = "neutral";

  // ── Agent 3: Sentiment (recent candle pattern)
  let sentiment: Vote;
  if      (upDays >= 4)                   sentiment = "bullish";
  else if (upDays <= 1)                   sentiment = "bearish";
  else if (upDays === 3 && roc5 > 0)      sentiment = "bullish";
  else if (upDays === 2 && roc5 < 0)      sentiment = "bearish";
  else                                     sentiment = "neutral";

  // ── Agent 4: Fundamentals (long-term trend)
  let fundamentals: Vote;
  if      (roc20 > roc20Thresh)  fundamentals = "bullish";
  else if (roc20 < -roc20Thresh) fundamentals = "bearish";
  else                            fundamentals = "neutral";

  // ── Decision matrix
  const votes     = [technical, momentum, sentiment, fundamentals];
  const bullCount = votes.filter(v => v === "bullish").length;
  const bearCount = votes.filter(v => v === "bearish").length;

  let direction: "LONG" | "SHORT" | "NO_TRADE";
  let confidence: number;

  if      (bullCount >= 3)                        { direction = "LONG";     confidence = 58 + bullCount * 8 + Math.min(Math.abs(roc5) * 2, 12); }
  else if (bearCount >= 3)                        { direction = "SHORT";    confidence = 58 + bearCount * 8 + Math.min(Math.abs(roc5) * 2, 12); }
  else if (bullCount === 2 && bearCount === 0)    { direction = "LONG";     confidence = 52 + Math.abs(roc5); }
  else if (bearCount === 2 && bullCount === 0)    { direction = "SHORT";    confidence = 52 + Math.abs(roc5); }
  else                                             { direction = "NO_TRADE"; confidence = 35 + Math.abs(roc5) * 0.5; }

  confidence = Math.min(93, Math.max(20, confidence));
  if (confidence < 55) direction = "NO_TRADE";

  // ── Style detection
  let style: "scalp" | "day" | "swing" | "position";
  if      (normVol > (cfg.isCrypto ? 4 : 1.5)) style = "scalp";
  else if (normVol > (cfg.isCrypto ? 2 : 0.8)) style = "day";
  else if (Math.abs(roc20) > (cfg.isCrypto ? 8 : 1.5)) style = "swing";
  else                                           style = "position";

  // ── Entry / SL / TP
  const atrProxy = vol20 * 1.4;
  const minSl    = cfg.isCrypto ? current * 0.008 : current * 0.0015;
  const slDist   = Math.max(atrProxy, minSl);
  const tpDist   = slDist * 2.0;

  const entry      = current;
  const stopLoss   = direction === "SHORT" ? entry + slDist : entry - slDist;
  const takeProfit = direction === "SHORT" ? entry - tpDist : entry + tpDist;
  const riskReward = tpDist / slDist;

  // ── Risk level
  let riskLevel: "low" | "medium" | "high";
  if      (normVol > (cfg.isCrypto ? 4 : 1.5)) riskLevel = "high";
  else if (normVol > (cfg.isCrypto ? 2 : 0.7)) riskLevel = "medium";
  else                                           riskLevel = "low";

  // ── Debate & Reasoning strings
  const fmt       = (n: number) => n.toFixed(decimals);
  const sma10Pct  = ((sma10 - sma20) / sma20 * 100).toFixed(3);
  const roc5Lbl   = roc5  >= 0 ? `+${roc5.toFixed(2)}%`  : `${roc5.toFixed(2)}%`;
  const roc20Lbl  = roc20 >= 0 ? `+${roc20.toFixed(2)}%` : `${roc20.toFixed(2)}%`;
  const volLbl    = normVol.toFixed(2);

  const assetLabel = cfg.isCrypto
    ? (pair === "XAU/USD" ? "Gold (XAU)" : "Bitcoin (BTC)")
    : pair;

  const bullDebate = bullCount >= bearCount
    ? `${assetLabel} technical structure favors bulls: SMA10 is ${sma10Pct}% ${parseFloat(sma10Pct) >= 0 ? "above" : "below"} SMA20. 5-day momentum at ${roc5Lbl}, 20-day trend at ${roc20Lbl}. ${upDays}/5 recent sessions closed higher. ${cfg.isCrypto ? "Crypto momentum and macro risk-on sentiment support the bullish thesis." : "SMA alignment confirms upward bias."}`
    : `Despite majority bearish signals, ${bullCount} agent(s) remain bullish. A reclaim of SMA10 at ${fmt(sma10)} could trigger a reversal toward ${fmt(takeProfit)}.`;

  const bearDebate = bearCount >= bullCount
    ? `${bearCount} agents signal bearish conditions for ${assetLabel}. ${upDays}/5 recent closes positive — weak recovery attempt. 20-day ROC at ${roc20Lbl}. Volatility at ${volLbl}%${cfg.isCrypto ? " — elevated for this asset class" : ""}. SMA alignment: ${technical === "bearish" ? "bearish (SMA10 below SMA20)" : "mixed signals"}.`
    : `Bearish risks remain: volatility at ${volLbl}%. ${bearCount} agent(s) flag warning signals. ${cfg.isCrypto ? "Macro uncertainty and regulatory headwinds could accelerate selling pressure." : "Any adverse macro events could quickly reverse the current trend."}`;

  const judgeDebate = direction === "NO_TRADE"
    ? `Weighing all evidence: ${bullCount} bullish vs ${bearCount} bearish agents. Confidence ${confidence.toFixed(0)}% is below the 55% threshold. ${cfg.isCrypto ? "Crypto markets show high unpredictability here" : "Mixed forex structure"} — disciplined action is to stand aside.`
    : `Verdict: ${direction} on ${assetLabel}. ${Math.max(bullCount, bearCount)}/4 agents aligned. Confidence: ${confidence.toFixed(0)}%. Entry ${fmt(entry)} | SL ${fmt(stopLoss)} | TP ${fmt(takeProfit)} | RR 1:${riskReward.toFixed(1)}. Style: ${style}. ${riskLevel === "high" ? "Reduce position size — high volatility." : "Standard position sizing applies."}`;

  const reasoning = direction === "NO_TRADE"
    ? `Analysis of ${assetLabel} shows conflicting signals (${bullCount} bullish, ${bearCount} bearish, ${4 - bullCount - bearCount} neutral). Technical: ${technical} — SMA10 ${sma10Pct}% from SMA20. Momentum: ${momentum} at ${roc5Lbl} (5d) / ${roc20Lbl} (20d). Sentiment: ${upDays}/5 recent sessions positive. Fundamentals: ${fundamentals}. Volatility: ${volLbl}%. Confidence ${confidence.toFixed(0)}% < 55% threshold → NO TRADE. Wait for clearer market structure.`
    : `${assetLabel} shows a ${direction} setup (${confidence.toFixed(0)}% confidence). Technical (${technical}): SMA10 ${fmt(sma10)}, SMA20 ${fmt(sma20)}, price ${current > sma20 ? "above" : "below"} average. Momentum (${momentum}): ${roc5Lbl} / ${roc20Lbl}. Sentiment (${sentiment}): ${upDays}/5 sessions positive. Fundamentals (${fundamentals}): ${roc20Lbl} 20d trend. Plan: ${direction} at ${fmt(entry)}, SL ${fmt(stopLoss)}, TP ${fmt(takeProfit)}, style: ${style}, RR 1:${riskReward.toFixed(1)}. Risk: ${riskLevel}. ${riskLevel === "high" ? "⚠️ High volatility — reduce position size." : riskLevel === "medium" ? "Moderate conditions — standard risk management." : "Favorable low-volatility entry conditions."}`;

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
