export interface TradeEntry {
  symbol: string;
  type: "buy" | "sell";
  lot: number;
  openPrice: number;
  closePrice: number;
  profit: number;
}

// ─── Known forex/commodity/index symbols ─────────────────────────────────────

const KNOWN_SYMBOLS = new Set([
  "XAUUSD","XAGUSD","BTCUSD","ETHUSD","EURUSD","GBPUSD",
  "USDJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURJPY",
  "GBPJPY","EURGBP","EURAUD","GBPAUD","AUDJPY","CADJPY",
  "CHFJPY","EURCHF","GBPCHF","EURCAD","GBPCAD","AUDCAD",
  "NZDJPY","AUDNZD","US30","US500","NAS100","UK100","GER40",
  "OIL","BRENT","COCOA","WHEAT","CORN","COFFEE",
]);

const KNOWN_BASE = [
  "XAU","XAG","BTC","ETH","EUR","GBP","AUD","NZD",
  "USD","JPY","CAD","CHF","NAS","GER","OIL","US3","US5",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeSymbol(raw: string): string {
  // Remove common broker suffixes like .sc .raw .ecn .pro .fx .m .i .std .mini
  return raw
    .replace(/\.(sc|raw|ecn|pro|plus|fx|i|m|std|mini|mt4|mt5)$/gi, "")
    .toUpperCase()
    .trim();
}

function isLikelySymbol(s: string): boolean {
  const clean = s.replace(/[^A-Z0-9]/g, "");
  if (KNOWN_SYMBOLS.has(clean)) return true;
  if (clean.length < 3 || clean.length > 10) return false;
  if (!/^[A-Z0-9]+$/.test(clean)) return false;
  return KNOWN_BASE.some(b => clean.startsWith(b));
}

function parseNum(str?: string): number | null {
  if (!str) return null;
  let s = str.trim();
  // parentheses = negative, e.g. (315.00) → -315.00
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function dedupe(trades: TradeEntry[]): TradeEntry[] {
  const seen = new Set<string>();
  return trades.filter(t => {
    const key = `${t.symbol}|${t.type}|${t.lot}|${t.openPrice}|${t.closePrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Text normalization ───────────────────────────────────────────────────────

export function cleanOCRText(raw: string): string {
  return raw
    .replace(/\r?\n/g, " ")           // flatten newlines
    .replace(/\t/g, " ")              // tabs → spaces
    .replace(/\.sc\b/gi, "")          // remove .sc broker suffix
    .replace(/[→➜>–—]/g, " ")        // arrows & dashes → space
    .replace(/BUY(\d)/gi, "BUY $1")   // "BUY2" → "BUY 2"
    .replace(/SELL(\d)/gi, "SELL $1") // "SELL2" → "SELL 2"
    .replace(/\s+/g, " ")            // collapse whitespace
    .toUpperCase()
    .trim();
}

// ─── Strategy 1: Global flexible regex (works on flat OCR text) ───────────────
// Matches: SYMBOL (BUY|SELL) LOT OPEN_PRICE CLOSE_PRICE PROFIT
// Tolerant of extra chars/numbers between fields

function parseGlobal(text: string): TradeEntry[] {
  const trades: TradeEntry[] = [];

  // Build symbol alternation from known set for tighter matching
  const symbolPattern = [
    ...KNOWN_SYMBOLS,
    "[A-Z]{3,6}(?:USD|JPY|EUR|GBP|AUD|CAD|CHF|NZD|CNH)",
  ].join("|");

  // Primary: SYMBOL (BUY|SELL) LOT OPEN CLOSE PROFIT
  const primary = new RegExp(
    `(${symbolPattern}|[A-Z]{3,10})\\s+(BUY|SELL)\\s+(\\d+[.,]?\\d*)\\s+(\\d+[.,]\\d+)\\s+(\\d+[.,]\\d+)\\s+(-?\\d+[.,]?\\d*)`,
    "gi"
  );

  let m: RegExpExecArray | null;
  while ((m = primary.exec(text)) !== null) {
    const symbol = normalizeSymbol(m[1]);
    if (!isLikelySymbol(symbol)) continue;
    const type   = m[2].toLowerCase() as "buy" | "sell";
    const lot    = parseNum(m[3]);
    const open   = parseNum(m[4]);
    const close  = parseNum(m[5]);
    const profit = parseNum(m[6]);
    if (lot == null || open == null || close == null || profit == null) continue;
    if (lot <= 0 || open <= 0 || close <= 0) continue;
    trades.push({ symbol, type, lot, openPrice: open, closePrice: close, profit });
  }

  // Fallback A: keyword-labelled format "SYMBOL BUY 1 lot open 3050 close 3055 profit 500"
  if (trades.length === 0) {
    const keyword = new RegExp(
      `(${[...KNOWN_SYMBOLS].join("|")}|[A-Z]{3,10})\\s+(BUY|SELL)\\s+(\\d+[.,]?\\d*)\\s*(?:LOT[S]?)?\\s*OPEN\\s+(\\d+[.,]\\d+)\\s*CLOSE\\s+(\\d+[.,]\\d+)\\s*PROFIT\\s+(-?\\d+[.,]?\\d*)`,
      "gi"
    );
    while ((m = keyword.exec(text)) !== null) {
      const symbol = normalizeSymbol(m[1]);
      if (!isLikelySymbol(symbol)) continue;
      const type   = m[2].toLowerCase() as "buy" | "sell";
      const lot    = parseNum(m[3]);
      const open   = parseNum(m[4]);
      const close  = parseNum(m[5]);
      const profit = parseNum(m[6]);
      if (lot == null || open == null || close == null || profit == null) continue;
      if (lot <= 0 || open <= 0 || close <= 0) continue;
      trades.push({ symbol, type, lot, openPrice: open, closePrice: close, profit });
    }
  }

  // Fallback B: (BUY|SELL) SYMBOL LOT OPEN CLOSE PROFIT
  if (trades.length === 0) {
    const reversed = new RegExp(
      `(BUY|SELL)\\s+(${symbolPattern}|[A-Z]{3,10})\\s+(\\d+[.,]?\\d*)\\s+(\\d+[.,]\\d+)\\s+(\\d+[.,]\\d+)\\s+(-?\\d+[.,]?\\d*)`,
      "gi"
    );
    while ((m = reversed.exec(text)) !== null) {
      const type   = m[1].toLowerCase() as "buy" | "sell";
      const symbol = normalizeSymbol(m[2]);
      if (!isLikelySymbol(symbol)) continue;
      const lot    = parseNum(m[3]);
      const open   = parseNum(m[4]);
      const close  = parseNum(m[5]);
      const profit = parseNum(m[6]);
      if (lot == null || open == null || close == null || profit == null) continue;
      if (lot <= 0 || open <= 0 || close <= 0) continue;
      trades.push({ symbol, type, lot, openPrice: open, closePrice: close, profit });
    }
  }

  return trades;
}

// ─── Strategy 2: Line-by-line structured patterns (MT4/MT5 history tables) ────

function parseByLine(rawText: string): TradeEntry[] {
  const trades: TradeEntry[] = [];

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const patterns: RegExp[] = [
    // 1. "XAUUSD.sc buy 2.0 4833.69 → 4834.32 315.00"
    /^([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+)\s+([\d.,]+)\s*[→>➜\-–]+\s*([\d.,]+)\s+([-().\d,]+)/i,

    // 2. "XAUUSD buy 2 open:4833.69 close:4834.32 profit:315"
    /^([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+).*?open[:\s]+([\d.,]+).*?close[:\s]+([\d.,]+).*?profit[:\s]+([-().\d,]+)/i,

    // 3. "buy XAUUSD 2.0 4833.69 4834.32 315.00"
    /^(buy|sell)\s+([A-Z][A-Z0-9.]{2,12})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([-().\d,]+)/i,

    // 4. "2.0 buy XAUUSD 4833.69 4834.32 315.00"
    /^([\d.,]+)\s+(buy|sell)\s+([A-Z][A-Z0-9.]{2,12})\s+([\d.,]+)\s+([\d.,]+)\s+([-().\d,]+)/i,

    // 5. MT5 table row with leading row number: "1 XAUUSD buy 2.0 4833.69 4834.32 ... 315.00"
    /^\d+\s+([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+[-\d.,]+\s+([-().\d,]+)/i,

    // 6. Simplified 5-col: symbol type lot open close profit
    /^([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([-().\d,]+)/i,
  ];

  for (const line of lines) {
    // Normalise this line too (remove broker suffix, arrows)
    const normLine = line
      .replace(/\.sc\b/gi, "")
      .replace(/[→➜>–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    for (let pi = 0; pi < patterns.length; pi++) {
      const m = normLine.match(patterns[pi]);
      if (!m) continue;

      let rawSymbol: string, rawType: string;
      let lotStr: string, openStr: string, closeStr: string, profitStr: string;

      if (pi === 2) {
        rawType = m[1]; rawSymbol = m[2];
        lotStr = m[3]; openStr = m[4]; closeStr = m[5]; profitStr = m[6];
      } else if (pi === 3) {
        lotStr = m[1]; rawType = m[2]; rawSymbol = m[3];
        openStr = m[4]; closeStr = m[5]; profitStr = m[6];
      } else {
        rawSymbol = m[1]; rawType = m[2];
        lotStr = m[3]; openStr = m[4]; closeStr = m[5]; profitStr = m[6];
      }

      const symbol = normalizeSymbol(rawSymbol);
      if (!isLikelySymbol(symbol)) continue;

      const lot        = parseNum(lotStr);
      const openPrice  = parseNum(openStr);
      const closePrice = parseNum(closeStr);
      const profit     = parseNum(profitStr);

      if (lot == null || openPrice == null || closePrice == null || profit == null) continue;
      if (lot <= 0 || openPrice <= 0 || closePrice <= 0) continue;

      trades.push({ symbol, type: rawType.toLowerCase() as "buy" | "sell", lot, openPrice, closePrice, profit });
      break;
    }
  }

  return trades;
}

// ─── Strategy 3: 3-line grouped OCR format ────────────────────────────────────
// Handles output where each trade is split across 3 consecutive lines:
//   Line 1 (header): "XAUUSD.sc sell 4"   → symbol, type, lot
//   Line 2 (prices): "4851.54 → 4851.55"  → openPrice, closePrice
//   Line 3 (profit): "-4.00"               → profit
//
// The parser scans the line array for a header line; when found it reads the
// next two lines for prices and profit, then jumps ahead by 2.

function parseGrouped(rawText: string): TradeEntry[] {
  const trades: TradeEntry[] = [];

  const lines = rawText
    .replace(/\.sc\b/gi, "")          // XAUUSD.sc → XAUUSD
    .replace(/\r?\n/g, "\n")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // Matches "XAUUSD sell 4" or "XAUUSD.sc buy 2.5"
  const headerRe = /^([A-Z][A-Z0-9]{2,9}(?:\.[A-Z]{1,5})?)\s+(buy|sell)\s+([\d.,]+)/i;

  // Matches "4851.54 → 4851.55" — various arrow characters
  const priceRe = /([\d.,]+)\s*[→➜>→\-–]+\s*([\d.,]+)/i;

  // Matches a bare number, possibly negative or in parens
  const profitRe = /^(-?[\d.,]+|\([\d.,]+\))$/;

  for (let i = 0; i < lines.length; i++) {
    const hm = lines[i].match(headerRe);
    if (!hm) continue;

    const symbol = normalizeSymbol(hm[1]);
    if (!isLikelySymbol(symbol)) continue;

    const type = hm[2].toLowerCase() as "buy" | "sell";
    const lot  = parseNum(hm[3]);
    if (lot == null || lot <= 0) continue;

    // Scan ahead (skip any blank noise lines) for the price line
    let priceIdx = -1;
    let pm: RegExpMatchArray | null = null;
    for (let j = i + 1; j <= i + 4 && j < lines.length; j++) {
      pm = lines[j].match(priceRe);
      if (pm) { priceIdx = j; break; }
    }
    if (priceIdx === -1 || !pm) continue;

    const openPrice  = parseNum(pm[1]);
    const closePrice = parseNum(pm[2]);
    if (openPrice == null || closePrice == null || openPrice <= 0 || closePrice <= 0) continue;

    // Scan one more line ahead for the profit value
    let profit: number | null = null;
    for (let j = priceIdx + 1; j <= priceIdx + 3 && j < lines.length; j++) {
      if (profitRe.test(lines[j])) {
        profit = parseNum(lines[j]);
        if (profit !== null) { i = j; break; }  // advance outer loop past this trade
      }
    }
    if (profit === null) continue;  // profit line missing — skip safely

    trades.push({ symbol, type, lot, openPrice, closePrice, profit });
  }

  return trades;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ParseResult {
  trades: TradeEntry[];
  cleanText: string;
}

export function parseForexTrades(rawText: string): ParseResult {
  const cleanText = cleanOCRText(rawText);

  // Strategy 1: single-line structured rows (MT4/MT5 history tables, all data on one line)
  let trades = parseByLine(rawText);

  // Strategy 2: 3-line grouped OCR format (header / prices / profit on separate lines)
  if (trades.length === 0) {
    trades = parseGrouped(rawText);
  }

  // Strategy 3: global flat-text regex (last resort — messy single-line OCR blob)
  if (trades.length === 0) {
    trades = parseGlobal(cleanText);
  }

  // Final deduplication
  trades = dedupe(trades);

  return { trades, cleanText };
}
