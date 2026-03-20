// ─── AI Forex Copilot — Real Technical Analysis Engine ───────────────────────
// Forex  → Frankfurter API (free, no key)
// XAU/USD, BTC/USD → CryptoCompare histoday API (free, no key)
// Indicator periods adapt to user-chosen trading style (scalp / day / swing)

import { marketCache } from "./market-cache";

const FRANKFURTER_BASE = "https://api.frankfurter.app";
const CC_BASE          = "https://min-api.cryptocompare.com/data/v2/histoday";

export type TradingStyle = "scalp" | "day" | "swing";

export const SUPPORTED_PAIRS: Record<string, {
  base: string; target: string; decimals: number; isCrypto: boolean; pip: number;
}> = {
  "XAU/USD": { base: "PAXG", target: "USD", decimals: 2, isCrypto: true,  pip: 0.10   },
  "BTC/USD": { base: "BTC",  target: "USD", decimals: 2, isCrypto: true,  pip: 1.00   },
  "EUR/USD": { base: "EUR",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "GBP/USD": { base: "GBP",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/JPY": { base: "USD",  target: "JPY", decimals: 3, isCrypto: false, pip: 0.01   },
  "AUD/USD": { base: "AUD",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/CHF": { base: "USD",  target: "CHF", decimals: 5, isCrypto: false, pip: 0.0001 },
  "NZD/USD": { base: "NZD",  target: "USD", decimals: 5, isCrypto: false, pip: 0.0001 },
  "USD/CAD": { base: "USD",  target: "CAD", decimals: 5, isCrypto: false, pip: 0.0001 },
};

// ─── Style config ─────────────────────────────────────────────────────────────
// Each style maps to different indicator periods + SL/TP multipliers.
// We use daily close data as the base; period length simulates the TF perspective.

const STYLE_CONFIG: Record<TradingStyle, {
  smaFast:   number;
  smaSlow:   number;
  smaTrend:  number;
  rocShort:  number;
  rocLong:   number;
  sentLen:   number;       // lookback for candle sentiment
  rocThreshFx:     number; // ROC threshold for forex
  rocThreshCrypto: number; // ROC threshold for crypto
  rocLongThreshFx:     number;
  rocLongThreshCrypto: number;
  slMult:    number;       // SL = atr * slMult
  tpMult:    number;       // TP = SL * tpMult (always 1:2 RR)
  tfLabel:   string;       // Display label
  volWindow: number;       // volatility look-back
}> = {
  scalp: {
    smaFast: 3,  smaSlow: 7,  smaTrend: 14,
    rocShort: 2, rocLong: 5,  sentLen: 3,
    rocThreshFx: 0.06, rocThreshCrypto: 0.5,
    rocLongThreshFx: 0.3, rocLongThreshCrypto: 2.0,
    slMult: 0.5,  tpMult: 2.0, tfLabel: "M1 – M15",
    volWindow: 7,
  },
  day: {
    smaFast: 10, smaSlow: 20, smaTrend: 50,
    rocShort: 5, rocLong: 20, sentLen: 5,
    rocThreshFx: 0.25, rocThreshCrypto: 1.5,
    rocLongThreshFx: 1.2, rocLongThreshCrypto: 5.0,
    slMult: 1.0,  tpMult: 2.0, tfLabel: "H1 – H4",
    volWindow: 14,
  },
  swing: {
    smaFast: 20, smaSlow: 50, smaTrend: 100,
    rocShort: 10, rocLong: 30, sentLen: 10,
    rocThreshFx: 0.5, rocThreshCrypto: 2.5,
    rocLongThreshFx: 2.5, rocLongThreshCrypto: 8.0,
    slMult: 2.2,  tpMult: 2.0, tfLabel: "D1 – W1",
    volWindow: 30,
  },
};

export interface AIForexSignal {
  pair: string;
  tradingStyle: TradingStyle;
  tfLabel: string;
  direction: "LONG" | "SHORT" | "NO_TRADE";
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

function stdDev(arr: number[], window: number): number {
  const slice = arr.slice(-Math.min(window, arr.length));
  const mean  = slice.reduce((a, b) => a + b, 0) / slice.length;
  return Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
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
  start.setDate(start.getDate() - 120); // 120 days for swing indicator coverage
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const url  = `${FRANKFURTER_BASE}/${fmt(start)}..${fmt(end)}?from=${base}&to=${target}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`Frankfurter API ${resp.status}`);

  const json  = await resp.json() as { rates: Record<string, Record<string, number>> };
  const rates = Object.values(json.rates)
    .map(r => r[target])
    .filter((v): v is number => typeof v === "number" && !isNaN(v));

  if (rates.length < 15) throw new Error("Insufficient forex rate history");
  return rates;
}

async function fetchCryptoRates(symbol: string): Promise<number[]> {
  const url  = `${CC_BASE}?fsym=${symbol}&tsym=USD&limit=120`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) throw new Error(`CryptoCompare API ${resp.status}`);

  const json  = await resp.json() as { Data: { Data: Array<{ close: number }> } };
  const rates = json.Data.Data
    .map(d => d.close)
    .filter((v): v is number => typeof v === "number" && v > 0);

  if (rates.length < 15) throw new Error("Insufficient crypto rate history");
  return rates;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

export async function analyzeForexPair(pair: string, tradingStyle: TradingStyle = "day"): Promise<AIForexSignal> {
  const CACHE_TTL = 3 * 60 * 1000;
  const cacheKey  = `ai_copilot_${pair.replace("/", "_")}_${tradingStyle}`;
  const hit       = marketCache[cacheKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as AIForexSignal;

  const cfg   = SUPPORTED_PAIRS[pair];
  if (!cfg) throw new Error(`Unsupported pair: ${pair}`);

  const sc    = STYLE_CONFIG[tradingStyle];
  const rates = cfg.isCrypto
    ? await fetchCryptoRates(cfg.base)
    : await fetchForexRates(cfg.base, cfg.target);

  const current  = rates[rates.length - 1];
  const decimals = cfg.decimals;

  // ── Style-aware indicators
  const smaFast   = sma(rates, sc.smaFast);
  const smaSlow   = sma(rates, sc.smaSlow);
  const smaTrend  = sma(rates, sc.smaTrend);
  const rocShort  = roc(rates, sc.rocShort);
  const rocLong   = roc(rates, sc.rocLong);
  const vol       = stdDev(rates, sc.volWindow);
  const normVol   = (vol / current) * 100;

  const recentSlice = rates.slice(-sc.sentLen);
  const upCandles   = recentSlice.filter((r, i) => i > 0 && r > recentSlice[i - 1]).length;
  const totalCandles = sc.sentLen - 1;

  // Thresholds scale with style
  const rocThresh     = cfg.isCrypto ? sc.rocThreshCrypto     : sc.rocThreshFx;
  const rocLongThresh = cfg.isCrypto ? sc.rocLongThreshCrypto : sc.rocLongThreshFx;

  // ── Agent 1: Technical (SMA crossover — style-aware periods)
  let technical: Vote;
  if      (smaFast > smaSlow && current > smaSlow && smaSlow > smaTrend) technical = "bullish";
  else if (smaFast < smaSlow && current < smaSlow && smaSlow < smaTrend) technical = "bearish";
  else if (smaFast > smaSlow && current > smaSlow)                       technical = "bullish";
  else if (smaFast < smaSlow && current < smaSlow)                       technical = "bearish";
  else                                                                     technical = "neutral";

  // ── Agent 2: Momentum (ROC — style-aware periods)
  let momentum: Vote;
  if      (rocShort > rocThresh  && rocLong > 0)  momentum = "bullish";
  else if (rocShort < -rocThresh && rocLong < 0)  momentum = "bearish";
  else                                              momentum = "neutral";

  // ── Agent 3: Sentiment (candle pattern — style-aware lookback)
  const sentThreshBull = Math.ceil(totalCandles * 0.65);
  const sentThreshBear = Math.floor(totalCandles * 0.35);
  let sentiment: Vote;
  if      (upCandles >= sentThreshBull)                      sentiment = "bullish";
  else if (upCandles <= sentThreshBear)                      sentiment = "bearish";
  else if (upCandles > totalCandles / 2 && rocShort > 0)    sentiment = "bullish";
  else if (upCandles < totalCandles / 2 && rocShort < 0)    sentiment = "bearish";
  else                                                        sentiment = "neutral";

  // ── Agent 4: Fundamentals (long-term trend via rocLong period)
  let fundamentals: Vote;
  if      (rocLong > rocLongThresh)  fundamentals = "bullish";
  else if (rocLong < -rocLongThresh) fundamentals = "bearish";
  else                                fundamentals = "neutral";

  // ── Decision matrix
  const votes     = [technical, momentum, sentiment, fundamentals];
  const bullCount = votes.filter(v => v === "bullish").length;
  const bearCount = votes.filter(v => v === "bearish").length;

  let direction: "LONG" | "SHORT" | "NO_TRADE";
  let confidence: number;

  if      (bullCount >= 3)                     { direction = "LONG";     confidence = 58 + bullCount * 8 + Math.min(Math.abs(rocShort) * 2, 10); }
  else if (bearCount >= 3)                     { direction = "SHORT";    confidence = 58 + bearCount * 8 + Math.min(Math.abs(rocShort) * 2, 10); }
  else if (bullCount === 2 && bearCount === 0) { direction = "LONG";     confidence = 52 + Math.abs(rocShort); }
  else if (bearCount === 2 && bullCount === 0) { direction = "SHORT";    confidence = 52 + Math.abs(rocShort); }
  else                                          { direction = "NO_TRADE"; confidence = 35 + Math.abs(rocShort) * 0.5; }

  confidence = Math.min(93, Math.max(20, confidence));
  if (confidence < 55) direction = "NO_TRADE";

  // ── SL / TP (style-scaled ATR proxy)
  const atrBase  = vol * 1.4;
  const minSl    = cfg.isCrypto ? current * 0.008 : current * 0.001;
  const slDist   = Math.max(atrBase, minSl) * sc.slMult;
  const tpDist   = slDist * sc.tpMult;

  const entry      = current;
  const stopLoss   = direction === "SHORT" ? entry + slDist : entry - slDist;
  const takeProfit = direction === "SHORT" ? entry - tpDist : entry + tpDist;
  const riskReward = parseFloat((tpDist / slDist).toFixed(2));

  // ── Risk level (volatility relative to style)
  const volHighThresh = cfg.isCrypto ? 4 : (tradingStyle === "scalp" ? 0.8 : tradingStyle === "day" ? 1.5 : 2.5);
  const volMedThresh  = cfg.isCrypto ? 2 : (tradingStyle === "scalp" ? 0.4 : tradingStyle === "day" ? 0.7 : 1.2);
  let riskLevel: "low" | "medium" | "high";
  if      (normVol > volHighThresh) riskLevel = "high";
  else if (normVol > volMedThresh)  riskLevel = "medium";
  else                               riskLevel = "low";

  // ── Text generation
  const fmt       = (n: number) => n.toFixed(decimals);
  const smaPct    = ((smaFast - smaSlow) / smaSlow * 100).toFixed(3);
  const rocSLbl   = rocShort >= 0 ? `+${rocShort.toFixed(2)}%` : `${rocShort.toFixed(2)}%`;
  const rocLLbl   = rocLong  >= 0 ? `+${rocLong.toFixed(2)}%`  : `${rocLong.toFixed(2)}%`;
  const volLbl    = normVol.toFixed(2);
  const tfCtx     = `${sc.tfLabel} equivalent`;

  const assetLabel = cfg.isCrypto
    ? (pair === "XAU/USD" ? "Gold (XAU/USD)" : "Bitcoin (BTC/USD)")
    : pair;

  const styleNote: Record<TradingStyle, string> = {
    scalp: "Short-term scalp signals — fast momentum, tight SL/TP.",
    day:   "Day trading signals — intraday momentum and trend.",
    swing: "Swing trade signals — multi-day trend and momentum shift.",
  };

  const bullDebate = bullCount >= bearCount
    ? `${assetLabel} [${tfCtx}] favors bulls. SMA${sc.smaFast} is ${smaPct}% ${parseFloat(smaPct) >= 0 ? "above" : "below"} SMA${sc.smaSlow}. ${sc.rocShort}-period ROC: ${rocSLbl}, ${sc.rocLong}-period trend: ${rocLLbl}. ${upCandles}/${totalCandles} recent candles closed higher. ${cfg.isCrypto ? "Risk-on macro environment supports the bullish thesis." : "SMA alignment confirms upward pressure."}`
    : `Despite majority bearish signals, ${bullCount} agent(s) signal bullish. A SMA${sc.smaFast} reclaim at ${fmt(smaFast)} could trigger a move toward ${fmt(Math.abs(takeProfit))}.`;

  const bearDebate = bearCount >= bullCount
    ? `${bearCount} agents signal bearish for ${assetLabel} on ${tfCtx}. ${upCandles}/${totalCandles} recent candles up — weak recovery. ${sc.rocLong}-period ROC: ${rocLLbl}. Volatility: ${volLbl}%. SMA alignment: ${technical === "bearish" ? `bearish (SMA${sc.smaFast} < SMA${sc.smaSlow})` : "mixed"}.`
    : `Bearish risks: volatility at ${volLbl}%. ${bearCount} agent(s) flag caution signals. ${cfg.isCrypto ? "Macro uncertainty could accelerate selling." : "Adverse macro events could reverse the trend quickly."}`;

  const judgeDebate = direction === "NO_TRADE"
    ? `Evidence: ${bullCount} bullish vs ${bearCount} bearish agents on ${tfCtx}. Confidence ${confidence.toFixed(0)}% < 55% threshold. Unclear structure — disciplined action is to wait for a cleaner setup.`
    : `Verdict: ${direction} on ${assetLabel} [${tfCtx}]. ${Math.max(bullCount, bearCount)}/4 agents aligned. Confidence: ${confidence.toFixed(0)}%. Entry ${fmt(entry)} | SL ${fmt(stopLoss)} | TP ${fmt(takeProfit)} | RR 1:${riskReward}. ${riskLevel === "high" ? "Reduce position size — elevated volatility." : "Standard position sizing applies."}`;

  const reasoning = direction === "NO_TRADE"
    ? `[${tradingStyle.toUpperCase()} — ${sc.tfLabel}] ${assetLabel} analysis: ${bullCount} bullish, ${bearCount} bearish, ${4 - bullCount - bearCount} neutral signals. SMA${sc.smaFast}=${fmt(smaFast)}, SMA${sc.smaSlow}=${fmt(smaSlow)}. ROC(${sc.rocShort})=${rocSLbl}, ROC(${sc.rocLong})=${rocLLbl}. Sentiment: ${upCandles}/${totalCandles} candles up. Vol: ${volLbl}%. Confidence ${confidence.toFixed(0)}% < 55% → NO TRADE. Wait for clearer ${tradingStyle} setup.`
    : `[${tradingStyle.toUpperCase()} — ${sc.tfLabel}] ${assetLabel}: ${direction} signal at ${confidence.toFixed(0)}% confidence. Technical (${technical}): SMA${sc.smaFast}=${fmt(smaFast)} ${parseFloat(smaPct) >= 0 ? "above" : "below"} SMA${sc.smaSlow}=${fmt(smaSlow)}, price ${current > smaSlow ? "above" : "below"} slow MA. Momentum (${momentum}): ${rocSLbl} / ${rocLLbl}. Sentiment (${sentiment}): ${upCandles}/${totalCandles} candles up. Fundamentals (${fundamentals}): ${rocLLbl} long-term. Plan: ${direction} @ ${fmt(entry)}, SL ${fmt(stopLoss)}, TP ${fmt(takeProfit)}, RR 1:${riskReward}. Risk: ${riskLevel}. ${styleNote[tradingStyle]} ${riskLevel === "high" ? "⚠️ High volatility — cut lot size." : riskLevel === "medium" ? "Moderate volatility — standard risk." : "Low volatility — clean entry conditions."}`;

  const signal: AIForexSignal = {
    pair,
    tradingStyle,
    tfLabel: sc.tfLabel,
    direction,
    entry:      parseFloat(fmt(entry)),
    stopLoss:   parseFloat(fmt(stopLoss)),
    takeProfit: parseFloat(fmt(takeProfit)),
    confidence: parseFloat(confidence.toFixed(1)),
    riskReward,
    riskLevel,
    agentsConsensus: { technical, momentum, sentiment, fundamentals },
    debate: { bull: bullDebate, bear: bearDebate, judge: judgeDebate },
    reasoning,
    timestamp: new Date().toISOString(),
  };

  marketCache[cacheKey] = { data: signal, ts: Date.now() };
  return signal;
}
