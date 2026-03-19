// ─── Profit Calculator — validates and corrects OCR-parsed profit values ───────
//
// OCR sometimes misreads the sign or magnitude of a profit figure.
// This module recalculates the expected profit from price movement and
// compares it against the OCR value.  If the sign is wrong OR the deviation
// exceeds 5 %, the calculated value is used instead.

// Dollar value per lot per 1-unit price movement (approximate broker values)
const PROFIT_MULTIPLIERS: Record<string, number> = {
  XAUUSD: 10,    // $10 / lot / $1 move
  XAGUSD: 50,    // $50 / lot / $1 move
  BTCUSD:  1,    // $1  / lot / $1 move
  ETHUSD:  1,
  US30:   10,
  NAS100: 10,
  US500:  10,
};

function getMultiplier(symbol: string): number {
  return PROFIT_MULTIPLIERS[symbol.toUpperCase()] ?? 10;
}

/**
 * Calculate expected profit from price movement.
 *
 * BUY  → profit when price goes UP  (closePrice > openPrice)
 * SELL → profit when price goes DOWN (closePrice < openPrice)
 */
export function calculateExpectedProfit(
  type: "buy" | "sell",
  openPrice: number,
  closePrice: number,
  lot: number,
  symbol: string,
): number {
  const diff       = closePrice - openPrice;
  const direction  = type === "buy" ? 1 : -1;
  const multiplier = getMultiplier(symbol);
  return Number((direction * diff * lot * multiplier).toFixed(2));
}

/**
 * Validate an OCR-parsed profit against the expected calculation.
 * Returns the corrected profit value.
 *
 * Rules (in priority order):
 *   1. If the OCR sign is the opposite of what the price movement dictates
 *      → always override (wrong sign is a definite OCR error)
 *   2. If the absolute deviation is > 5 % of the calculated value
 *      → override with the calculated value
 *   3. Otherwise keep the OCR value (it's within tolerance — could include
 *      real broker factors like spread, commission, or swap)
 */
export function validateAndCorrectProfit(
  ocrProfit: number,
  type: "buy" | "sell",
  openPrice: number,
  closePrice: number,
  lot: number,
  symbol: string,
): number {
  const calculated = calculateExpectedProfit(type, openPrice, closePrice, lot, symbol);

  // Can't validate if prices are identical — keep OCR value
  if (calculated === 0) return ocrProfit;

  // Rule 1: wrong sign → definitely incorrect, override
  if (Math.sign(ocrProfit) !== 0 && Math.sign(ocrProfit) !== Math.sign(calculated)) {
    return calculated;
  }

  // Rule 2: too far from calculated (> 5 % deviation) → override
  if (Math.abs(ocrProfit - calculated) > Math.abs(calculated * 0.05)) {
    return calculated;
  }

  return ocrProfit;
}
