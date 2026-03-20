// ─── AI Forex Copilot — Real Technical Analysis Engine ───────────────────────
// Forex       → Frankfurter API (free, no key)
// XAU/USD     → Yahoo Finance GC=F  (Gold Futures, free, no rate-limit)
// BTC/USD     → Yahoo Finance BTC-USD (free, no rate-limit)
// SL/TP: ATR-based, style-adaptive, pip-capped. RR enforced ≥ 1.5.

import { marketCache } from "./market-cache";

const FRANKFURTER_BASE = "https://api.frankfurter.app";
const YAHOO_BASE       = "https://query1.finance.yahoo.com/v8/finance/chart";

export type TradingStyle = "scalp" | "day" | "swing";

// ─── Pair category for SL/TP bounds ──────────────────────────────────────────
// Each pair gets a category that defines realistic min/max SL distances per style.
// This ensures Scalp < Day < Swing in a meaningful, market-realistic way.
type PairCategory = "gold" | "oil" | "crypto" | "forex";

// minPips / maxPips for each style: SL is always clamped to [minPips * pip, maxPips * pip]
// The ATR-fraction still shapes the SL, but these bounds prevent all styles looking the same.
const PAIR_BOUNDS: Record<PairCategory, Record<TradingStyle, { minPips: number; maxPips: number; tpMult: number }>> = {
  gold: {
    //              ATR~$20 daily. pip=$0.10
    scalp: { minPips: 10,  maxPips: 60,  tpMult: 1.5 },  // SL $1–$6
    day:   { minPips: 80,  maxPips: 280, tpMult: 2.2 },  // SL $8–$28
    swing: { minPips: 220, maxPips: 700, tpMult: 3.0 },  // SL $22–$70
  },
  oil: {
    //              ATR~$2 daily. pip=$0.01
    scalp: { minPips: 15,  maxPips: 80,  tpMult: 1.5 },  // SL $0.15–$0.80
    day:   { minPips: 80,  maxPips: 320, tpMult: 2.2 },  // SL $0.80–$3.20
    swing: { minPips: 200, maxPips: 900, tpMult: 3.0 },  // SL $2.00–$9.00
  },
  crypto: {
    //              ATR~$2000 daily. pip=$1
    scalp: { minPips: 50,   maxPips: 500,  tpMult: 1.5 }, // SL $50–$500
    day:   { minPips: 500,  maxPips: 2200, tpMult: 2.2 }, // SL $500–$2200
    swing: { minPips: 1800, maxPips: 6000, tpMult: 3.0 }, // SL $1800–$6000
  },
  forex: {
    //              ATR~70 pips daily. pip=0.0001
    scalp: { minPips: 4,   maxPips: 28,  tpMult: 1.5 }, // 4–28 pips
    day:   { minPips: 28,  maxPips: 90,  tpMult: 2.2 }, // 28–90 pips
    swing: { minPips: 70,  maxPips: 220, tpMult: 3.0 }, // 70–220 pips
  },
};

function getPairCategory(pair: string): PairCategory {
  if (pair === "XAU/USD")  return "gold";
  if (pair === "USOil")    return "oil";
  if (pair === "BTC/USD")  return "crypto";
  return "forex";
}

export const SUPPORTED_PAIRS: Record<string, {
  base: string; target: string; decimals: number; yahooTicker?: string; pip: number;
}> = {
  "XAU/USD": { base: "XAU", target: "USD", decimals: 2, yahooTicker: "GC=F",    pip: 0.10   },
  "BTC/USD": { base: "BTC", target: "USD", decimals: 2, yahooTicker: "BTC-USD", pip: 1.00   },
  "USOil":   { base: "OIL", target: "USD", decimals: 2, yahooTicker: "CL=F",    pip: 0.01   },
  "EUR/USD": { base: "EUR", target: "USD", decimals: 5, pip: 0.0001 },
  "GBP/USD": { base: "GBP", target: "USD", decimals: 5, pip: 0.0001 },
  "USD/JPY": { base: "USD", target: "JPY", decimals: 3, pip: 0.01   },
  "AUD/USD": { base: "AUD", target: "USD", decimals: 5, pip: 0.0001 },
  "USD/CHF": { base: "USD", target: "CHF", decimals: 5, pip: 0.0001 },
  "NZD/USD": { base: "NZD", target: "USD", decimals: 5, pip: 0.0001 },
  "USD/CAD": { base: "USD", target: "CAD", decimals: 5, pip: 0.0001 },
};

// ─── Style config ─────────────────────────────────────────────────────────────
// atrFraction: fraction of daily ATR used as base SL distance (simulates TF)
// maxPips:     hard cap on SL in pip units → prevents unrealistic wide stops
// tpMult:      TP = SL * tpMult (minimum RR enforced at 1.5)
// minRR:       minimum required Risk:Reward

const STYLE_CONFIG: Record<TradingStyle, {
  // SMA / ROC indicator periods
  smaFast:   number;
  smaSlow:   number;
  smaTrend:  number;
  rocShort:  number;
  rocLong:   number;
  sentLen:   number;
  rocThreshFx:          number;
  rocThreshCrypto:      number;
  rocLongThreshFx:      number;
  rocLongThreshCrypto:  number;
  volWindow: number;
  // SL/TP
  atrFraction: number;
  maxPips:     number;
  tpMult:      number;
  minRR:       number;
  // Meta
  tfLabel:          string;
  durationEstimate: string;
}> = {
  scalp: {
    smaFast: 3,  smaSlow: 7,  smaTrend: 14,
    rocShort: 2, rocLong: 5,  sentLen: 3,
    rocThreshFx: 0.06, rocThreshCrypto: 0.5,
    rocLongThreshFx: 0.3, rocLongThreshCrypto: 2.0,
    volWindow: 7,
    atrFraction: 0.10, maxPips: 50,  tpMult: 1.5, minRR: 1.5,
    tfLabel: "M1 – M15", durationEstimate: "15 – 60 min",
  },
  day: {
    smaFast: 10, smaSlow: 20, smaTrend: 50,
    rocShort: 5, rocLong: 20, sentLen: 5,
    rocThreshFx: 0.25, rocThreshCrypto: 1.5,
    rocLongThreshFx: 1.2, rocLongThreshCrypto: 5.0,
    volWindow: 14,
    atrFraction: 0.50, maxPips: 150, tpMult: 2.0, minRR: 1.5,
    tfLabel: "H1 – H4", durationEstimate: "2 – 8 hours",
  },
  swing: {
    smaFast: 20, smaSlow: 50, smaTrend: 100,
    rocShort: 10, rocLong: 30, sentLen: 10,
    rocThreshFx: 0.5, rocThreshCrypto: 2.5,
    rocLongThreshFx: 2.5, rocLongThreshCrypto: 8.0,
    volWindow: 30,
    atrFraction: 1.50, maxPips: 400, tpMult: 3.0, minRR: 1.5,
    tfLabel: "D1 – W1", durationEstimate: "2 – 7 days",
  },
};

export interface AIForexSignal {
  pair: string;
  tradingStyle: TradingStyle;
  tfLabel: string;
  durationEstimate: string;
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

// ─── OHLCV data structure ─────────────────────────────────────────────────────
interface OHLCVBar { open: number; high: number; low: number; close: number; }

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

/**
 * True ATR using OHLCV bars (Wilder method).
 * When only close prices are available, falls back to average |Δclose|.
 */
function calculateATR(bars: OHLCVBar[], period = 14): number {
  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h  = bars[i].high;
    const l  = bars[i].low;
    const pc = bars[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const slice = trueRanges.slice(-Math.min(period, trueRanges.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/**
 * Approximate ATR from close-only data: average absolute daily change.
 */
function approxATR(closes: number[], period = 14): number {
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(Math.abs(closes[i] - closes[i - 1]));
  }
  const slice = changes.slice(-Math.min(period, changes.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ─── SL/TP generator ─────────────────────────────────────────────────────────

interface SLTPResult {
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  effectiveStyle: TradingStyle;
  slPips: number;
}

function generateSLTP(
  entry: number,
  direction: "LONG" | "SHORT" | "NO_TRADE",
  rawATR: number,
  style: TradingStyle,
  pair: string,
  pip: number,
  decimals: number,
): SLTPResult {
  const sc       = STYLE_CONFIG[style];
  const category = getPairCategory(pair);
  const bounds   = PAIR_BOUNDS[category][style];

  // Volatility inflation per asset class (commodities are noisier than forex)
  const atrInflation = category === "gold" ? 1.20 : category === "oil" ? 1.10 : 1.0;
  const atr = rawATR * atrInflation;

  // ATR-fraction gives the "shape" of the SL based on market rhythm
  let slDist = atr * sc.atrFraction;

  // ── Clamp to realistic style-specific bounds (KEY FIX: ensures Day > Scalp, Swing > Day)
  const minSLDist = bounds.minPips * pip;
  const maxSLDist = bounds.maxPips * pip;
  slDist = Math.max(slDist, minSLDist);   // floor: never too tight for this style
  slDist = Math.min(slDist, maxSLDist);   // ceiling: never unrealistically wide

  // Guard: ATR produced nonsense → fall back to midpoint of style range
  if (slDist <= 0 || isNaN(slDist)) slDist = (minSLDist + maxSLDist) / 2;

  // TP = SL × style-appropriate multiplier (Scalp 1.5×, Day 2.2×, Swing 3.0×)
  let tpDist = slDist * bounds.tpMult;

  // Enforce minimum RR from STYLE_CONFIG as safety net
  if (tpDist / slDist < sc.minRR) tpDist = slDist * sc.minRR;

  if (tpDist <= 0 || isNaN(tpDist)) tpDist = slDist * sc.minRR;

  const fmt    = (n: number) => parseFloat(n.toFixed(decimals));
  const sl     = direction === "SHORT" ? fmt(entry + slDist) : fmt(entry - slDist);
  const tp     = direction === "SHORT" ? fmt(entry - tpDist) : fmt(entry + tpDist);
  const rr     = parseFloat((tpDist / slDist).toFixed(2));
  const slPips = Math.round(slDist / pip);

  return { stopLoss: sl, takeProfit: tp, riskReward: rr, effectiveStyle: style, slPips };
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

interface ForexFetchResult { closes: number[]; bars: OHLCVBar[]; }

// Separate short-lived cache for raw OHLCV data (shared across all styles of same pair)
// So scalp/day/swing for XAU/USD all reuse the same single Yahoo Finance fetch.
const OHLCV_TTL = 5 * 60 * 1000;
const ohlcvCache: Record<string, { data: ForexFetchResult; ts: number }> = {};

function cachedOHLCV(key: string, fn: () => Promise<ForexFetchResult>): Promise<ForexFetchResult> {
  const hit = ohlcvCache[key];
  if (hit && Date.now() - hit.ts < OHLCV_TTL) return Promise.resolve(hit.data);
  return fn().then(data => { ohlcvCache[key] = { data, ts: Date.now() }; return data; });
}

async function fetchForexRates(base: string, target: string): Promise<ForexFetchResult> {
  return cachedOHLCV(`fx_${base}_${target}`, async () => {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 120);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const url  = `${FRANKFURTER_BASE}/${fmt(start)}..${fmt(end)}?from=${base}&to=${target}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) throw new Error(`Frankfurter API ${resp.status}`);

    const json = await resp.json() as { rates?: Record<string, Record<string, number>> };
    if (!json.rates) throw new Error("Frankfurter API returned no rates");

    const closes = Object.values(json.rates)
      .map(r => r[target])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));

    if (closes.length < 15) throw new Error("Insufficient forex rate history");

    const bars: OHLCVBar[] = closes.map((c, i) => ({
      open:  i > 0 ? closes[i - 1] : c,
      high:  c * 1.0003,
      low:   c * 0.9997,
      close: c,
    }));

    return { closes, bars };
  });
}

async function fetchYahooRates(ticker: string): Promise<ForexFetchResult> {
  return cachedOHLCV(`yahoo_${ticker}`, async () => {
    const url  = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=6mo`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!resp.ok) throw new Error(`Yahoo Finance API ${resp.status} for ${ticker}`);

    const json = await resp.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error(`Yahoo Finance: no data for ${ticker}`);

    const quote  = result.indicators?.quote?.[0];
    const rawO   = (quote?.open   as (number | null)[]) ?? [];
    const rawH   = (quote?.high   as (number | null)[]) ?? [];
    const rawL   = (quote?.low    as (number | null)[]) ?? [];
    const rawC   = (quote?.close  as (number | null)[]) ?? [];

    // Filter out null entries (market holidays)
    const bars: OHLCVBar[] = [];
    const closes: number[] = [];
    for (let i = 0; i < rawC.length; i++) {
      const c = rawC[i], o = rawO[i], h = rawH[i], l = rawL[i];
      if (c != null && o != null && h != null && l != null && c > 0) {
        bars.push({ open: o, high: h, low: l, close: c });
        closes.push(c);
      }
    }

    if (closes.length < 15) throw new Error(`Insufficient Yahoo Finance history for ${ticker}`);
    return { closes, bars };
  });
}

// ─── Core analysis ────────────────────────────────────────────────────────────

const AI_COPILOT_TTL = 5 * 60 * 1000; // 5 min — matches health-ping interval so cache never goes cold

/** Pre-warm all 9 pairs × 3 styles. Called by health warmup.
 *  Fetches OHLCV for each pair first (filling ohlcvCache), then runs
 *  all 3 style analyses per pair reusing that cached OHLCV. This reduces
 *  external API calls from 27 → 9 and avoids CryptoCompare rate-limit.
 */
export async function warmAllPairs(): Promise<void> {
  const styles: TradingStyle[] = ["scalp", "day", "swing"];
  // Process pairs sequentially to be gentle on external APIs
  for (const [pair, cfg] of Object.entries(SUPPORTED_PAIRS)) {
    try {
      // Pre-fill OHLCV cache (1 call per pair)
      if (cfg.yahooTicker) await fetchYahooRates(cfg.yahooTicker).catch(() => null);
      else                  await fetchForexRates(cfg.base, cfg.target).catch(() => null);
      // Now analyze all 3 styles — all reuse the cached OHLCV above
      await Promise.allSettled(styles.map(s => analyzeForexPair(pair, s).catch(() => null)));
    } catch {
      // Individual pair failure must not stop the rest
    }
  }
}

export async function analyzeForexPair(pair: string, tradingStyle: TradingStyle = "day"): Promise<AIForexSignal> {
  const CACHE_TTL = AI_COPILOT_TTL;
  const cacheKey  = `ai_copilot_${pair.replace("/", "_")}_${tradingStyle}`;
  const hit       = marketCache[cacheKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data as AIForexSignal;

  const cfg = SUPPORTED_PAIRS[pair];
  if (!cfg) throw new Error(`Unsupported pair: ${pair}`);

  const { closes, bars } = cfg.yahooTicker
    ? await fetchYahooRates(cfg.yahooTicker)
    : await fetchForexRates(cfg.base, cfg.target);

  const sc      = STYLE_CONFIG[tradingStyle];
  const current = closes[closes.length - 1];

  // ── Indicators (style-aware periods)
  const smaFast  = sma(closes, sc.smaFast);
  const smaSlow  = sma(closes, sc.smaSlow);
  const smaTrend = sma(closes, sc.smaTrend);
  const rocShort = roc(closes, sc.rocShort);
  const rocLong  = roc(closes, sc.rocLong);
  const vol      = stdDev(closes, sc.volWindow);
  const normVol  = (vol / current) * 100;

  const recentSlice  = closes.slice(-sc.sentLen);
  const upCandles    = recentSlice.filter((r, i) => i > 0 && r > recentSlice[i - 1]).length;
  const totalCandles = sc.sentLen - 1;

  const isYahoo       = !!cfg.yahooTicker;
  const category      = getPairCategory(pair);
  // Crypto uses higher ROC thresholds (more volatile); commodities & forex use FX thresholds
  const isCrypto      = category === "crypto";
  const rocThresh     = isCrypto ? sc.rocThreshCrypto     : sc.rocThreshFx;
  const rocLongThresh = isCrypto ? sc.rocLongThreshCrypto : sc.rocLongThreshFx;

  // ── Agent 1: Technical (SMA crossover)
  let technical: Vote;
  if      (smaFast > smaSlow && current > smaSlow && smaSlow > smaTrend) technical = "bullish";
  else if (smaFast < smaSlow && current < smaSlow && smaSlow < smaTrend) technical = "bearish";
  else if (smaFast > smaSlow && current > smaSlow)                       technical = "bullish";
  else if (smaFast < smaSlow && current < smaSlow)                       technical = "bearish";
  else                                                                     technical = "neutral";

  // ── Agent 2: Momentum (ROC)
  let momentum: Vote;
  if      (rocShort > rocThresh  && rocLong > 0)  momentum = "bullish";
  else if (rocShort < -rocThresh && rocLong < 0)  momentum = "bearish";
  else                                              momentum = "neutral";

  // ── Agent 3: Sentiment (candle pattern)
  const sentThreshBull = Math.ceil(totalCandles * 0.65);
  const sentThreshBear = Math.floor(totalCandles * 0.35);
  let sentiment: Vote;
  if      (upCandles >= sentThreshBull)                       sentiment = "bullish";
  else if (upCandles <= sentThreshBear)                       sentiment = "bearish";
  else if (upCandles > totalCandles / 2 && rocShort > 0)     sentiment = "bullish";
  else if (upCandles < totalCandles / 2 && rocShort < 0)     sentiment = "bearish";
  else                                                         sentiment = "neutral";

  // ── Agent 4: Fundamentals (long-term trend)
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

  // ── ATR-based SL/TP (real OHLCV from Yahoo for XAU/BTC, approximated for forex)
  const rawATR = isYahoo
    ? calculateATR(bars, Math.min(14, bars.length - 1))
    : approxATR(closes, 14);

  const sltp = direction !== "NO_TRADE"
    ? generateSLTP(current, direction, rawATR, tradingStyle, pair, cfg.pip, cfg.decimals)
    : { stopLoss: 0, takeProfit: 0, riskReward: 0, effectiveStyle: tradingStyle, slPips: 0 };

  // ── Risk level
  // Volatility thresholds differ by asset class
  const volHighThresh = isCrypto ? 4 : category === "gold" || category === "oil" ? 2.5
    : (tradingStyle === "scalp" ? 0.8 : tradingStyle === "day" ? 1.5 : 2.5);
  const volMedThresh  = isCrypto ? 2 : category === "gold" || category === "oil" ? 1.2
    : (tradingStyle === "scalp" ? 0.4 : tradingStyle === "day" ? 0.7 : 1.2);
  let riskLevel: "low" | "medium" | "high";
  if      (normVol > volHighThresh) riskLevel = "high";
  else if (normVol > volMedThresh)  riskLevel = "medium";
  else                               riskLevel = "low";

  // ── Text
  const fmt       = (n: number) => n.toFixed(cfg.decimals);
  const smaPct    = ((smaFast - smaSlow) / smaSlow * 100).toFixed(3);
  const rocSLbl   = rocShort >= 0 ? `+${rocShort.toFixed(2)}%` : `${rocShort.toFixed(2)}%`;
  const rocLLbl   = rocLong  >= 0 ? `+${rocLong.toFixed(2)}%`  : `${rocLong.toFixed(2)}%`;
  const volLbl    = normVol.toFixed(2);
  const tfCtx     = `${sc.tfLabel} equivalent`;
  const atrLbl    = rawATR.toFixed(cfg.decimals);

  const assetLabel = pair === "XAU/USD" ? "Gold (XAU/USD)"
    : pair === "BTC/USD" ? "Bitcoin (BTC/USD)"
    : pair === "USOil"   ? "WTI Crude Oil (USOil)"
    : pair;

  const styleNote: Record<TradingStyle, string> = {
    scalp: "Short-term scalp — fast momentum, tight stops.",
    day:   "Day trading — intraday momentum and trend.",
    swing: "Swing trade — multi-day trend and momentum shift.",
  };

  const bullDebate = bullCount >= bearCount
    ? `${assetLabel} [${tfCtx}] shows bullish bias. SMA${sc.smaFast} is ${smaPct}% ${parseFloat(smaPct) >= 0 ? "above" : "below"} SMA${sc.smaSlow}. ROC(${sc.rocShort}): ${rocSLbl}, ROC(${sc.rocLong}): ${rocLLbl}. ${upCandles}/${totalCandles} recent candles positive. ATR: ${atrLbl} → SL set at ${sltp.slPips} pips.`
    : `${bullCount} agent(s) remain bullish despite majority bearish signals. A SMA${sc.smaFast} reclaim at ${fmt(smaFast)} could trigger recovery.`;

  const commodityMacroNote = category === "oil"
    ? "OPEC+ supply decisions and geopolitical risk could accelerate selling."
    : "Macro uncertainty could accelerate selling.";
  const bearDebate = bearCount >= bullCount
    ? `${bearCount} agents flag bearish conditions on ${assetLabel} [${tfCtx}]. ROC(${sc.rocLong}): ${rocLLbl}. Volatility: ${volLbl}%. SMA alignment: ${technical === "bearish" ? `bearish (SMA${sc.smaFast} < SMA${sc.smaSlow})` : "mixed"}.`
    : `Bearish risks remain: vol at ${volLbl}%. ${bearCount} agent(s) warn. ${isYahoo ? commodityMacroNote : "Adverse macro events could rapidly reverse trend."}`;

  const judgeDebate = direction === "NO_TRADE"
    ? `Evidence: ${bullCount} bullish vs ${bearCount} bearish on ${tfCtx}. Confidence ${confidence.toFixed(0)}% < 55% minimum. Market structure unclear — best action is to wait for a cleaner ${tradingStyle} setup.`
    : `Verdict: ${direction} on ${assetLabel} [${tfCtx}]. ${Math.max(bullCount, bearCount)}/4 agents aligned. Confidence: ${confidence.toFixed(0)}%. Entry ${fmt(current)} | SL ${fmt(sltp.stopLoss)} (${sltp.slPips} pips) | TP ${fmt(sltp.takeProfit)} | RR 1:${sltp.riskReward}. Duration est: ${sc.durationEstimate}. ${riskLevel === "high" ? "⚠️ Reduce size — high volatility." : "Standard sizing applies."}`;

  const reasoning = direction === "NO_TRADE"
    ? `[${tradingStyle.toUpperCase()} — ${sc.tfLabel}] ${assetLabel}: ${bullCount} bullish, ${bearCount} bearish, ${4 - bullCount - bearCount} neutral. SMA${sc.smaFast}=${fmt(smaFast)}, SMA${sc.smaSlow}=${fmt(smaSlow)}. ROC(${sc.rocShort})=${rocSLbl}, ROC(${sc.rocLong})=${rocLLbl}. Sentiment: ${upCandles}/${totalCandles} up. Vol: ${volLbl}%. Confidence ${confidence.toFixed(0)}% < 55% → NO TRADE.`
    : `[${tradingStyle.toUpperCase()} — ${sc.tfLabel}] ${assetLabel}: ${direction} at ${confidence.toFixed(0)}% confidence. ATR=${atrLbl} → SL ${sltp.slPips} pips (${fmt(sltp.stopLoss)}), TP ${fmt(sltp.takeProfit)}, RR 1:${sltp.riskReward}. Technicals (${technical}): SMA${sc.smaFast}=${fmt(smaFast)} vs SMA${sc.smaSlow}=${fmt(smaSlow)}, price ${current > smaSlow ? "above" : "below"} slow MA. Momentum (${momentum}): ${rocSLbl} / ${rocLLbl}. Sentiment (${sentiment}): ${upCandles}/${totalCandles} candles up. Fundamentals (${fundamentals}): ${rocLLbl} long-term. Duration est: ${sc.durationEstimate}. ${styleNote[tradingStyle]} Risk: ${riskLevel}. ${riskLevel === "high" ? "⚠️ High vol — cut lot size." : riskLevel === "medium" ? "Moderate — standard risk." : "Low vol — clean entry conditions."}`;

  const signal: AIForexSignal = {
    pair,
    tradingStyle,
    tfLabel:          sc.tfLabel,
    durationEstimate: sc.durationEstimate,
    direction,
    entry:      parseFloat(current.toFixed(cfg.decimals)),
    stopLoss:   sltp.stopLoss,
    takeProfit: sltp.takeProfit,
    confidence: parseFloat(confidence.toFixed(1)),
    riskReward: sltp.riskReward,
    riskLevel,
    agentsConsensus: { technical, momentum, sentiment, fundamentals },
    debate: { bull: bullDebate, bear: bearDebate, judge: judgeDebate },
    reasoning,
    timestamp: new Date().toISOString(),
  };

  marketCache[cacheKey] = { data: signal, ts: Date.now() };
  return signal;
}
