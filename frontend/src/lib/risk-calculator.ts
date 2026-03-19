// ─── Risk Calculator — pure, no side effects ──────────────────────────────────
// Advisory system: guides users to appropriate lot sizes based on their balance
// and risk tolerance.  Results are estimates, not broker-exact figures.

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
  userLot?: number;   // optional: compare against recommended
}

export interface RiskResult {
  balanceUSD:       number;
  effectiveBalance: number;  // after cent-account divide
  riskAmount:       number;  // in USD
  recommendedLot:   number;
  multiplier:       number;  // $/lot/pip for the symbol
  userRiskAmount?:  number;  // what the user's lot actually risks
  userRiskPercent?: number;
  isOverRisk:       boolean;
  zone:             "safe" | "warning" | "danger";
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const USD_IDR_RATE = 15_500;

// $ value per lot per 1-pip (price-distance=1) movement
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

  // 1. Normalize balance to USD
  const balanceUSD = currency === "IDR" ? balance / USD_IDR_RATE : balance;

  // 2. Cent accounts have 1/100 the contract size
  const effectiveBalance = accountType === "cent" ? balanceUSD / 100 : balanceUSD;

  // 3. Dollar amount willing to risk
  const riskAmount = effectiveBalance * (riskPercent / 100);

  // 4. Lot size formula:  lot = riskAmount / (stopLoss × multiplier)
  const multiplier  = getMultiplier(symbol);
  const sl          = Math.max(stopLoss, 0.1);
  const rawLot      = riskAmount / (sl * multiplier);
  const recommendedLot = Math.max(0.01, Number(rawLot.toFixed(2)));

  // 5. User-lot comparison
  let userRiskAmount: number | undefined;
  let userRiskPercent: number | undefined;
  let isOverRisk = false;
  let zone: RiskResult["zone"] = "safe";

  if (userLot !== undefined && userLot > 0 && effectiveBalance > 0) {
    userRiskAmount  = userLot * sl * multiplier;
    userRiskPercent = (userRiskAmount / effectiveBalance) * 100;
    isOverRisk      = userLot > recommendedLot * 2;
    if      (isOverRisk)                   zone = "danger";
    else if (userLot > recommendedLot * 1.2) zone = "warning";
  }

  return {
    balanceUSD,
    effectiveBalance,
    riskAmount,
    recommendedLot,
    multiplier,
    userRiskAmount,
    userRiskPercent,
    isOverRisk,
    zone,
  };
}

// ─── Supported symbol list for the selector ───────────────────────────────────

export const RISK_SYMBOLS = [
  "XAUUSD", "XAGUSD", "EURUSD", "GBPUSD", "USDJPY",
  "AUDUSD", "USDCAD", "BTCUSD", "ETHUSD", "US30", "NAS100",
];
