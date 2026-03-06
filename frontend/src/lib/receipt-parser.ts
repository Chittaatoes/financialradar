import { format } from "date-fns";

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

function extractNumber(line: string): number | null {
  const patterns = [
    /(\d{1,3}(?:\.\d{3})+)/g,
    /(\d{1,3}(?:,\d{3})+)/g,
    /(\d{4,7})/g,
  ];

  const candidates: number[] = [];

  for (const pattern of patterns) {
    const matches = line.match(pattern) || [];
    for (const raw of matches) {
      let val: number;
      if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
        val = parseInt(raw.replace(/\./g, ""), 10);
      } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
        val = parseInt(raw.replace(/,/g, ""), 10);
      } else {
        val = parseInt(raw, 10);
      }
      if (!isNaN(val) && val >= 100 && val <= 10_000_000) {
        candidates.push(val);
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

export function parseTotal(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const primaryKeywords = [
    /\btotal bayar\b/i,
    /\bgrand total\b/i,
    /\btotal pembayaran\b/i,
    /\btotal belanja\b/i,
    /\btotal rp\b/i,
    /\btotal\b/i,
  ];

  for (const kw of primaryKeywords) {
    for (const line of lines) {
      if (kw.test(line)) {
        const num = extractNumber(line);
        if (num) return String(num);
      }
    }
  }

  const secondaryKeywords = [
    /\bjumlah total\b/i,
    /\bjumlah\b/i,
    /\bamount due\b/i,
    /\btotal due\b/i,
    /\bpayment\b/i,
    /\bamount\b/i,
  ];

  for (const kw of secondaryKeywords) {
    for (const line of lines) {
      if (kw.test(line)) {
        const num = extractNumber(line);
        if (num) return String(num);
      }
    }
  }

  const subtotalKeywords = [/\bsubtotal\b/i, /\bsub total\b/i, /\bjumlah sementara\b/i];
  for (const kw of subtotalKeywords) {
    for (const line of lines) {
      if (kw.test(line)) {
        const num = extractNumber(line);
        if (num) return String(num);
      }
    }
  }

  const allFormatted = text.match(/\d{1,3}(?:[.,]\d{3})+/g) || [];
  const plain4to7 = text.match(/\b\d{4,7}\b/g) || [];
  const allCandidates = [...allFormatted, ...plain4to7]
    .map(raw => {
      if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return parseInt(raw.replace(/\./g, ""), 10);
      if (/^\d{1,3}(,\d{3})+$/.test(raw)) return parseInt(raw.replace(/,/g, ""), 10);
      return parseInt(raw, 10);
    })
    .filter(n => !isNaN(n) && n >= 1000 && n <= 1_000_000);

  if (allCandidates.length > 0) return String(Math.max(...allCandidates));
  return "";
}

export function parseMerchant(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    if (/[a-zA-Z]/.test(line) && line.length > 3 && !/^\d+$/.test(line)) {
      return line.replace(/[^a-zA-Z0-9 &'.-]/g, "").trim();
    }
  }
  return lines[0] || "Merchant";
}

export function parseDate(text: string): string {
  const ddmmyyyy = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    const year = y.length === 2 ? "20" + y : y;
    try {
      const date = new Date(Number(year), Number(m) - 1, Number(d));
      if (!isNaN(date.getTime()) && Number(year) >= 2000 && Number(year) <= 2100) {
        return format(date, "yyyy-MM-dd");
      }
    } catch { /* ignore */ }
  }

  const ddMonthYyyy = text.match(/(\d{1,2})\s+([a-zA-Z]{3,})\s+(\d{4})/);
  if (ddMonthYyyy) {
    const [, d, monthStr, y] = ddMonthYyyy;
    const monthIdx = MONTH_NAMES[monthStr.toLowerCase()];
    if (monthIdx !== undefined) {
      try {
        const date = new Date(Number(y), monthIdx, Number(d));
        if (!isNaN(date.getTime())) return format(date, "yyyy-MM-dd");
      } catch { /* ignore */ }
    }
  }

  return format(new Date(), "yyyy-MM-dd");
}

export function suggestCategory(merchant: string): string {
  const m = merchant.toLowerCase();
  if (/indomaret|alfamart|superindo|circle k|7.eleven|sevel|lawson|family mart|minimarket/.test(m)) return "Food & Drinks";
  if (/shell|pertamina|bp|spbu|vivo|bensin|bahan bakar/.test(m)) return "Transportation";
  if (/tokopedia|shopee|lazada|blibli|bukalapak|jd\.id|tiktok/.test(m)) return "Shopping";
  if (/rs |rumah sakit|klinik|apotek|farmasi|puskesmas|dokter|dental|kimia farma|guardian/.test(m)) return "Health";
  if (/mcd|mcdonalds|kfc|pizza|burger|restoran|warung|cafe|kopi|coffee|bakery|roti|breadtalk|starbucks|jco/.test(m)) return "Food & Drinks";
  if (/gramedia|toko buku/.test(m)) return "Education";
  if (/pln|listrik|pdam|telkom|indihome/.test(m)) return "Electricity";
  if (/transmart|carrefour|hypermart|giant/.test(m)) return "Shopping";
  return "Shopping";
}
