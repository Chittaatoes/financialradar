import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Clock, Globe, Zap, Brain, BarChart3, Shield, Layers, DollarSign,
  Map, Sparkles,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

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

function parseValue(str: string | null): number | null {
  if (!str || str === "-" || str === "—") return null;
  const cleaned = str.replace(/[%K$,<>]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function fmtSurprise(n: number, unit: string): string {
  return (n > 0 ? "+" : "") + n.toFixed(2) + unit;
}

function detectUnit(str: string | null): string {
  if (!str) return "";
  if (str.includes("%")) return "%";
  if (str.includes("K")) return "K";
  if (str.includes("B")) return "B";
  return "";
}

type EventType = "CPI" | "NFP" | "FOMC" | "GDP" | "UNEMPLOYMENT" | "OTHER";

function detectEventType(name: string): EventType {
  const n = name.toUpperCase();
  if (n.includes("CPI") || n.includes("CONSUMER PRICE")) return "CPI";
  if (n.includes("NON FARM") || n.includes("NONFARM") || n.includes("NFP") || n.includes("PAYROLL")) return "NFP";
  if (n.includes("FOMC") || n.includes("FEDERAL FUND") || n.includes("INTEREST RATE") || n.includes("FED RATE") || n.includes("CASH RATE") || n.includes("OVERNIGHT RATE") || n.includes("BOC RATE") || n.includes("RBA") || n.includes("BOJ") || n.includes("BOE") || n.includes("MONETARY POLICY")) return "FOMC";
  if (n.includes("GDP") || n.includes("GROSS DOMESTIC")) return "GDP";
  if (n.includes("UNEMPLOYMENT") || n.includes("JOBLESS") || n.includes("EMPLOYMENT CHANGE")) return "UNEMPLOYMENT";
  return "OTHER";
}

type Bias = "Bullish" | "Bearish" | "Neutral" | "Volatile";
type Regime = "RISK_ON" | "RISK_OFF" | "INFLATION" | "LIQUIDITY";
type SurpriseDir = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

interface AssetBias { usd: Bias; gold: Bias; btc: Bias }

type ArrowDir = "↑" | "↓" | "→";
interface CurrencyPair { label: string; arrow: ArrowDir }

interface Scenario {
  label: string;
  description: string;
  usd: ArrowDir;
  gold: ArrowDir;
  btc: ArrowDir;
  stocks?: ArrowDir;
  currencyPairs?: CurrencyPair[];
}

interface QuickImpactItem {
  label: string;
  emoji: string;
  arrow: ArrowDir;
}

interface SurpriseResult {
  actualVal: number | null;
  forecastVal: number | null;
  surprise: number | null;
  dir: SurpriseDir;
  unit: string;
}

// ─── Market data ──────────────────────────────────────────────────────────────
const AFFECTED_MARKETS: Record<string, string[]> = {
  USD: ["Gold (XAUUSD)", "Bitcoin (BTC)", "Nasdaq / US Stocks", "EURUSD", "USDJPY"],
  CAD: ["USDCAD", "CADJPY", "EURCAD"],
  EUR: ["EURUSD", "EURJPY", "EURGBP"],
  JPY: ["USDJPY", "XAUJPY", "EURJPY"],
  GBP: ["GBPUSD", "GBPJPY", "EURGBP"],
  AUD: ["AUDUSD", "AUDJPY", "NZDAUD"],
  NZD: ["NZDUSD", "NZDJPY"],
  CHF: ["USDCHF", "EURCHF", "GBPCHF"],
};

const IMPACT_MAP_FULL: Array<{ currency: string; flag: string; pairs: string[] }> = [
  { currency: "USD", flag: "🇺🇸", pairs: ["Gold (XAUUSD)", "Bitcoin (BTC)", "Nasdaq / US Stocks", "EURUSD", "USDJPY"] },
  { currency: "CAD", flag: "🇨🇦", pairs: ["USDCAD", "CADJPY", "EURCAD"] },
  { currency: "EUR", flag: "🇪🇺", pairs: ["EURUSD", "EURJPY", "EURGBP"] },
  { currency: "JPY", flag: "🇯🇵", pairs: ["USDJPY", "XAUJPY", "EURJPY"] },
  { currency: "GBP", flag: "🇬🇧", pairs: ["GBPUSD", "GBPJPY", "EURGBP"] },
  { currency: "AUD", flag: "🇦🇺", pairs: ["AUDUSD", "AUDJPY", "NZDAUD"] },
  { currency: "NZD", flag: "🇳🇿", pairs: ["NZDUSD", "NZDJPY"] },
];

function buildCurrencyPairs(currency: string): [CurrencyPair[], CurrencyPair[]] {
  switch (currency) {
    case "CAD": return [[{ label: "CAD", arrow: "↑" }, { label: "USDCAD", arrow: "↓" }, { label: "CADJPY", arrow: "↑" }], [{ label: "CAD", arrow: "↓" }, { label: "USDCAD", arrow: "↑" }, { label: "CADJPY", arrow: "↓" }]];
    case "EUR": return [[{ label: "EUR", arrow: "↑" }, { label: "EURUSD", arrow: "↑" }, { label: "EURJPY", arrow: "↑" }], [{ label: "EUR", arrow: "↓" }, { label: "EURUSD", arrow: "↓" }, { label: "EURJPY", arrow: "↓" }]];
    case "JPY": return [[{ label: "JPY", arrow: "↑" }, { label: "USDJPY", arrow: "↓" }, { label: "XAUJPY", arrow: "↓" }], [{ label: "JPY", arrow: "↓" }, { label: "USDJPY", arrow: "↑" }, { label: "XAUJPY", arrow: "↑" }]];
    case "GBP": return [[{ label: "GBP", arrow: "↑" }, { label: "GBPUSD", arrow: "↑" }, { label: "GBPJPY", arrow: "↑" }], [{ label: "GBP", arrow: "↓" }, { label: "GBPUSD", arrow: "↓" }, { label: "GBPJPY", arrow: "↓" }]];
    case "AUD": return [[{ label: "AUD", arrow: "↑" }, { label: "AUDUSD", arrow: "↑" }, { label: "AUDJPY", arrow: "↑" }], [{ label: "AUD", arrow: "↓" }, { label: "AUDUSD", arrow: "↓" }, { label: "AUDJPY", arrow: "↓" }]];
    case "NZD": return [[{ label: "NZD", arrow: "↑" }, { label: "NZDUSD", arrow: "↑" }, { label: "NZDJPY", arrow: "↑" }], [{ label: "NZD", arrow: "↓" }, { label: "NZDUSD", arrow: "↓" }, { label: "NZDJPY", arrow: "↓" }]];
    case "CHF": return [[{ label: "CHF", arrow: "↑" }, { label: "USDCHF", arrow: "↓" }, { label: "EURCHF", arrow: "↓" }], [{ label: "CHF", arrow: "↓" }, { label: "USDCHF", arrow: "↑" }, { label: "EURCHF", arrow: "↑" }]];
    default:    return [[], []];
  }
}

// ─── Surprise logic ───────────────────────────────────────────────────────────
function calcSurprise(actual: string | null, forecast: string | null): SurpriseResult {
  const unit = detectUnit(actual ?? forecast);
  const a = parseValue(actual);
  const f = parseValue(forecast);
  if (a === null || f === null) return { actualVal: a, forecastVal: f, surprise: null, dir: "NEUTRAL", unit };
  const surprise = a - f;
  const threshold = Math.max(0.05, Math.abs(f) * 0.05);
  const dir: SurpriseDir = surprise > threshold ? "POSITIVE" : surprise < -threshold ? "NEGATIVE" : "NEUTRAL";
  return { actualVal: a, forecastVal: f, surprise, dir, unit };
}

function isBullishForCurrency(eventType: EventType, dir: SurpriseDir): boolean {
  if (dir === "NEUTRAL") return false;
  if (eventType === "UNEMPLOYMENT") return dir === "NEGATIVE";
  return dir === "POSITIVE";
}

function buildPostReleaseInsight(event: MacroEvent, surprise: SurpriseResult, eventType: EventType, m: any): string {
  const ccy = event.currency ?? "USD";
  const [pairsA, pairsB] = buildCurrencyPairs(ccy);
  const bullish = isBullishForCurrency(eventType, surprise.dir);
  const activePairs = bullish ? pairsA : pairsB;

  const cameStr = surprise.dir === "POSITIVE" ? m.cameHigher : surprise.dir === "NEGATIVE" ? m.cameLower : m.cameInLine;
  const contextStr = eventType === "CPI"
    ? (bullish ? m.inflationPressure : m.inflationEasing)
    : (surprise.dir === "NEUTRAL" ? m.inLineSuggests : "");

  const pairLines = activePairs.map((p) => `${p.label} ${p.arrow === "↑" ? m.mayStrengthen : m.mayWeaken}`).join(", ");

  return `${event.event} ${cameStr}${contextStr ? " " + contextStr : ""} ${pairLines ? pairLines + "." : ""}`.trim();
}

// ─── Logic builders ───────────────────────────────────────────────────────────
function buildScenarios(eventType: EventType, isID: boolean, currency: string): [Scenario, Scenario] {
  const t = {
    cpiA:   isID ? "CPI lebih tinggi dari perkiraan (inflasi panas)" : "CPI higher than forecast (hot inflation)",
    cpiB:   isID ? "CPI lebih rendah dari perkiraan (inflasi mulai dingin)" : "CPI lower than forecast (cooling inflation)",
    nfpA:   isID ? "NFP lebih tinggi dari perkiraan (pasar kerja kuat)" : "NFP higher than forecast (strong jobs)",
    nfpB:   isID ? "NFP lebih rendah dari perkiraan (pasar kerja lemah)" : "NFP lower than forecast (weak jobs)",
    fomcA:  isID ? "Kenaikan suku bunga atau sinyal hawkish" : "Rate hike or hawkish signal",
    fomcB:  isID ? "Pemotongan suku bunga atau sinyal dovish" : "Rate cut or dovish signal",
    gdpA:   isID ? "GDP melampaui ekspektasi (pertumbuhan)" : "GDP beats expectations (growth)",
    gdpB:   isID ? "GDP di bawah ekspektasi (kontraksi)" : "GDP misses expectations (contraction)",
    unempA: isID ? "Pengangguran lebih tinggi dari ekspektasi" : "Unemployment higher than expected",
    unempB: isID ? "Pengangguran lebih rendah dari ekspektasi" : "Unemployment lower than expected",
    otherA: isID ? "Hasil lebih baik dari ekspektasi" : "Better than expected result",
    otherB: isID ? "Hasil lebih buruk dari ekspektasi" : "Worse than expected result",
  };
  const sA = isID ? "Skenario A" : "Scenario A";
  const sB = isID ? "Skenario B" : "Scenario B";
  const [pairsA, pairsB] = buildCurrencyPairs(currency);

  let base: [Scenario, Scenario];
  switch (eventType) {
    case "CPI":          base = [{ label: sA, description: t.cpiA,   usd: "↑", gold: "↑", btc: "↓", stocks: "↓" }, { label: sB, description: t.cpiB,   usd: "↓", gold: "↓", btc: "↑", stocks: "↑" }]; break;
    case "NFP":          base = [{ label: sA, description: t.nfpA,   usd: "↑", gold: "↓", btc: "↓", stocks: "↑" }, { label: sB, description: t.nfpB,   usd: "↓", gold: "↑", btc: "→", stocks: "↓" }]; break;
    case "FOMC":         base = [{ label: sA, description: t.fomcA,  usd: "↑", gold: "↓", btc: "↓", stocks: "↓" }, { label: sB, description: t.fomcB,  usd: "↓", gold: "↑", btc: "↑", stocks: "↑" }]; break;
    case "GDP":          base = [{ label: sA, description: t.gdpA,   usd: "↑", gold: "↓", btc: "↑", stocks: "↑" }, { label: sB, description: t.gdpB,   usd: "↓", gold: "↑", btc: "↓", stocks: "↓" }]; break;
    case "UNEMPLOYMENT": base = [{ label: sA, description: t.unempA, usd: "↓", gold: "↑", btc: "↓", stocks: "↓" }, { label: sB, description: t.unempB, usd: "↑", gold: "↓", btc: "↑", stocks: "↑" }]; break;
    default:             base = [{ label: sA, description: t.otherA, usd: "↑", gold: "→", btc: "→" },              { label: sB, description: t.otherB, usd: "↓", gold: "↑", btc: "↓" }]; break;
  }
  return [
    { ...base[0], currencyPairs: pairsA.length > 0 ? pairsA : undefined },
    { ...base[1], currencyPairs: pairsB.length > 0 ? pairsB : undefined },
  ];
}

function buildQuickImpact(eventType: EventType, isID: boolean): { condition: string; items: QuickImpactItem[] } {
  const usd  = isID ? "Dolar"    : "USD";
  const gold = isID ? "Emas"     : "Gold";
  const btc  = isID ? "Kripto"   : "Crypto";
  const stk  = isID ? "Saham"    : "Stocks";
  const bond = isID ? "Obligasi" : "Bonds";

  switch (eventType) {
    case "CPI":          return { condition: isID ? "Jika inflasi naik:"            : "If inflation rises:",           items: [{ label: usd, emoji: "💵", arrow: "↑" }, { label: gold, emoji: "🥇", arrow: "↑" }, { label: stk, emoji: "📈", arrow: "↓" }, { label: btc, emoji: "₿", arrow: "↓" }] };
    case "NFP":          return { condition: isID ? "Jika data tenaga kerja kuat:"   : "If jobs data is strong:",       items: [{ label: usd, emoji: "💵", arrow: "↑" }, { label: gold, emoji: "🥇", arrow: "↓" }, { label: stk, emoji: "📈", arrow: "↑" }, { label: btc, emoji: "₿", arrow: "↓" }] };
    case "FOMC":         return { condition: isID ? "Jika suku bunga naik:"          : "If rate hikes:",                items: [{ label: usd, emoji: "💵", arrow: "↑" }, { label: gold, emoji: "🥇", arrow: "↓" }, { label: bond, emoji: "📉", arrow: "↓" }, { label: btc, emoji: "₿", arrow: "↓" }] };
    case "GDP":          return { condition: isID ? "Jika GDP melebihi ekspektasi:"  : "If GDP beats expectations:",    items: [{ label: usd, emoji: "💵", arrow: "↑" }, { label: stk, emoji: "📈", arrow: "↑" }, { label: gold, emoji: "🥇", arrow: "→" }, { label: btc, emoji: "₿", arrow: "↑" }] };
    case "UNEMPLOYMENT": return { condition: isID ? "Jika pengangguran naik:"        : "If unemployment rises:",        items: [{ label: usd, emoji: "💵", arrow: "↓" }, { label: gold, emoji: "🥇", arrow: "↑" }, { label: stk, emoji: "📈", arrow: "↓" }, { label: btc, emoji: "₿", arrow: "↓" }] };
    default:             return { condition: isID ? "Jika hasil di atas ekspektasi:" : "If result beats expectations:", items: [{ label: usd, emoji: "💵", arrow: "↑" }, { label: gold, emoji: "🥇", arrow: "→" }, { label: btc, emoji: "₿", arrow: "→" }] };
  }
}

function buildInsight(ind: MacroIndicators, isID: boolean): string {
  const rate = ind.interestRate?.value ?? null;
  const cpi  = ind.inflation?.value ?? null;
  const m2   = ind.moneySupply?.value ?? null;
  const m2p  = ind.moneySupply?.prevValue ?? null;
  const unem = ind.unemployment?.value ?? null;
  const lines: string[] = [];

  if (rate !== null) {
    if (isID) {
      if (rate >= 5) lines.push(`Suku bunga tinggi di ${rate}%, menandakan kebijakan Fed yang hawkish.`);
      else if (rate >= 3) lines.push(`Suku bunga moderat di ${rate}%, mencerminkan kebijakan moneter yang hati-hati.`);
      else lines.push(`Suku bunga rendah di ${rate}%, mendukung aset berisiko.`);
    } else {
      if (rate >= 5) lines.push(`Interest rates are elevated at ${rate}%, signaling a hawkish Fed stance.`);
      else if (rate >= 3) lines.push(`Interest rates are moderate at ${rate}%, reflecting a cautious monetary policy.`);
      else lines.push(`Interest rates remain low at ${rate}%, supporting risk assets.`);
    }
  }
  if (cpi !== null && cpi > 300) {
    const ann = ((cpi / 280) - 1) * 100;
    if (isID) lines.push(ann > 4 ? `Inflasi (CPI ${cpi.toFixed(1)}) masih tinggi, menjaga tekanan pada Fed.` : `Inflasi (CPI ${cpi.toFixed(1)}) tampaknya mulai mereda.`);
    else       lines.push(ann > 4 ? `Inflation (CPI index ${cpi.toFixed(1)}) remains elevated, keeping pressure on the Fed.` : `Inflation (CPI index ${cpi.toFixed(1)}) appears to be cooling gradually.`);
  }
  if (m2 !== null && m2p !== null) {
    const d = m2 - m2p;
    if (isID) lines.push(d < 0 ? `Pasokan uang berkontraksi (M2 turun $${Math.abs(d).toFixed(0)}M), sinyal bearish.` : `Pasokan uang ekspansi (M2 naik $${d.toFixed(0)}M), mendukung pasar.`);
    else       lines.push(d < 0 ? `Money supply contracting (M2 down $${Math.abs(d).toFixed(0)}M), bearish for risk assets.` : `Money supply expanding (M2 up $${d.toFixed(0)}M), broadly supportive.`);
  }
  if (unem !== null) {
    if (isID) lines.push(unem > 4.5 ? `Pengangguran naik ke ${unem}%, menandakan pelemahan ekonomi.` : `Pengangguran terjaga di ${unem}%, mencerminkan ketahanan pasar kerja.`);
    else       lines.push(unem > 4.5 ? `Unemployment rising at ${unem}%, signaling economic softness.` : `Unemployment contained at ${unem}%, reflecting labor market resilience.`);
  }
  if (lines.length === 0) return isID ? "Memuat data makro…" : "Loading macro data…";
  const envTag = isID
    ? ((rate ?? 0) >= 4 ? "Secara keseluruhan, lingkungan makro ini hawkish, biasanya mendukung dolar AS." : "Lingkungan makro ini berpotensi mendukung aset berisiko dan mata uang berkembang.")
    : ((rate ?? 0) >= 4 ? "This overall macro environment is hawkish, typically supporting the US dollar." : "This macro environment may support risk assets and emerging market currencies.");
  return lines.join(" ") + " " + envTag;
}

function buildBias(ind: MacroIndicators): AssetBias {
  const rate  = ind.interestRate?.value ?? 0;
  const rateP = ind.interestRate?.prevValue ?? rate;
  const m2    = ind.moneySupply?.value ?? 0;
  const m2p   = ind.moneySupply?.prevValue ?? 0;
  const unem  = ind.unemployment?.value ?? 0;
  const uemp  = ind.unemployment?.prevValue ?? 0;

  const m2Shrinking = m2 < m2p;
  const unemRising  = unem > uemp;
  const rateHigh    = rate >= 4.5;
  const rateCut     = rate < rateP;

  return {
    usd:  rateHigh && !rateCut ? "Bullish" : unemRising ? "Bearish" : "Neutral",
    gold: !rateHigh ? "Bullish" : m2Shrinking ? "Bearish" : "Neutral",
    btc:  m2Shrinking ? "Bearish" : rateHigh ? "Volatile" : "Bullish",
  };
}

function buildRegime(ind: MacroIndicators): Regime {
  const rate = ind.interestRate?.value ?? 0;
  const cpi  = ind.inflation?.value ?? 0;
  const cpip = ind.inflation?.prevValue ?? cpi;
  const m2   = ind.moneySupply?.value ?? 0;
  const m2p  = ind.moneySupply?.prevValue ?? 0;

  if (rate >= 4.5 && cpi > cpip) return "INFLATION";
  if (rate >= 4.5 && m2 <= m2p)  return "RISK_OFF";
  if (rate < 4.5  && m2 > m2p)   return "LIQUIDITY";
  return "RISK_ON";
}

type DollarLevel    = "STRONG" | "NEUTRAL" | "WEAK";
type RealYieldLevel = "RISING" | "NEUTRAL" | "FALLING";
type LiquidityLevel = "EXPANDING" | "CONTRACTING";

function buildMacroIndicatorLevels(ind: MacroIndicators): {
  dollar: DollarLevel; realYield: RealYieldLevel; liquidity: LiquidityLevel;
} {
  const rate = ind.interestRate?.value ?? 0;
  const m2   = ind.moneySupply?.value ?? 0;
  const m2p  = ind.moneySupply?.prevValue ?? 0;
  const cpi  = ind.inflation?.value ?? 0;
  const cpip = ind.inflation?.prevValue ?? cpi;

  const dollar: DollarLevel = rate >= 4.5 ? "STRONG" : rate >= 2.5 ? "NEUTRAL" : "WEAK";
  const inflChange = cpip > 0 ? ((cpi - cpip) / cpip) : 0;
  const realYieldVal = rate - (inflChange * 12 * 100);
  const realYield: RealYieldLevel = realYieldVal > 1.5 ? "RISING" : realYieldVal < 0 ? "FALLING" : "NEUTRAL";
  const liquidity: LiquidityLevel = m2 >= m2p ? "EXPANDING" : "CONTRACTING";

  return { dollar, realYield, liquidity };
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const BIAS_STYLE: Record<Bias, string> = {
  Bullish:  "text-emerald-600 dark:text-emerald-400",
  Bearish:  "text-red-500 dark:text-red-400",
  Neutral:  "text-muted-foreground",
  Volatile: "text-amber-500 dark:text-amber-400",
};
const BIAS_ICON: Record<Bias, typeof TrendingUp> = {
  Bullish: TrendingUp, Bearish: TrendingDown, Neutral: Minus, Volatile: Zap,
};
const ARROW_COLOR: Record<ArrowDir, string> = { "↑": "text-emerald-500", "↓": "text-red-500", "→": "text-amber-500" };
const ARROW_BG:    Record<ArrowDir, string> = { "↑": "bg-emerald-500/10", "↓": "bg-red-500/10", "→": "bg-amber-500/10" };

function BiasRow({ label, emoji, bias, meaning }: { label: string; emoji: string; bias: Bias; meaning: string }) {
  const Icon = BIAS_ICON[bias];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base shrink-0">{emoji}</span>
        <div className="min-w-0">
          <span className="text-sm font-medium">{label}</span>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">{meaning}</p>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 font-semibold text-sm shrink-0 ${BIAS_STYLE[bias]}`}>
        <Icon className="w-3.5 h-3.5" />{bias}
      </div>
    </div>
  );
}

function ScenarioCard({ s, currencyImpactLabel }: { s: Scenario; currencyImpactLabel: string }) {
  const genericAssets = [
    { label: "USD", arrow: s.usd, emoji: "💵" },
    { label: "Gold", arrow: s.gold, emoji: "🥇" },
    ...(s.stocks ? [{ label: "Stocks", arrow: s.stocks, emoji: "📈" }] : []),
    { label: "BTC", arrow: s.btc, emoji: "₿" },
  ];
  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</p>
        <p className="text-sm font-medium mt-0.5 leading-snug">{s.description}</p>
      </div>
      {s.currencyPairs && s.currencyPairs.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5">{currencyImpactLabel}</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {s.currencyPairs.map(({ label, arrow }) => (
              <div key={label} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border border-violet-200 dark:border-violet-800 ${ARROW_BG[arrow]}`}>
                <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">{label}</span>
                <span className={`text-base font-bold ${ARROW_COLOR[arrow]}`}>{arrow}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {genericAssets.map(({ label, arrow, emoji }) => (
          <div key={label} className={`flex items-center gap-1 px-2 py-1 rounded-lg ${ARROW_BG[arrow]}`}>
            <span className="text-xs text-muted-foreground">{emoji} {label}</span>
            <span className={`text-base font-bold ${ARROW_COLOR[arrow]}`}>{arrow}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickImpactBox({ condition, items }: { condition: string; items: QuickImpactItem[] }) {
  return (
    <div className="rounded-xl border border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 p-4 space-y-3">
      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">{condition}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(({ label, emoji, arrow }) => (
          <div key={label} className={`flex items-center justify-between px-3 py-2 rounded-lg ${ARROW_BG[arrow]}`}>
            <span className="text-xs font-medium">{emoji} {label}</span>
            <span className={`text-lg font-bold ${ARROW_COLOR[arrow]}`}>{arrow}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MostAffectedMarkets({ currency, label }: { currency: string; label: string }) {
  const pairs = AFFECTED_MARKETS[currency] ?? AFFECTED_MARKETS["USD"];
  return (
    <div className="pt-3 border-t border-border space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {pairs.map((pair) => (
          <span key={pair} className="px-2.5 py-1 rounded-lg bg-orange-500/10 text-xs font-semibold text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900">
            {pair}
          </span>
        ))}
      </div>
    </div>
  );
}

function NewsSurpriseCard({ surprise, event, m }: { surprise: SurpriseResult; event: MacroEvent; m: any }) {
  const { dir, surprise: diff, unit, actualVal, forecastVal } = surprise;

  const dirLabel = dir === "POSITIVE" ? m.positiveSurprise : dir === "NEGATIVE" ? m.negativeSurprise : m.neutralSurprise;
  const dirColor = dir === "POSITIVE"
    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-200 dark:border-emerald-800"
    : dir === "NEGATIVE"
    ? "text-red-500 dark:text-red-400 bg-red-500/10 border-red-200 dark:border-red-800"
    : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-200 dark:border-amber-800";

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-yellow-500" />
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.newsSurpriseIndicator}</p>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-2 py-0.5">{m.postRelease}</span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: m.forecast, val: forecastVal != null ? forecastVal.toFixed(2) + unit : (event.forecast ?? "—") },
            { label: m.actual,   val: actualVal  != null ? actualVal.toFixed(2)  + unit : (event.actual  ?? "—") },
            { label: m.surpriseLabel, val: diff != null ? fmtSurprise(diff, unit) : "—", accent: true },
          ].map(({ label, val, accent }) => (
            <div key={label} className={`rounded-xl p-3 text-center ${accent ? dirColor + " border" : "bg-muted/40"}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
              <p className={`text-base font-bold mt-0.5 ${accent ? "" : "text-foreground"}`}>{val}</p>
            </div>
          ))}
        </div>

        <div className={`rounded-xl border p-3 flex items-center justify-between ${dirColor}`}>
          <p className="text-sm font-bold">{dirLabel}</p>
          {dir !== "NEUTRAL" && (
            <span className="text-xs font-semibold">
              {dir === "POSITIVE" ? m.bullishLabel : m.bearishLabel} {event.currency}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActualMarketImpactCard({ surprise, event, eventType, m }: {
  surprise: SurpriseResult; event: MacroEvent; eventType: EventType; m: any;
}) {
  const ccy = event.currency ?? "USD";
  const [pairsA, pairsB] = buildCurrencyPairs(ccy);
  const bullish = isBullishForCurrency(eventType, surprise.dir);
  const activePairs = bullish ? pairsA : pairsB;

  const genericBias: Record<string, { arrow: ArrowDir; label: string }> = bullish ? {
    "USD":  { arrow: eventType === "CPI" || eventType === "NFP" || eventType === "FOMC" ? "↑" : "↑", label: m.bullishLabel },
    "Gold": { arrow: eventType === "CPI" ? "↑" : "↓", label: eventType === "CPI" ? m.bullishLabel : m.bearishLabel },
    "BTC":  { arrow: eventType === "FOMC" ? "↓" : "↑", label: eventType === "FOMC" ? m.bearishLabel : m.bullishLabel },
  } : {
    "USD":  { arrow: "↓", label: m.bearishLabel },
    "Gold": { arrow: "↑", label: m.bullishLabel },
    "BTC":  { arrow: eventType === "FOMC" ? "↑" : "↓", label: eventType === "FOMC" ? m.bullishLabel : m.bearishLabel },
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.actualMarketImpact}</p>
        </div>

        <div className="rounded-xl bg-muted/30 p-3 space-y-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{m.actualVsForecast}</p>
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <span className="text-xs"><span className="text-muted-foreground">{m.forecast}:</span> <span className="font-semibold">{event.forecast ?? "—"}</span></span>
            <span className="text-xs"><span className="text-muted-foreground">{m.actual}:</span> <span className="font-semibold">{event.actual ?? "—"}</span></span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{m.marketImpactLabel}</p>

          {activePairs.length > 0 && (
            <div className="space-y-1 mb-3">
              {activePairs.map(({ label, arrow }) => (
                <div key={label} className={`flex items-center justify-between px-3 py-2 rounded-lg ${ARROW_BG[arrow]}`}>
                  <span className="text-sm font-semibold">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${ARROW_COLOR[arrow]}`}>{arrow}</span>
                    <span className={`text-xs font-semibold ${arrow === "↑" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                      {arrow === "↑" ? m.bullishLabel : m.bearishLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1">
            {[
              { label: "💵 USD", info: genericBias["USD"] },
              { label: "🥇 Gold", info: genericBias["Gold"] },
              { label: "₿ BTC", info: genericBias["BTC"] },
            ].map(({ label, info }) => (
              <div key={label} className={`flex items-center justify-between px-3 py-2 rounded-lg ${ARROW_BG[info.arrow]}`}>
                <span className="text-sm font-medium">{label}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${ARROW_COLOR[info.arrow]}`}>{info.arrow}</span>
                  <span className={`text-xs font-semibold ${info.arrow === "↑" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{info.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

function RiskMeter({ level, t }: { level: RiskLevel; t: any }) {
  const config = {
    LOW:    { bars: 1, color: "bg-emerald-500", label: t.lowRisk,    title: t.lowRiskTitle,    desc: t.lowRiskDesc },
    MEDIUM: { bars: 3, color: "bg-amber-500",   label: t.mediumRisk, title: t.mediumRiskTitle, desc: t.mediumRiskDesc },
    HIGH:   { bars: 5, color: "bg-red-500",     label: t.highRisk,   title: t.highRiskTitle,   desc: t.highRiskDesc },
  }[level];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-semibold ${level === "HIGH" ? "text-red-500 dark:text-red-400" : level === "MEDIUM" ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {config.label}
        </span>
        <span className="text-xs text-muted-foreground">{level}</span>
      </div>
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-2.5 flex-1 rounded-full transition-all duration-500 ${i < config.bars ? config.color : "bg-muted"}`} />
        ))}
      </div>
      <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
        <p className={`text-xs font-semibold ${level === "HIGH" ? "text-red-500 dark:text-red-400" : level === "MEDIUM" ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{config.title}</p>
        <p className="text-xs text-muted-foreground">{config.desc}</p>
      </div>
    </div>
  );
}

const REGIME_CONFIG: Record<Regime, { color: string; bg: string; icon: string }> = {
  RISK_ON:   { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "🟢" },
  RISK_OFF:  { color: "text-red-500 dark:text-red-400",         bg: "bg-red-50 dark:bg-red-950/30",         icon: "🔴" },
  INFLATION: { color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-950/30",     icon: "🟠" },
  LIQUIDITY: { color: "text-sky-600 dark:text-sky-400",         bg: "bg-sky-50 dark:bg-sky-950/30",         icon: "🔵" },
};

function MacroIndicatorCard({ title, value, valueColor, desc, impactLabel }: {
  title: string; value: string; valueColor: string; desc: string; impactLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
      <p className={`text-lg font-bold tracking-wide ${valueColor}`}>{value}</p>
      <div className="pt-1 border-t border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{impactLabel}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function MacroRadarPage() {
  const { t, language } = useLanguage();
  const m = t.macro;
  const isID = language === "id";

  const [now, setNow] = useState(Date.now());

  const { data: events = [], isLoading: eventsLoading } = useQuery<MacroEvent[]>({
    queryKey: ["/api/macro-radar/events"],
    refetchInterval: 60 * 1000,
  });

  const { data: indicators, isLoading: indLoading } = useQuery<MacroIndicators>({
    queryKey: ["/api/macro-radar/indicators"],
    refetchInterval: 10 * 60 * 1000,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextEvent    = useMemo(() => events[0] ?? null, [events]);
  const minsUntil   = useMemo(() => nextEvent ? minutesUntil(nextEvent.date) : Infinity, [nextEvent, now]);
  const msUntil     = useMemo(() => nextEvent ? new Date(nextEvent.date).getTime() - now : 0, [nextEvent, now]);

  const detectedCurrency = useMemo(() => nextEvent?.currency ?? "USD", [nextEvent]);
  const eventType        = useMemo(() => nextEvent ? detectEventType(nextEvent.event) : "OTHER", [nextEvent]);

  const isPostRelease = useMemo(
    () => nextEvent?.actual != null && nextEvent.actual.trim() !== "" && nextEvent.actual.trim() !== "-" && nextEvent.actual.trim() !== "—",
    [nextEvent],
  );

  const surprise = useMemo(
    () => isPostRelease ? calcSurprise(nextEvent?.actual ?? null, nextEvent?.forecast ?? null) : null,
    [isPostRelease, nextEvent],
  );

  const scenarios   = useMemo(() => buildScenarios(eventType, isID, detectedCurrency), [eventType, isID, detectedCurrency]);
  const quickImpact = useMemo(() => buildQuickImpact(eventType, isID), [eventType, isID]);

  const todayEvents = useMemo(() => events.filter((e) => isToday(e.date)), [events]);
  const riskLevel: RiskLevel = useMemo(() => todayEvents.length >= 2 ? "HIGH" : todayEvents.length === 1 ? "MEDIUM" : "LOW", [todayEvents]);

  const fredInsight = useMemo(() => indicators ? buildInsight(indicators, isID) : (isID ? "Memuat data makro…" : "Loading macro data…"), [indicators, isID]);

  const postInsight = useMemo(
    () => isPostRelease && nextEvent && surprise ? buildPostReleaseInsight(nextEvent, surprise, eventType, m) : null,
    [isPostRelease, nextEvent, surprise, eventType, m],
  );

  const bias      = useMemo(() => indicators ? buildBias(indicators) : { usd: "Neutral" as Bias, gold: "Neutral" as Bias, btc: "Neutral" as Bias }, [indicators]);
  const regime    = useMemo(() => indicators ? buildRegime(indicators) : "RISK_ON" as Regime, [indicators]);
  const indLevels = useMemo(() => indicators ? buildMacroIndicatorLevels(indicators) : null, [indicators]);

  const biasMeanings = useMemo(() => ({
    usd:  bias.usd  === "Bullish" ? m.usdBullish  : bias.usd  === "Bearish" ? m.usdBearish  : m.usdNeutral,
    gold: bias.gold === "Bullish" ? m.goldBullish : bias.gold === "Bearish" ? m.goldBearish : m.goldNeutral,
    btc:  bias.btc  === "Bullish" ? m.btcBullish  : bias.btc  === "Bearish" ? m.btcBearish  : bias.btc === "Volatile" ? m.btcVolatile : m.btcNeutral,
  }), [bias, m]);

  const postReleaseCurrencyPairs = useMemo(() => {
    if (!isPostRelease || !surprise) return null;
    const [pairsA, pairsB] = buildCurrencyPairs(detectedCurrency);
    const bullish = isBullishForCurrency(eventType, surprise.dir);
    return bullish ? pairsA : pairsB;
  }, [isPostRelease, surprise, detectedCurrency, eventType]);

  const regimeConfig = REGIME_CONFIG[regime];
  const regimeLabel  = regime === "RISK_ON" ? m.riskOn : regime === "RISK_OFF" ? m.riskOff : regime === "INFLATION" ? m.inflationRegime : m.liquidityRegime;
  const regimeDesc   = regime === "RISK_ON" ? m.riskOnDesc : regime === "RISK_OFF" ? m.riskOffDesc : regime === "INFLATION" ? m.inflationRegimeDesc : m.liquidityRegimeDesc;

  const isLoading = eventsLoading || indLoading;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto pb-8">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-500" />
          <h1 className="text-2xl font-bold tracking-tight">{m.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">{m.subtitle}</p>
      </div>

      {/* Volatility Warning <15 min */}
      {minsUntil >= 0 && minsUntil <= 15 && nextEvent && !isPostRelease && (
        <Card className="rounded-2xl border border-red-500/30 bg-red-500/10 dark:bg-red-500/15">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-600 dark:text-red-400">⚠ {m.volatilityWarning}</p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">{m.volatilityDesc}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 1. High Impact Event (+ Most Affected Markets) ─────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.highImpactEvent}</p>
            {isPostRelease && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-2 py-0.5">✓ {m.postRelease}</span>
            )}
            {!isPostRelease && nextEvent && (
              <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded px-2 py-0.5">{m.preRelease}</span>
            )}
          </div>

          {nextEvent ? (
            <>
              {!isPostRelease && minsUntil >= 0 && minsUntil <= 30 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">{m.incomingAlert}</p>
                </div>
              )}
              <div>
                <p className="text-lg font-bold leading-tight">{nextEvent.event}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{nextEvent.country}</span>
                  {nextEvent.currency && (
                    <span className="text-xs font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded px-1.5 py-0.5">
                      {nextEvent.currency}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{fmtDate(nextEvent.date)}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: m.forecast, val: nextEvent.forecast },
                  { label: m.previous, val: nextEvent.previous },
                  { label: m.actual,   val: nextEvent.actual },
                ].map(({ label, val }) => (
                  <div key={label} className={`rounded-xl p-3 text-center ${label === m.actual && isPostRelease ? "bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800" : "bg-muted/40"}`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                    <p className={`text-sm font-semibold mt-0.5 ${label === m.actual && isPostRelease ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{val != null ? val : "—"}</p>
                  </div>
                ))}
              </div>
              <MostAffectedMarkets currency={detectedCurrency} label={m.mostAffectedMarkets} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">{m.noEvents}</p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Countdown Timer (pre-release only) ──────────────────────── */}
      {nextEvent && !isPostRelease && msUntil > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
                <Clock className="w-4 h-4 text-sky-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.countdown}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-2 truncate">{nextEvent.event} — {m.releaseIn}</p>
              <p className={`text-5xl font-mono font-bold tracking-widest ${minsUntil <= 15 ? "text-red-500 dark:text-red-400" : minsUntil <= 30 ? "text-amber-500 dark:text-amber-400" : "text-foreground"}`}>
                {fmtCountdown(msUntil)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">{fmtDate(nextEvent.date)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 3a. Event Impact Prediction (PRE-RELEASE only) ─────────────── */}
      {nextEvent && !isPostRelease && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-violet-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.eventImpactPrediction}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {m.basedOn}: <span className="font-medium text-foreground">{nextEvent.event}</span>
              {nextEvent.currency && <span className="ml-2 text-[10px] font-semibold bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded px-1.5 py-0.5">{nextEvent.currency}</span>}
            </p>
            {scenarios.map((s) => <ScenarioCard key={s.label} s={s} currencyImpactLabel={m.currencyImpact} />)}
          </CardContent>
        </Card>
      )}

      {/* ── 3b. Quick Market Impact (PRE-RELEASE only) ─────────────────── */}
      {nextEvent && !isPostRelease && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-violet-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.quickMarketImpact}</p>
            </div>
            <QuickImpactBox condition={quickImpact.condition} items={quickImpact.items} />
          </CardContent>
        </Card>
      )}

      {/* ── 4a. News Surprise Indicator (POST-RELEASE only) ────────────── */}
      {isPostRelease && nextEvent && surprise && (
        <NewsSurpriseCard surprise={surprise} event={nextEvent} m={m} />
      )}

      {/* ── 4b. Actual Market Impact (POST-RELEASE only) ───────────────── */}
      {isPostRelease && nextEvent && surprise && (
        <ActualMarketImpactCard surprise={surprise} event={nextEvent} eventType={eventType} m={m} />
      )}

      {/* ── 5. AI Macro Insight (adapts post-release) ──────────────────── */}
      <Card className="rounded-2xl shadow-sm border-0 bg-emerald-50 dark:bg-emerald-950/30">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Brain className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">{m.aiMacroInsight}</p>
            {isPostRelease && <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">✦ {m.postRelease}</span>}
          </div>

          {isPostRelease && postInsight && (
            <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed font-medium border-b border-emerald-200 dark:border-emerald-800 pb-3">{postInsight}</p>
          )}
          <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">{fredInsight}</p>

          {indicators && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: m.fedFundsRate,      val: indicators.interestRate?.value, unit: "%" },
                { label: m.unemploymentLabel, val: indicators.unemployment?.value,  unit: "%" },
                { label: m.m2Supply,          val: indicators.moneySupply?.value,   unit: "B" },
                { label: m.cpiIndex,          val: indicators.inflation?.value,     unit: "" },
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

          {/* What It Means For Markets sub-section */}
          <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider mb-3">{m.whatItMeans}</p>
            <div className="space-y-2">
              {[
                { emoji: "💵", label: "USD",  meaning: biasMeanings.usd,  bias: bias.usd },
                { emoji: "🥇", label: "Gold", meaning: biasMeanings.gold, bias: bias.gold },
                { emoji: "₿",  label: "BTC",  meaning: biasMeanings.btc,  bias: bias.btc },
              ].map(({ emoji, label, meaning, bias: b }) => {
                const Icon = BIAS_ICON[b];
                return (
                  <div key={label} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{emoji}</span>
                      <span className="text-xs text-emerald-900 dark:text-emerald-200">{meaning}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-semibold shrink-0 ${BIAS_STYLE[b]}`}>
                      <Icon className="w-3 h-3" />{b}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 6. Market Risk Meter ───────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
              <Shield className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.marketRiskMeter}</p>
          </div>
          <RiskMeter level={riskLevel} t={m} />
          {todayEvents.length > 0 && (
            <div className="pt-1 space-y-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {m.todayEventsLabel} ({todayEvents.length})
              </p>
              {todayEvents.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-border last:border-0">
                  <span className="font-medium truncate max-w-[65%]">{e.event}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {new Date(e.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 7. Market Regime ───────────────────────────────────────────── */}
      <Card className={`rounded-2xl shadow-sm border-0 ${regimeConfig.bg}`}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/30 dark:bg-black/20 flex items-center justify-center">
              <Layers className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.marketRegime}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{regimeConfig.icon}</span>
            <p className={`text-2xl font-bold tracking-tight ${regimeConfig.color}`}>{regimeLabel}</p>
          </div>
          <div className="rounded-xl bg-white/40 dark:bg-black/20 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{m.meaning}</p>
            <p className="text-sm text-foreground leading-relaxed">{regimeDesc}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── 8. AI Trading Context (updated post-release) ───────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-1">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.aiTradingContext}</p>
            {isPostRelease && <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">✦ {m.postRelease}</span>}
          </div>

          {/* Post-release: show currency-specific pairs first */}
          {isPostRelease && postReleaseCurrencyPairs && postReleaseCurrencyPairs.length > 0 && (
            <div className="mb-1">
              {postReleaseCurrencyPairs.map(({ label, arrow }) => {
                const isBull = arrow === "↑";
                return (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-border gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">💱</span>
                      <span className="text-sm font-semibold">{label}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 font-semibold text-sm shrink-0 ${isBull ? BIAS_STYLE["Bullish"] : BIAS_STYLE["Bearish"]}`}>
                      {isBull ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {isBull ? m.bullishLabel : m.bearishLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <BiasRow label={isID ? "Dolar AS (USD)"  : "US Dollar (USD)"} emoji="💵" bias={bias.usd}  meaning={biasMeanings.usd} />
          <BiasRow label={isID ? "Emas (XAUUSD)"   : "Gold (XAUUSD)"}   emoji="🥇" bias={bias.gold} meaning={biasMeanings.gold} />
          <BiasRow label={isID ? "Bitcoin (BTC)"   : "Bitcoin (BTC)"}   emoji="₿"  bias={bias.btc}  meaning={biasMeanings.btc} />
          <p className="text-[10px] text-muted-foreground/60 pt-2">{m.basedOnFred}</p>
        </CardContent>
      </Card>

      {/* ── 9. Macro Indicator Impact Cards ────────────────────────────── */}
      {indLevels && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-orange-500" />
              </div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.macroIndicators}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MacroIndicatorCard
                title={m.dollarStrength}
                value={indLevels.dollar === "STRONG" ? m.strong : indLevels.dollar === "WEAK" ? m.weak : m.neutral}
                valueColor={indLevels.dollar === "STRONG" ? "text-emerald-600 dark:text-emerald-400" : indLevels.dollar === "WEAK" ? "text-red-500 dark:text-red-400" : "text-muted-foreground"}
                impactLabel={m.impact}
                desc={indLevels.dollar === "STRONG" ? m.dollarStrongDesc : indLevels.dollar === "WEAK" ? m.dollarWeakDesc : m.dollarNeutralDesc}
              />
              <MacroIndicatorCard
                title={m.realYield}
                value={indLevels.realYield === "RISING" ? m.rising : indLevels.realYield === "FALLING" ? m.falling : m.neutral}
                valueColor={indLevels.realYield === "RISING" ? "text-amber-600 dark:text-amber-400" : indLevels.realYield === "FALLING" ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}
                impactLabel={m.impact}
                desc={indLevels.realYield === "RISING" ? m.realYieldRisingDesc : indLevels.realYield === "FALLING" ? m.realYieldFallingDesc : m.realYieldNeutralDesc}
              />
              <MacroIndicatorCard
                title={m.liquidityTrend}
                value={indLevels.liquidity === "EXPANDING" ? m.expanding : m.contracting}
                valueColor={indLevels.liquidity === "EXPANDING" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}
                impactLabel={m.impact}
                desc={indLevels.liquidity === "EXPANDING" ? m.liquidityExpandDesc : m.liquidityContractDesc}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 10. Market Impact Map ──────────────────────────────────────── */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
              <Map className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{m.marketImpactMap}</p>
          </div>

          <div className="space-y-3">
            {IMPACT_MAP_FULL.map(({ currency, flag, pairs }) => (
              <div key={currency} className={`rounded-xl p-3 transition-colors ${currency === detectedCurrency && nextEvent ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800" : "bg-muted/30"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">{flag}</span>
                  <p className="text-xs font-semibold">{currency} {m.eventsLabel}</p>
                  {currency === detectedCurrency && nextEvent && (
                    <span className="ml-auto text-[10px] font-semibold text-orange-600 dark:text-orange-400">▶ {isID ? "Aktif" : "Active"}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pairs.map((pair) => (
                    <span key={pair} className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${currency === detectedCurrency && nextEvent ? "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800" : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900"}`}>
                      → {pair}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-muted/50 border border-dashed p-4 space-y-1.5">
            <p className="text-xs font-semibold text-foreground">{m.whyThisMatters}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{m.whyThisMattersDesc}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── 11. Upcoming Events List ───────────────────────────────────── */}
      {events.length > 1 && (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">{m.upcomingEvents}</p>
            <div className="space-y-0">
              {events.slice(0, 8).map((e, i) => (
                <div key={i} className="flex items-start justify-between py-2.5 border-b border-border last:border-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.event}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{e.country}</span>
                      {e.currency && <span className="text-[10px] font-semibold bg-muted rounded px-1 py-0.5">{e.currency}</span>}
                      {e.actual && <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-1 py-0.5">✓ {m.actual}</span>}
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
