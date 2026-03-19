export interface TradeEntry {
  symbol: string;
  type: "buy" | "sell";
  lot: number;
  openPrice: number;
  closePrice: number;
  profit: number;
}

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

export function normalizeSymbol(raw: string): string {
  return raw.replace(/\.(sc|raw|ecn|pro|plus|fx|i|m|std|mini)$/gi, "").toUpperCase().trim();
}

function isLikelySymbol(s: string): boolean {
  if (KNOWN_SYMBOLS.has(s)) return true;
  if (s.length < 3 || s.length > 10) return false;
  if (!/^[A-Z0-9]+$/.test(s)) return false;
  return KNOWN_BASE.some(b => s.startsWith(b));
}

function parseNum(str?: string): number | null {
  if (!str) return null;
  let s = str.trim();
  if (s.startsWith("(") && s.endsWith(")")) s = "-" + s.slice(1, -1);
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

export function parseForexTrades(rawText: string): TradeEntry[] {
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

    // 5. MT5 table row: "1 XAUUSD buy 2.0 4833.69 4834.32 ... 315.00"
    /^\d+\s+([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+[-\d.,]+\s+([-().\d,]+)/i,

    // 6. Simplified 5-col: symbol type lot open close profit
    /^([A-Z][A-Z0-9.]{2,12})\s+(buy|sell)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([-().\d,]+)/i,
  ];

  for (const line of lines) {
    for (let pi = 0; pi < patterns.length; pi++) {
      const m = line.match(patterns[pi]);
      if (!m) continue;

      let rawSymbol: string, rawType: string;
      let lotStr: string, openStr: string, closeStr: string, profitStr: string;

      if (pi === 2) {
        // pattern 3: type first, symbol second
        rawType   = m[1]; rawSymbol = m[2];
        lotStr    = m[3]; openStr   = m[4]; closeStr  = m[5]; profitStr = m[6];
      } else if (pi === 3) {
        // pattern 4: lot first, type second, symbol third
        lotStr    = m[1]; rawType = m[2]; rawSymbol = m[3];
        openStr   = m[4]; closeStr = m[5]; profitStr = m[6];
      } else {
        // patterns 1,2,5,6: symbol first, type second
        rawSymbol = m[1]; rawType   = m[2];
        lotStr    = m[3]; openStr   = m[4]; closeStr  = m[5]; profitStr = m[6];
      }

      const symbol = normalizeSymbol(rawSymbol);
      if (!isLikelySymbol(symbol)) continue;

      const lot       = parseNum(lotStr);
      const openPrice = parseNum(openStr);
      const closePrice = parseNum(closeStr);
      const profit    = parseNum(profitStr);

      if (lot == null || openPrice == null || closePrice == null || profit == null) continue;
      if (lot <= 0 || openPrice <= 0 || closePrice <= 0) continue;

      trades.push({
        symbol,
        type: rawType.toLowerCase() as "buy" | "sell",
        lot,
        openPrice,
        closePrice,
        profit,
      });
      break;
    }
  }

  const seen = new Set<string>();
  return trades.filter(t => {
    const key = `${t.symbol}|${t.type}|${t.lot}|${t.openPrice}|${t.closePrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
