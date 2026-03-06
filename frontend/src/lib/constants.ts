/**
 * ===== CONSTANTS & UTILITIES =====
 * Shared configuration for Financial Radar's gamification and formatting.
 *
 * - LEVEL_THRESHOLDS: XP required per level (1-10)
 * - FEATURE_UNLOCKS: Which features unlock at which level
 * - XP_REWARDS: XP amounts for various actions
 * - EXPENSE/INCOME_CATEGORIES: Default category lists for transactions
 * - formatCurrency(): IDR currency formatter
 * - getLevelFromXp() / getXpForNextLevel(): Level calculation utilities
 * - isFeatureUnlocked(): Check if a feature is available at given level
 */

// === LEVEL SYSTEM ===
// XP thresholds increase progressively. Max level is 10.
export const LEVEL_THRESHOLDS = [
  { level: 1, xp: 0 },
  { level: 2, xp: 50 },
  { level: 3, xp: 120 },
  { level: 4, xp: 220 },
  { level: 5, xp: 350 },
  { level: 6, xp: 520 },
  { level: 7, xp: 730 },
  { level: 8, xp: 1000 },
  { level: 9, xp: 1350 },
  { level: 10, xp: 1800 },
];

// === FEATURE UNLOCKS ===
// Maps level → array of feature keys that become available.
// Used by sidebar to show/lock navigation items.
export const FEATURE_UNLOCKS: Record<number, string[]> = {
  1: ["core"],
  3: ["weekly_insight"],
  5: ["debt_health"],
  7: ["net_worth"],
};

// === XP REWARD VALUES ===
// Reference constants (actual XP logic is in server/routes.ts processInteraction).
export const XP_REWARDS = {
  TRANSACTION: 5,
  NO_SPENDING: 5,
  COMPLETE_FIELDS: 3,
  STREAK_7_DAYS: 20,
};

// === DEFAULT CATEGORIES ===
// EXPENSE_CATEGORY_GROUPS drives the grouped picker UI (KEBUTUHAN / KEINGINAN).
// EXPENSE_CATEGORIES is a flat fallback derived from those groups.
export const EXPENSE_CATEGORY_GROUPS = [
  {
    groupKey: "needs",
    items: [
      { value: "Food & Drinks", emoji: "🍽️" },
      { value: "Housing",       emoji: "🏠" },
      { value: "Transportation",emoji: "🚌" },
      { value: "Electricity",   emoji: "💡" },
      { value: "Water",         emoji: "💧" },
      { value: "Health",        emoji: "🏥" },
      { value: "Education",     emoji: "🎓" },
      { value: "Other Needs",   emoji: "📦" },
    ],
  },
  {
    groupKey: "wants",
    items: [
      { value: "Shopping",      emoji: "🛍️" },
      { value: "Hangout",       emoji: "☕" },
      { value: "Entertainment", emoji: "🎮" },
      { value: "Snacks",        emoji: "🍩" },
      { value: "Hobby",         emoji: "🎨" },
      { value: "Lifestyle",     emoji: "✨" },
    ],
  },
] as const;

export const EXPENSE_CATEGORIES: string[] = EXPENSE_CATEGORY_GROUPS.flatMap(g => g.items.map(i => i.value));

export const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Investment Returns",
  "Gift",
  "Other",
];

// === LEVEL CALCULATION ===
// getLevelFromXp: Returns current level for a given XP total.
export function getLevelFromXp(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) return LEVEL_THRESHOLDS[i].level;
  }
  return 1;
}

// getXpForNextLevel: Returns progress within current level (for XP progress bar on dashboard).
export function getXpForNextLevel(currentXp: number): { current: number; next: number; progress: number } {
  const currentLevel = getLevelFromXp(currentXp);
  const currentThreshold = LEVEL_THRESHOLDS.find(t => t.level === currentLevel)!;
  const nextThreshold = LEVEL_THRESHOLDS.find(t => t.level === currentLevel + 1);

  if (!nextThreshold) {
    return { current: currentXp, next: currentXp, progress: 100 };
  }

  const xpInLevel = currentXp - currentThreshold.xp;
  const xpNeeded = nextThreshold.xp - currentThreshold.xp;
  return {
    current: xpInLevel,
    next: xpNeeded,
    progress: Math.min((xpInLevel / xpNeeded) * 100, 100),
  };
}

// === CURRENCY FORMATTER ===
// Formats numbers as Indonesian Rupiah (IDR). Used across all pages.
// Example: 1500000 → "Rp 1.500.000"
export function formatCurrency(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// === IDENTITY TIERS ===
// Level-based identity tier names. Users progress through these identity stages.
export const IDENTITY_TIERS = [
  { minLevel: 1, key: "financial_starter" },
  { minLevel: 5, key: "discipline_builder" },
  { minLevel: 10, key: "structured_financer" },
  { minLevel: 20, key: "wealth_architect" },
];

export function getTierKey(level: number): string {
  for (let i = IDENTITY_TIERS.length - 1; i >= 0; i--) {
    if (level >= IDENTITY_TIERS[i].minLevel) return IDENTITY_TIERS[i].key;
  }
  return "financial_starter";
}
