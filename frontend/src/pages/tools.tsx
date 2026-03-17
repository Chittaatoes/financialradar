import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, PiggyBank, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { BudgetSummary } from "@shared/schema";

function formatIDR(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function parseInput(s: string): number {
  return Number(s.replace(/\D/g, "")) || 0;
}

function formatInput(n: number): string {
  if (n === 0) return "";
  return n.toLocaleString("id-ID");
}

function useIDRInput(initial = 0) {
  const [raw, setRaw] = useState(initial === 0 ? "" : initial.toLocaleString("id-ID"));
  const value = parseInput(raw);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInput(e.target.value);
    setRaw(num === 0 ? "" : num.toLocaleString("id-ID"));
  };
  return { raw, value, onChange };
}

function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function monthsLabel(n: number): string {
  if (n < 12) return `${n} bulan`;
  const yrs = Math.floor(n / 12);
  const mos = n % 12;
  if (mos === 0) return `${yrs} tahun`;
  return `${yrs} tahun ${mos} bulan`;
}

// ── Tool 1: Dana Darurat ────────────────────────────────
function EmergencyFundCalc() {
  const expense = useIDRInput();
  const [months, setMonths] = useState(6);

  const recommended = expense.value * months;
  const min3 = expense.value * 3;
  const max6 = expense.value * 6;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Pengeluaran bulanan</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/40">Rp</span>
          <Input
            className="pl-8 font-mono"
            placeholder="0"
            value={expense.raw}
            onChange={expense.onChange}
            inputMode="numeric"
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-white/60">Jumlah bulan proteksi</Label>
          <span className="text-sm font-bold text-emerald-400">{months}×</span>
        </div>
        <Slider
          min={3}
          max={12}
          step={1}
          value={[months]}
          onValueChange={([v]) => setMonths(v)}
          className="mt-1"
        />
        <div className="flex justify-between text-[10px] text-white/30">
          <span>3× (minimum)</span>
          <span>12× (sangat aman)</span>
        </div>
      </div>
      {expense.value > 0 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-3">
          <div className="text-center">
            <p className="text-[11px] text-white/50 mb-1">Dana darurat yang direkomendasikan</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">{formatIDR(recommended)}</p>
            <p className="text-xs text-white/40 mt-1">{months}× pengeluaran bulanan</p>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <p className="text-[10px] text-white/40">Minimal (3×)</p>
              <p className="text-sm font-mono font-semibold">{formatIDR(min3)}</p>
            </div>
            <div className="rounded-lg bg-white/5 p-2 text-center">
              <p className="text-[10px] text-white/40">Ideal (6×)</p>
              <p className="text-sm font-mono font-semibold">{formatIDR(max6)}</p>
            </div>
          </div>
          {months < 6 && (
            <p className="text-[11px] text-yellow-400/80 text-center">💡 Untuk single, minimal 3×. Untuk keluarga, idealnya 6×.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool 2: Budget Analyzer ─────────────────────────────
function BudgetAnalyzer() {
  const { data: budget } = useQuery<BudgetSummary>({
    queryKey: ["/api/budget/summary"],
  });

  const income = useIDRInput();
  const food = useIDRInput();
  const transport = useIDRInput();
  const housing = useIDRInput();
  const entertainment = useIDRInput();
  const other = useIDRInput();

  const totalExpense = food.value + transport.value + housing.value + entertainment.value + other.value;
  const incomeVal = income.value || (budget ? budget.monthlyIncome : 0);
  const surplus = incomeVal - totalExpense;
  const savingPct = incomeVal > 0 ? (surplus / incomeVal) * 100 : 0;

  const categories = [
    { label: "Makanan & Minum", value: food, ideal: 0.3, key: "food" },
    { label: "Transportasi", value: transport, ideal: 0.15, key: "transport" },
    { label: "Tempat tinggal", value: housing, ideal: 0.3, key: "housing" },
    { label: "Hiburan", value: entertainment, ideal: 0.1, key: "entertainment" },
    { label: "Lainnya", value: other, ideal: 0.1, key: "other" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs text-white/60">
          Pemasukan bulan ini
          {budget && <span className="ml-1 text-white/30">(default dari data kamu)</span>}
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/40">Rp</span>
          <Input
            className="pl-8 font-mono"
            placeholder={budget ? formatInput(budget.monthlyIncome) : "0"}
            value={income.raw}
            onChange={income.onChange}
            inputMode="numeric"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-white/60">Pengeluaran per kategori</Label>
        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.key} className="flex items-center gap-2">
              <span className="text-xs text-white/50 w-28 shrink-0">{cat.label}</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30">Rp</span>
                <Input
                  className="pl-7 h-8 text-xs font-mono"
                  placeholder="0"
                  value={cat.value.raw}
                  onChange={cat.value.onChange}
                  inputMode="numeric"
                />
              </div>
              {incomeVal > 0 && cat.value.value > 0 && (
                <span className={`text-[10px] w-10 text-right font-mono shrink-0 ${
                  cat.value.value / incomeVal > cat.ideal ? "text-red-400" : "text-emerald-400"
                }`}>
                  {((cat.value.value / incomeVal) * 100).toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {totalExpense > 0 && incomeVal > 0 && (
        <div className={`rounded-xl border p-4 space-y-3 ${surplus >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Total pengeluaran</span>
            <span className="text-sm font-mono font-bold">{formatIDR(totalExpense)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Sisa / Tabungan potensial</span>
            <span className={`text-sm font-mono font-bold ${surplus >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatIDR(Math.abs(surplus))} {surplus < 0 ? "(defisit)" : ""}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Rasio tabungan</span>
            <span className={`text-sm font-bold ${savingPct >= 20 ? "text-emerald-400" : savingPct >= 10 ? "text-yellow-400" : "text-red-400"}`}>
              {savingPct.toFixed(1)}%
            </span>
          </div>
          {categories.filter(c => incomeVal > 0 && c.value.value / incomeVal > c.ideal && c.value.value > 0).map(c => (
            <p key={c.key} className="text-[11px] text-red-300">
              ⚠️ {c.label} terlalu tinggi (+{(((c.value.value / incomeVal) - c.ideal) * 100).toFixed(0)}% dari ideal)
            </p>
          ))}
          {surplus >= 0 && savingPct >= 20 && (
            <p className="text-[11px] text-emerald-400">✅ Rasio tabungan kamu sudah baik!</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tool 3: Simulasi Tabungan ───────────────────────────
function SavingsSimulator() {
  const target = useIDRInput();
  const monthly = useIDRInput();
  const currentSaving = useIDRInput();
  const [returnPct, setReturnPct] = useState(0);

  const result = useMemo(() => {
    if (!target.value || !monthly.value) return null;
    const goal = target.value;
    const mo = monthly.value;
    const existing = currentSaving.value;
    const r = returnPct / 100 / 12;

    if (r === 0) {
      const remaining = goal - existing;
      if (remaining <= 0) return { months: 0, date: new Date(), total: existing };
      const months = Math.ceil(remaining / mo);
      return { months, date: addMonths(new Date(), months), total: existing + mo * months };
    }

    let balance = existing;
    let months = 0;
    while (balance < goal && months < 600) {
      balance = balance * (1 + r) + mo;
      months++;
    }
    return { months, date: addMonths(new Date(), months), total: balance };
  }, [target.value, monthly.value, currentSaving.value, returnPct]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-white/60">Target tabungan</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40">Rp</span>
            <Input className="pl-7 h-9 text-sm font-mono" placeholder="0" value={target.raw} onChange={target.onChange} inputMode="numeric" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-white/60">Tabungan/bulan</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40">Rp</span>
            <Input className="pl-7 h-9 text-sm font-mono" placeholder="0" value={monthly.raw} onChange={monthly.onChange} inputMode="numeric" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-white/60">Tabungan saat ini (opsional)</Label>
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40">Rp</span>
          <Input className="pl-7 h-9 text-sm font-mono" placeholder="0" value={currentSaving.raw} onChange={currentSaving.onChange} inputMode="numeric" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-white/60">Return tahunan (opsional)</Label>
          <span className="text-sm font-bold text-emerald-400">{returnPct}%</span>
        </div>
        <Slider
          min={0}
          max={15}
          step={0.5}
          value={[returnPct]}
          onValueChange={([v]) => setReturnPct(v)}
        />
        <div className="flex justify-between text-[10px] text-white/30">
          <span>0% (tanpa bunga)</span>
          <span>15%</span>
        </div>
      </div>
      {result && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 space-y-3">
          {result.months === 0 ? (
            <p className="text-center text-emerald-400 font-semibold">🎉 Target sudah tercapai!</p>
          ) : (
            <>
              <div className="text-center">
                <p className="text-[11px] text-white/50 mb-1">Perkiraan waktu tercapai</p>
                <p className="text-2xl font-bold text-emerald-400">{monthsLabel(result.months)}</p>
                <p className="text-xs text-white/40 mt-1">
                  {result.date.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                </p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-white/10">
                <span className="text-xs text-white/50">Total terkumpul</span>
                <span className="text-sm font-mono font-bold">{formatIDR(result.total)}</span>
              </div>
              {returnPct > 0 && result.total > target.value && (
                <p className="text-[11px] text-emerald-400 text-center">
                  💰 Potensi bunga: {formatIDR(result.total - target.value)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────
const tools = [
  {
    id: "emergency",
    icon: PiggyBank,
    label: "Kalkulator Dana Darurat",
    desc: "Hitung kebutuhan dana darurat idealmu",
    component: EmergencyFundCalc,
  },
  {
    id: "budget",
    icon: BarChart3,
    label: "Analisator Budget",
    desc: "Bandingkan pemasukan vs pengeluaran",
    component: BudgetAnalyzer,
  },
  {
    id: "savings",
    icon: Calculator,
    label: "Simulasi Tabungan",
    desc: "Hitung kapan target tabunganmu tercapai",
    component: SavingsSimulator,
  },
];

export default function ToolsPage() {
  const [open, setOpen] = useState<string | null>("emergency");

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Tools</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Kalkulator & alat perencanaan keuangan</p>
      </div>
      <div className="space-y-3">
        {tools.map(({ id, icon: Icon, label, desc, component: Component }) => (
          <Card key={id}>
            <button
              className="w-full text-left"
              onClick={() => setOpen(open === id ? null : id)}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{label}</CardTitle>
                      <p className="text-[11px] text-white/40 mt-0.5">{desc}</p>
                    </div>
                  </div>
                  {open === id ? (
                    <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                  )}
                </div>
              </CardHeader>
            </button>
            {open === id && (
              <CardContent className="px-4 pb-4 pt-0 border-t border-white/5 mt-2">
                <div className="pt-3">
                  <Component />
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
