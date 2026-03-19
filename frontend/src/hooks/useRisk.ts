import { useState, useMemo, useCallback } from "react";
import {
  calculateRisk,
  type RiskSettings,
  type RiskResult,
  type AccountCurrency,
  type AccountType,
} from "@/lib/risk-calculator";

interface UseRiskState extends RiskSettings {
  symbol:   string;
  stopLoss: number;
  userLot:  string;  // string so input is editable freely; "" means no comparison
}

interface UseRiskReturn {
  settings:  UseRiskState;
  result:    RiskResult;
  setField:  <K extends keyof UseRiskState>(key: K, value: UseRiskState[K]) => void;
  applySafeLot: () => void;  // returns recommended lot as a string
  recommendedLotStr: string;
}

const DEFAULTS: UseRiskState = {
  balance:     100,
  currency:    "USD",
  accountType: "standard",
  riskPercent: 1,
  symbol:      "XAUUSD",
  stopLoss:    10,
  userLot:     "",
};

export function useRisk(initial?: Partial<UseRiskState>): UseRiskReturn {
  const [settings, setSettings] = useState<UseRiskState>({ ...DEFAULTS, ...initial });

  const result = useMemo(() => {
    const userLotNum = settings.userLot !== "" ? Number(settings.userLot) : undefined;
    return calculateRisk({
      balance:     settings.balance,
      currency:    settings.currency as AccountCurrency,
      accountType: settings.accountType as AccountType,
      riskPercent: settings.riskPercent,
      symbol:      settings.symbol,
      stopLoss:    settings.stopLoss,
      userLot:     userLotNum,
    });
  }, [settings]);

  const setField = useCallback(<K extends keyof UseRiskState>(key: K, value: UseRiskState[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  }, []);

  const recommendedLotStr = result.recommendedLot.toFixed(2);

  const applySafeLot = useCallback(() => {
    setSettings(s => ({ ...s, userLot: recommendedLotStr }));
  }, [recommendedLotStr]);

  return { settings, result, setField, applySafeLot, recommendedLotStr };
}
