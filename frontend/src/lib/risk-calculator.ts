// ─── Risk Calculator — pure, no side effects ──────────────────────────────────
// Advisory system: guides users to appropriate lot sizes based on their balance
// and risk tolerance.  Results are estimates, not broker-exact figures.
//
// CENT ACCOUNT RULE:
//   1 cent lot on the platform  =  0.01 standard lot in actual exposure.
//   The balance is entered as-is (it IS the real dollar amount, not cents).
//   Only the lot sizing is scaled: recommended display lots are 100× larger
//   than the equivalent standard lots so they match what the user sees on
//   their cent-account MT4/MT5 platform.

export type AccountCurrency = "USD" | "IDR";
export type AccountType     = "standard" | "cent";

export interface RiskSettings {
  balance:     number;
  currency:    AccountCurrency;
  accountType: AccountType;
  riskPercent: number;  // 0.5 – 5
}

export interface RiskInput extends RiskSettings {
  symbol:   string;
  stopLoss: number;   // pips / price-distance
  userLot?: number;   // optional: compare against recommended (in platform units)
}

export interface RiskResult {
  balanceUSD:            number;
  riskAmount:            number;  // in USD — always from full balance
  recommendedLot:        number;  // lots in platform units (cent lots if cent account)
  recommendedStandardLot: number; // equivalent standard lots for reference
  lotScaling:            number;  // 0.01 for cent, 1.0 for standard
  multiplier:            number;  // $/std-lot/pip for the symbol
  userRiskAmount?:       number;  // what the user's lot actually risks (USD)
  userRiskPercent?:      number;
  userStandardLot?:      number;  // user's lot converted to standard equivalent
  isOverRisk:            boolean;
  zone:                  "safe" | "warning" | "danger";
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const USD_IDR_RATE = 15_500;

// $ value per STANDARD lot per 1-unit price movement (approximate)
const MULTIPLIERS: Record<string, number> = {
  XAUUSD: 10,
  XAGUSD: 50,
  BTCUSD:  1,
  ETHUSD:  1,
  US30:   10,
  NAS100: 10,
  US500:  10,
};

export function getMultiplier(symbol: string): number {
  return MULTIPLIERS[symbol.toUpperCase()] ?? 10;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

export function calculateRisk(input: RiskInput): RiskResult {
  const { balance, currency, accountType, riskPercent, symbol, stopLoss, userLot } = input;

  // 1. Normalize balance to USD (balance is always the real dollar amount)
  const balanceUSD = currency === "IDR" ? balance / USD_IDR_RATE : balance;

  // 2. Dollar amount willing to risk (always from the full balance)
  const riskAmount = balanceUSD * (riskPercent / 100);

  // 3. Lot scaling factor:
  //    Cent account: 1 platform lot = 0.01 standard lot
  //    Standard account: 1 platform lot = 1 standard lot
  const lotScaling = accountType === "cent" ? 0.01 : 1;

  // 4. Lot size formula (working in standard lots):
  //    standard_lot = riskAmount / (stopLoss × multiplier_per_std_lot)
  const multiplier          = getMultiplier(symbol);
  const sl                  = Math.max(stopLoss, 0.1);
  const rawStdLot           = riskAmount / (sl * multiplier);

  // Convert to platform display lots (cent accounts show much larger numbers)
  const rawDisplayLot       = rawStdLot / lotScaling;
  const recommendedLot      = Math.max(0.01, Number(rawDisplayLot.toFixed(2)));
  const recommendedStandardLot = Number((recommendedLot * lotScaling).toFixed(4));

  // 5. User-lot comparison (user enters lots in platform units)
  let userRiskAmount: number | undefined;
  let userRiskPercent: number | undefined;
  let userStandardLot: number | undefined;
  let isOverRisk = false;
  let zone: RiskResult["zone"] = "safe";

  if (userLot !== undefined && userLot > 0 && balanceUSD > 0) {
    userStandardLot = userLot * lotScaling;            // convert to standard lots
    userRiskAmount  = userStandardLot * sl * multiplier;
    userRiskPercent = (userRiskAmount / balanceUSD) * 100;
    isOverRisk      = userStandardLot > recommendedStandardLot * 2;
    if      (isOverRisk)                                zone = "danger";
    else if (userStandardLot > recommendedStandardLot * 1.2) zone = "warning";
  }

  return {
    balanceUSD,
    riskAmount,
    recommendedLot,
    recommendedStandardLot,
    lotScaling,
    multiplier,
    userRiskAmount,
    userRiskPercent,
    userStandardLot,
    isOverRisk,
    zone,
  };
}

// ─── Supported symbol list for the selector ───────────────────────────────────

export const RISK_SYMBOLS = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY",
  "AUDUSD", "USDCAD", "BTCUSD", "ETHUSD", "US30", "NAS100",
];
