// ─── AI Forex Copilot — Real Technical Analysis Engine ───────────────────────
// Forex  → Frankfurter API (free, no key)
// XAU/USD, BTC/USD → CryptoCompare histoday OHLCV API (free, no key)
// SL/TP: ATR-based, style-adaptive, pip-capped. RR enforced ≥ 1.5.

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
  const sc = STYLE_CONFIG[style];

  // Gold gets a 20% ATR inflation (higher intraday noise)
  const atr = pair === "XAU/USD" ? rawATR * 1.2 : rawATR;

  // Base SL = fraction of ATR simulating chosen TF
  let slDist = atr * sc.atrFraction;

  // Hard pip cap (prevents unrealistic ranges)
  const maxSLDist = sc.maxPips * pip;
  slDist = Math.min(slDist, maxSLDist);

  // Safety: ensure SL is at least 1 pip
  slDist = Math.max(slDist, pip);

  // Determine TP (enforce min RR)
  let tpDist = slDist * sc.tpMult;
  const actualRR = tpDist / slDist;
  if (actualRR < sc.minRR) {
    tpDist = slDist * sc.minRR;
  }

  // Auto-upgrade scalp → day if SL still exceeds scalp cap after clamping
  let effectiveStyle = style;
  if (style === "scalp" && slDist > STYLE_CONFIG.scalp.maxPips * pip) {
    effectiveStyle = "day";
    const dc = STYLE_CONFIG.day;
    tpDist = slDist * dc.tpMult;
  }

  // Guard: if ATR produced nonsense, use a sensible pip-based minimum
  if (slDist <= 0 || isNaN(slDist)) slDist = sc.maxPips * pip * 0.5;
  if (tpDist <= 0 || isNaN(tpDist)) tpDist = slDist * sc.minRR;

  const fmt = (n: number) => parseFloat(n.toFixed(decimals));
  const sl  = direction === "SHORT" ? fmt(entry + slDist) : fmt(entry - slDist);
  const tp  = direction === "SHORT" ? fmt(entry - tpDist) : fmt(entry + tpDist);
  const rr  = parseFloat((tpDist / slDist).toFixed(2));
  const slPips = Math.round(slDist / pip);

  return { stopLoss: sl, takeProfit: tp, riskReward: rr, effectiveStyle, slPips };
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

interface ForexFetchResult { closes: number[]; bars: OHLCVBar[]; }

// Separate short-lived cache for raw OHLCV data (shared across all styles of same pair)
// So scalp/day/swing for XAU/USD all reuse the same single CryptoCompare fetch.
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

async function fetchCryptoRates(symbol: string): Promise<ForexFetchResult> {
  return cachedOHLCV(`crypto_${symbol}`, async () => {
    const url  = `${CC_BASE}?fsym=${symbol}&tsym=USD&limit=120`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!resp.ok) throw new Error(`CryptoCompare API ${resp.status}`);

    const json = await resp.json() as any;

    // CryptoCompare sometimes returns 200 with {Response: "Error"} when rate-limited
    if (json?.Response === "Error" || !json?.Data?.Data) {
      throw new Error(`CryptoCompare error: ${json?.Message ?? "no data"}`);
    }

    const raw = (json.Data.Data as Array<{ open: number; high: number; low: number; close: number }>)
      .filter(d => d.close > 0);

    if (raw.length < 15) throw new Error("Insufficient crypto rate history");

    const bars:   OHLCVBar[] = raw.map(d => ({ open: d.open, high: d.high, low: d.low, close: d.close }));
    const closes: number[]   = raw.map(d => d.close);

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
      if (cfg.isCrypto) await fetchCryptoRates(cfg.base).catch(() => null);
      else              await fetchForexRates(cfg.base, cfg.target).catch(() => null);
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

  const { closes, bars } = cfg.isCrypto
    ? await fetchCryptoRates(cfg.base)
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

  const rocThresh     = cfg.isCrypto ? sc.rocThreshCrypto     : sc.rocThreshFx;
  const rocLongThresh = cfg.isCrypto ? sc.rocLongThreshCrypto : sc.rocLongThreshFx;

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

  // ── ATR-based SL/TP (real OHLCV for crypto, approximated for forex)
  const rawATR = cfg.isCrypto
    ? calculateATR(bars, Math.min(14, bars.length - 1))
    : approxATR(closes, 14);

  const sltp = direction !== "NO_TRADE"
    ? generateSLTP(current, direction, rawATR, tradingStyle, pair, cfg.pip, cfg.decimals)
    : { stopLoss: 0, takeProfit: 0, riskReward: 0, effectiveStyle: tradingStyle, slPips: 0 };

  // ── Risk level
  const volHighThresh = cfg.isCrypto ? 4 : (tradingStyle === "scalp" ? 0.8 : tradingStyle === "day" ? 1.5 : 2.5);
  const volMedThresh  = cfg.isCrypto ? 2 : (tradingStyle === "scalp" ? 0.4 : tradingStyle === "day" ? 0.7 : 1.2);
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

  const assetLabel = cfg.isCrypto
    ? (pair === "XAU/USD" ? "Gold (XAU/USD)" : "Bitcoin (BTC/USD)")
    : pair;

  const styleNote: Record<TradingStyle, string> = {
    scalp: "Short-term scalp — fast momentum, tight stops.",
    day:   "Day trading — intraday momentum and trend.",
    swing: "Swing trade — multi-day trend and momentum shift.",
  };

  const bullDebate = bullCount >= bearCount
    ? `${assetLabel} [${tfCtx}] shows bullish bias. SMA${sc.smaFast} is ${smaPct}% ${parseFloat(smaPct) >= 0 ? "above" : "below"} SMA${sc.smaSlow}. ROC(${sc.rocShort}): ${rocSLbl}, ROC(${sc.rocLong}): ${rocLLbl}. ${upCandles}/${totalCandles} recent candles positive. ATR: ${atrLbl} → SL set at ${sltp.slPips} pips.`
    : `${bullCount} agent(s) remain bullish despite majority bearish signals. A SMA${sc.smaFast} reclaim at ${fmt(smaFast)} could trigger recovery.`;

  const bearDebate = bearCount >= bullCount
    ? `${bearCount} agents flag bearish conditions on ${assetLabel} [${tfCtx}]. ROC(${sc.rocLong}): ${rocLLbl}. Volatility: ${volLbl}%. SMA alignment: ${technical === "bearish" ? `bearish (SMA${sc.smaFast} < SMA${sc.smaSlow})` : "mixed"}.`
    : `Bearish risks remain: vol at ${volLbl}%. ${bearCount} agent(s) warn. ${cfg.isCrypto ? "Macro uncertainty could accelerate selling." : "Adverse macro events could rapidly reverse trend."}`;

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
