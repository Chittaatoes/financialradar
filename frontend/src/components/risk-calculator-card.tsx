import { useState } from "react";
import { Calculator, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle, XCircle, Zap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRisk } from "@/hooks/useRisk";
import { RISK_SYMBOLS, USD_IDR_RATE } from "@/lib/risk-calculator";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function fmtBalance(balance: number, currency: "USD" | "IDR") {
  if (currency === "IDR") {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(balance);
  }
  return `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Zone badge ───────────────────────────────────────────────────────────────

function ZoneBadge({ zone }: { zone: "safe" | "warning" | "danger" }) {
  if (zone === "safe") return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
      <ShieldCheck className="w-3.5 h-3.5" /> Safe Zone
    </span>
  );
  if (zone === "warning") return (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-500">
      <AlertTriangle className="w-3.5 h-3.5" /> High Risk
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-500">
      <XCircle className="w-3.5 h-3.5" /> Danger — Lot Terlalu Besar
    </span>
  );
}

// ─── Toggle group ─────────────────────────────────────────────────────────────

function ToggleGroup<T extends string>({
  options, value, onChange, className,
}: { options: { label: string; value: T }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex items-center rounded-lg border border-border overflow-hidden text-xs font-medium", className)}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn("flex-1 px-2.5 py-1.5 transition-colors",
            value === o.value ? "bg-violet-600 text-white" : "hover:bg-muted text-muted-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Number input ─────────────────────────────────────────────────────────────

function NumInput({
  label, value, onChange, min, max, step, placeholder,
}: {
  label: string; value: number | string; onChange: (v: string) => void;
  min?: number; max?: number; step?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-1 uppercase tracking-wide">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? "any"}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RiskCalculatorCard() {
  const [open, setOpen] = useState(false);
  const { settings, result, setField, applySafeLot, recommendedLotStr } = useRisk();

  const hasUserLot = settings.userLot !== "" && Number(settings.userLot) > 0;

  return (
    <Card>
      {/* Header — always visible */}
      <button
        className="w-full flex items-center justify-between py-3 px-4"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          <Calculator className="w-4 h-4 text-violet-500" /> Risk Calculator
        </span>
        <div className="flex items-center gap-2">
          {!open && (
            <span className={cn("text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full",
              result.zone === "safe"    ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
              result.zone === "warning" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600" :
              "bg-red-100 dark:bg-red-900/30 text-red-600")}>
              Rec: {recommendedLotStr} lot
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <CardContent className="px-4 pb-4 space-y-4">

          {/* ── Row 1: Balance ── */}
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <NumInput
                  label={`Balance (${settings.currency})`}
                  value={settings.balance}
                  onChange={v => setField("balance", Math.max(0, Number(v)))}
                  min={0}
                  step="1"
                  placeholder="e.g. 100"
                />
              </div>
              <ToggleGroup
                options={[{ label: "USD", value: "USD" }, { label: "IDR", value: "IDR" }]}
                value={settings.currency}
                onChange={v => setField("currency", v)}
                className="mb-0 self-end"
              />
            </div>
            {settings.currency === "IDR" && (
              <p className="text-[10px] text-muted-foreground">
                ≈ ${result.balanceUSD.toFixed(2)} USD (kurs Rp {USD_IDR_RATE.toLocaleString()})
              </p>
            )}
          </div>

          {/* ── Row 2: Account Type ── */}
          <div>
            <label className="text-[10px] text-muted-foreground block mb-1.5 uppercase tracking-wide">Account Type</label>
            <ToggleGroup
              options={[
                { label: "Standard", value: "standard" },
                { label: "Cent",     value: "cent"     },
              ]}
              value={settings.accountType}
              onChange={v => setField("accountType", v)}
            />
            {settings.accountType === "cent" && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Cent account: 1 cent lot = 0.01 standard lot
              </p>
            )}
          </div>

          {/* ── Row 3: Risk % ── */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Risk per Trade</label>
              <span className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">
                {settings.riskPercent}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={5}
              step={0.5}
              value={settings.riskPercent}
              onChange={e => setField("riskPercent", Number(e.target.value))}
              className="w-full accent-violet-600"
            />
            <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
              <span>0.5% (konservatif)</span>
              <span>5% (agresif)</span>
            </div>
          </div>

          {/* ── Row 4: Symbol + Stop Loss ── */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-1 uppercase tracking-wide">Symbol</label>
              <select
                value={settings.symbol}
                onChange={e => setField("symbol", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {RISK_SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <NumInput
              label="Stop Loss (pips)"
              value={settings.stopLoss}
              onChange={v => setField("stopLoss", Math.max(0.1, Number(v)))}
              min={0.1}
              step="0.1"
              placeholder="10"
            />
          </div>

          {/* ── Result panel ── */}
          <div className={cn("rounded-xl p-3 space-y-2 border",
            result.zone === "safe"    ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800" :
            result.zone === "warning" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" :
            "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800")}>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Recommended Lot</span>
              <div className="text-right">
                <span className="text-base font-bold tabular-nums">{recommendedLotStr}</span>
                {settings.accountType === "cent" && (
                  <p className="text-[10px] text-muted-foreground">
                    = {result.recommendedStandardLot.toFixed(2)} std lot
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Risk Amount</span>
              <span className="text-sm font-semibold tabular-nums">
                {fmtUSD(result.riskAmount)} ({settings.riskPercent}%)
              </span>
            </div>

            {/* User lot comparison */}
            {hasUserLot && (
              <>
                <div className="border-t border-border/50 pt-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Your Lot</span>
                  <span className={cn("text-sm font-bold tabular-nums",
                    result.zone === "safe" ? "text-emerald-600 dark:text-emerald-400" :
                    result.zone === "warning" ? "text-amber-500" : "text-red-500")}>
                    {Number(settings.userLot).toFixed(2)}
                    {result.zone === "safe"    ? " ✓" :
                     result.zone === "warning" ? " ⚠" : " ✗"}
                  </span>
                </div>
                {result.userRiskAmount !== undefined && result.userRiskPercent !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Actual Risk</span>
                    <span className={cn("text-sm font-semibold tabular-nums",
                      result.zone === "safe" ? "text-emerald-600 dark:text-emerald-400" :
                      result.zone === "warning" ? "text-amber-500" : "text-red-500")}>
                      {fmtUSD(result.userRiskAmount)} ({result.userRiskPercent.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </>
            )}

            <ZoneBadge zone={result.zone} />
          </div>

          {/* ── Optional: Your Lot input ── */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <NumInput
              label="Your Lot (opsional)"
              value={settings.userLot}
              onChange={v => setField("userLot", v)}
              min={0.01}
              step="0.01"
              placeholder="e.g. 0.10"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={applySafeLot}
              className="flex items-center gap-1.5 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/30"
            >
              <Zap className="w-3.5 h-3.5" />
              Gunakan Lot Aman
            </Button>
          </div>

        </CardContent>
      )}
    </Card>
  );
}
