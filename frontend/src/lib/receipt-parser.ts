import { format } from "date-fns";

const MONTH_NAMES: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  januari: 0, februari: 1, maret: 2, april: 3, mei: 4, juni: 5,
  juli: 6, agustus: 7, september: 8, oktober: 9, november: 10, desember: 11,
};

// Strip known currency symbols from a string for cleaner number extraction
function stripCurrency(s: string): string {
  return s
    .replace(/rp\.?\s*/gi, "")
    .replace(/\bidr\b/gi, "")
    .replace(/\busd\b/gi, "").replace(/\$/g, "")
    .replace(/\bsgd\b/gi, "")
    .replace(/\bmyr\b/gi, "").replace(/rm\s*/gi, "")
    .replace(/\beur\b/gi, "").replace(/€/g, "")
    .replace(/\bgbp\b/gi, "").replace(/£/g, "");
}

// Extract the largest numeric value from a line (handles Indonesian + international formats)
function extractNumber(line: string): number | null {
  const s = stripCurrency(line);
  const candidates: number[] = [];

  // Indonesian format: dots as thousand separators → 1.500.000, 45.000
  for (const raw of s.match(/\d{1,3}(?:\.\d{3})+/g) ?? []) {
    const val = parseInt(raw.replace(/\./g, ""), 10);
    if (!isNaN(val)) candidates.push(val);
  }

  // International format: commas as thousand separators → 1,500,000 45,000
  for (const raw of s.match(/\d{1,3}(?:,\d{3})+/g) ?? []) {
    const val = parseInt(raw.replace(/,/g, ""), 10);
    if (!isNaN(val)) candidates.push(val);
  }

  // Decimal amounts (foreign currency): 10.50, 99.99
  for (const raw of s.match(/\b\d{1,6}\.\d{2}\b/g) ?? []) {
    const val = parseFloat(raw);
    if (!isNaN(val)) candidates.push(Math.round(val));
  }

  // Plain 4–9 digit integers
  for (const raw of s.match(/\b\d{4,9}\b/g) ?? []) {
    const val = parseInt(raw, 10);
    if (!isNaN(val)) candidates.push(val);
  }

  const valid = candidates.filter(v => v >= 100 && v <= 999_999_999);
  return valid.length ? Math.max(...valid) : null;
}

// Transfer detection keywords
const TRANSFER_KEYWORDS = [
  /transfer\s*berhasil/i,
  /bukti\s*transfer/i,
  /transaction\s*success/i,
  /berhasil\s*dikirim/i,
  /pengiriman\s*berhasil/i,
  /\btransfer\b/i,
];

export function detectTransfer(text: string): boolean {
  return TRANSFER_KEYWORDS.some(kw => kw.test(text));
}

// Extract recipient name from transfer OCR text
export function parseRecipient(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const RECIPIENT_KEYWORDS = /^(penerima|recipient|kepada|to|transfer\s*ke|nama\s*penerima)$/i;
  const PREFIX_STRIP = /^(sdr\.?|bpk\.?|ibu\.?|sdri\.?|mr\.?|ms\.?|mrs\.?)\s+/i;

  for (let i = 0; i < lines.length - 1; i++) {
    if (RECIPIENT_KEYWORDS.test(lines[i])) {
      const raw = lines[i + 1].replace(PREFIX_STRIP, "").trim();
      if (raw.length > 1) return raw.slice(0, 60);
    }
  }

  // Fallback: look for "Penerima: NAME" on the same line
  const inline = text.match(/(?:penerima|recipient|to)\s*[:\-]\s*(.+)/i);
  if (inline) {
    return inline[1].replace(PREFIX_STRIP, "").trim().slice(0, 60);
  }

  return "";
}

// Detect bank/payment provider names in OCR text
const BANK_PATTERNS: [RegExp, string][] = [
  [/\bbca\b/i,          "BCA"],
  [/\bbni\b/i,          "BNI"],
  [/\bmandiri\b/i,      "Mandiri"],
  [/\bbri\b/i,          "BRI"],
  [/\bcimb\b/i,         "CIMB"],
  [/\bpermata\b/i,      "Permata"],
  [/\bdanamon\b/i,      "Danamon"],
  [/\bocbc\b/i,         "OCBC"],
  [/\bsinarmas\b/i,     "Sinarmas"],
  [/\bpanin\b/i,        "Panin"],
  [/\bbtpn\b/i,         "BTPN"],
  [/\bjenius\b/i,       "Jenius"],
  [/\bseabank\b/i,      "SeaBank"],
  [/\bjago\b/i,         "Bank Jago"],
  [/\blivin\b/i,        "Mandiri"],
  [/\bqris\b/i,         "QRIS"],
  [/\bovo\b/i,          "OVO"],
  [/\bgopay\b/i,        "GoPay"],
  [/\bdana\b/i,         "DANA"],
  [/\bshopeepay\b/i,    "ShopeePay"],
  [/\blinkaja\b/i,      "LinkAja"],
];

function detectBank(text: string): string | null {
  const isTransfer = /transfer|kirim|debit|kredit|tarik|setor|payment|pembayaran|transaksi/i.test(text);
  if (!isTransfer) return null;
  for (const [pat, name] of BANK_PATTERNS) {
    if (pat.test(text)) return name;
  }
  return null;
}

// Public: detect bank/e-wallet name without requiring transfer context
export function detectBankName(text: string): string | null {
  for (const [pat, name] of BANK_PATTERNS) {
    if (pat.test(text)) return name;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function parseTotal(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Keywords ordered by specificity
  const primary = [
    /\btotal\s*bayar\b/i,
    /\bgrand\s*total\b/i,
    /\btotal\s*pembayaran\b/i,
    /\btotal\s*belanja\b/i,
    /\btotal\s*tagihan\b/i,
    /\btotal\s*rp\b/i,
    /\bjumlah\s*pembayaran\b/i,
    /\bjumlah\s*total\b/i,
    /\bcharge\s*total\b/i,
    /\bamount\s*due\b/i,
    /\btotal\s*due\b/i,
    /\btotal\s*amount\b/i,
  ];

  const secondary = [
    /\btotal\b/i,
    /\bjumlah\b/i,
    /\bamount\b/i,
    /\bpayment\b/i,
    /\bpembayaran\b/i,
    /\bnominal\b/i,
  ];

  const tertiary = [
    /\bsubtotal\b/i,
    /\bsub\s*total\b/i,
    /\bjumlah\s*sementara\b/i,
    /\bharga\b/i,
  ];

  const tryKeywords = (keywords: RegExp[]) => {
    for (const kw of keywords) {
      for (let i = 0; i < lines.length; i++) {
        if (kw.test(lines[i])) {
          // Same-line amount
          const num = extractNumber(lines[i]);
          if (num) return String(num);
          // Amount on the very next line (multi-line receipts)
          if (i + 1 < lines.length) {
            const next = extractNumber(lines[i + 1]);
            if (next) return String(next);
          }
        }
      }
    }
    return null;
  };

  const r1 = tryKeywords(primary);
  if (r1) return r1;
  const r2 = tryKeywords(secondary);
  if (r2) return r2;
  const r3 = tryKeywords(tertiary);
  if (r3) return r3;

  // Fallback: largest formatted number on the page
  const allCandidates: number[] = [];
  for (const raw of text.match(/\d{1,3}(?:[.,]\d{3})+/g) ?? []) {
    if (/^\d{1,3}(\.\d{3})+$/.test(raw)) allCandidates.push(parseInt(raw.replace(/\./g, ""), 10));
    else if (/^\d{1,3}(,\d{3})+$/.test(raw)) allCandidates.push(parseInt(raw.replace(/,/g, ""), 10));
  }
  for (const raw of text.match(/\b\d{4,9}\b/g) ?? []) {
    allCandidates.push(parseInt(raw, 10));
  }
  const valid = allCandidates.filter(n => !isNaN(n) && n >= 1_000 && n <= 999_999_999);
  return valid.length ? String(Math.max(...valid)) : "";
}

export function parseMerchant(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Payment proof: extract bank / e-wallet name
  const bank = detectBank(text);
  if (bank) return bank;

  // Look for the first line that is mostly uppercase and contains letters
  for (const line of lines.slice(0, 6)) {
    if (line.length < 3) continue;
    if (/^\d+$/.test(line)) continue;               // skip pure numbers
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(line)) continue; // skip dates

    const letters = line.replace(/[^a-zA-Z]/g, "");
    const uppers  = line.replace(/[^A-Z]/g, "");
    if (letters.length > 0 && uppers.length / letters.length >= 0.5) {
      return line.replace(/[^a-zA-Z0-9 &'.,()\-]/g, "").trim().slice(0, 60);
    }
  }

  // Fall back to first text-containing line
  for (const line of lines.slice(0, 5)) {
    if (/[a-zA-Z]/.test(line) && line.length > 2) {
      return line.replace(/[^a-zA-Z0-9 &'.,()\-]/g, "").trim().slice(0, 60);
    }
  }

  return lines[0]?.slice(0, 60) || "Merchant";
}

export function parseDate(text: string): string {
  // ISO / reverse: 2026-03-09 or 2026/03/09
  const iso = text.match(/\b(20\d{2})[\/\-](0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) {
    const [, y, m, d] = iso;
    try {
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (!isNaN(date.getTime())) return format(date, "yyyy-MM-dd");
    } catch { /* ignore */ }
  }

  // DD/MM/YYYY or DD-MM-YYYY (including time: 09/03/2026 14:30)
  const dmy = text.match(/\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? "20" + y : y;
    try {
      const date = new Date(Number(year), Number(m) - 1, Number(d));
      if (!isNaN(date.getTime()) && Number(year) >= 2000 && Number(year) <= 2100) {
        return format(date, "yyyy-MM-dd");
      }
    } catch { /* ignore */ }
  }

  // DD Month YYYY — supports Indonesian + English
  const dMonthY = text.match(/\b(\d{1,2})\s+([a-zA-Z]{3,})\s+(20\d{2})\b/);
  if (dMonthY) {
    const [, d, monthStr, y] = dMonthY;
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

export function suggestCategory(merchant: string, fullText = ""): string {
  const m   = merchant.toLowerCase();
  const all = (fullText + " " + merchant).toLowerCase();

  // Payment proofs → Other Needs
  if (/\b(transfer|qris|debit|kredit|tarik tunai|setor|kirim uang|pembayaran|payment|atm|bca|bni|bri|mandiri|cimb|ovo|gopay|dana|shopeepay|linkaja|jenius|seabank|jago)\b/.test(all)
    && /\b(berhasil|sukses|success|confirmed|terproses|diterima)\b/.test(all)) {
    return "Other Needs";
  }

  // Food & Drinks
  if (/indomaret|alfamart|superindo|circle k|7.eleven|sevel|lawson|family mart|minimarket/.test(m)) return "Food & Drinks";
  if (/mcd|mcdonalds|kfc|pizza|burger|restoran|warung|cafe|kopi|coffee|bakery|roti|breadtalk|starbucks|jco|dunkin|hokben|yoshinoya|subway|domino|chatime|koi|mixue|janji jiwa|kenangan|fore|kalamansi|sushi/.test(m)) return "Food & Drinks";
  if (/transmart|carrefour|hypermart|giant|lotte mart|ranch market|hero|food hall/.test(m)) return "Food & Drinks";
  if (/restoran|rumah makan|kantin|nasi|mie|bakso|soto|padang|warteg|seafood|ayam|bebek|geprek/.test(m)) return "Food & Drinks";

  // Snacks
  if (/snack|keripik|coklat|permen|biscuit|chip|wafer|teh botol|aqua|pocari|minute maid|indomie/.test(m)) return "Snacks";

  // Transportation
  if (/grab|gojek|uber|taxi|taksi|ojek|busway|transjakarta|commuter|kereta|bus|angkot|bensin|shell|pertamina|bp\b|spbu|vivo|bahan bakar|parkir|toll|tol/.test(m)) return "Transportation";

  // Shopping
  if (/tokopedia|shopee|lazada|blibli|bukalapak|jd\.id|tiktok|zalora|blibli|akulaku|kredivo/.test(m)) return "Shopping";
  if (/mall|plaza|square|fashion|clothing|baju|sepatu|tas|jam tangan|perhiasan|aksesoris/.test(m)) return "Shopping";

  // Hangout / Entertainment
  if (/bioskop|cinema|xxi|cgv|imax|netflix|spotify|youtube premium|game|play store|steam/.test(m)) return "Entertainment";
  if (/karaoke|bowling|golf|fitness|gym|studio/.test(m)) return "Hangout";

  // Health
  if (/rs\b|rumah sakit|klinik|apotek|farmasi|puskesmas|dokter|dental|kimia farma|guardian|century|watsons|k24/.test(m)) return "Health";

  // Education
  if (/gramedia|toko buku|perpustakaan|kursus|sekolah|universitas|college|bimbel|les/.test(m)) return "Education";

  // Utilities
  if (/pln|listrik|electricity|token listrik/.test(m)) return "Electricity";
  if (/pdam|air\b|water/.test(m)) return "Water";
  if (/telkom|indihome|wifi|internet|xl|telkomsel|axis|smartfren|by\.u|im3|tri\b|three/.test(m)) return "Other Needs";
  if (/sewa|kontrakan|kos\b|rent|housing|rumah/.test(m)) return "Housing";

  // Hobby / Lifestyle
  if (/salon|spa|barber|barbershop|treatment|perawatan/.test(m)) return "Lifestyle";
  if (/buku|majalah|komik|novel/.test(m)) return "Hobby";

  return "Shopping";
}
