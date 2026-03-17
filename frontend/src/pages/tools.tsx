import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, PiggyBank, BarChart3, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { BudgetSummary } from "@shared/schema";

/* ── helpers ──────────────────────────────────────────── */
const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

function useIDRInput() {
  const [raw, setRaw] = useState("");
  const value = Number(raw.replace(/\D/g, "")) || 0;
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const n = Number(e.target.value.replace(/\D/g, "")) || 0;
    setRaw(n === 0 ? "" : n.toLocaleString("id-ID"));
  };
  return { raw, value, onChange };
}

function addMonths(d: Date, n: number) {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r;
}

function MoneyInput({ label, value: { raw, onChange }, placeholder }: {
  label: string; value: ReturnType<typeof useIDRInput>; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-white/50">{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/35 pointer-events-none">Rp</span>
        <Input className="pl-8 h-9 text-sm font-mono bg-white/5 border-white/10 focus:border-white/20"
          placeholder={placeholder ?? "0"} value={raw} onChange={onChange} inputMode="numeric" />
      </div>
    </div>
  );
}

function ResultRow({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "red" | "none" }) {
  const color = highlight === "green" ? "text-emerald-400" : highlight === "red" ? "text-red-400" : "text-white";
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/50">{label}</span>
      <span className={`text-sm font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );
}

/* ── Tool 1 ───────────────────────────────────────────── */
function EmergencyFund() {
  const expense = useIDRInput();
  const [months, setMonths] = useState(6);
  const recommended = expense.value * months;

  return (
    <div className="space-y-4">
      <MoneyInput label="Pengeluaran bulanan" value={expense} />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-white/50">Bulan proteksi</Label>
          <span className="text-sm font-bold text-emerald-400">{months}×</span>
        </div>
        <Slider min={3} max={12} step={1} value={[months]} onValueChange={([v]) => setMonths(v)} />
        <div className="flex justify-between text-[10px] text-white/25">
          <span>3× min</span><span>12× ideal</span>
        </div>
      </div>
      {expense.value > 0 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
          <p className="text-[10px] text-white/40 uppercase tracking-wide">Rekomendasi dana darurat</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">{fmt(recommended)}</p>
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/8">
            <div className="text-center">
              <p className="text-[10px] text-white/35">Minimal (3×)</p>
              <p className="text-xs font-mono font-semibold">{fmt(expense.value * 3)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-white/35">Ideal (6×)</p>
              <p className="text-xs font-mono font-semibold">{fmt(expense.value * 6)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tool 2 ───────────────────────────────────────────── */
function BudgetAnalyzer() {
  const { data: budget } = useQuery<BudgetSummary>({ queryKey: ["/api/budget/summary"] });
  const income = useIDRInput();
  const food = useIDRInput();
  const transport = useIDRInput();
  const housing = useIDRInput();
  const entertainment = useIDRInput();
  const other = useIDRInput();

  const incomeVal = income.value || (budget?.monthlyIncome ?? 0);
  const totalExpense = food.value + transport.value + housing.value + entertainment.value + other.value;
  const surplus = incomeVal - totalExpense;
  const savingPct = incomeVal > 0 ? (surplus / incomeVal) * 100 : 0;

  const cats = [
    { label: "Makanan", input: food, ideal: 0.3 },
    { label: "Transportasi", input: transport, ideal: 0.15 },
    { label: "Tempat tinggal", input: housing, ideal: 0.3 },
    { label: "Hiburan", input: entertainment, ideal: 0.1 },
    { label: "Lainnya", input: other, ideal: 0.1 },
  ];

  return (
    <div className="space-y-4">
      <MoneyInput label={`Pemasukan${budget ? " (dari data kamu)" : ""}`} value={income}
        placeholder={budget ? budget.monthlyIncome.toLocaleString("id-ID") : "0"} />
      <div className="space-y-2">
        <p className="text-[11px] text-white/50">Pengeluaran per kategori</p>
        {cats.map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="text-[11px] text-white/40 w-24 shrink-0">{c.label}</span>
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/25 pointer-events-none">Rp</span>
              <Input className="pl-6 h-8 text-xs font-mono bg-white/5 border-white/10"
                placeholder="0" value={c.input.raw} onChange={c.input.onChange} inputMode="numeric" />
            </div>
            {incomeVal > 0 && c.input.value > 0 && (
              <span className={`text-[10px] w-9 text-right font-mono shrink-0 ${c.input.value / incomeVal > c.ideal ? "text-red-400" : "text-emerald-400"}`}>
                {((c.input.value / incomeVal) * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>
      {totalExpense > 0 && incomeVal > 0 && (
        <div className={`rounded-xl border p-3 space-y-2 ${surplus >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
          <ResultRow label="Total pengeluaran" value={fmt(totalExpense)} />
          <ResultRow label="Sisa / Tabungan" value={`${fmt(Math.abs(surplus))}${surplus < 0 ? " (defisit)" : ""}`}
            highlight={surplus >= 0 ? "green" : "red"} />
          <ResultRow label="Rasio tabungan" value={`${savingPct.toFixed(1)}%`}
            highlight={savingPct >= 20 ? "green" : savingPct >= 10 ? "none" : "red"} />
          {cats.filter(c => incomeVal > 0 && c.input.value / incomeVal > c.ideal && c.input.value > 0).map(c => (
            <p key={c.label} className="text-[11px] text-red-300">
              ⚠️ {c.label} terlalu tinggi (+{(((c.input.value / incomeVal) - c.ideal) * 100).toFixed(0)}%)
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tool 3 ───────────────────────────────────────────── */
function SavingsSimulator() {
  const target = useIDRInput();
  const monthly = useIDRInput();
  const existing = useIDRInput();
  const [returnPct, setReturnPct] = useState(0);

  const result = useMemo(() => {
    if (!target.value || !monthly.value) return null;
    const goal = target.value, mo = monthly.value, cur = existing.value, r = returnPct / 100 / 12;
    if (r === 0) {
      const rem = goal - cur;
      if (rem <= 0) return { months: 0, date: new Date(), total: cur };
      const m = Math.ceil(rem / mo);
      return { months: m, date: addMonths(new Date(), m), total: cur + mo * m };
    }
    let bal = cur, m = 0;
    while (bal < goal && m < 600) { bal = bal * (1 + r) + mo; m++; }
    return { months: m, date: addMonths(new Date(), m), total: bal };
  }, [target.value, monthly.value, existing.value, returnPct]);

  const durationLabel = (n: number) => {
    if (n < 12) return `${n} bulan`;
    const y = Math.floor(n / 12), mo = n % 12;
    return mo === 0 ? `${y} tahun` : `${y} th ${mo} bln`;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MoneyInput label="Target tabungan" value={target} />
        <MoneyInput label="Tabungan/bulan" value={monthly} />
      </div>
      <MoneyInput label="Tabungan saat ini (opsional)" value={existing} />
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[11px] text-white/50">Return tahunan (opsional)</Label>
          <span className="text-sm font-bold text-emerald-400">{returnPct}%</span>
        </div>
        <Slider min={0} max={15} step={0.5} value={[returnPct]} onValueChange={([v]) => setReturnPct(v)} />
        <div className="flex justify-between text-[10px] text-white/25">
          <span>0% (tanpa bunga)</span><span>15%</span>
        </div>
      </div>
      {result && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 space-y-2">
          {result.months === 0 ? (
            <p className="text-center text-emerald-400 font-semibold text-sm">🎉 Target sudah tercapai!</p>
          ) : (
            <>
              <p className="text-[10px] text-white/40 uppercase tracking-wide">Perkiraan waktu</p>
              <p className="text-2xl font-bold text-emerald-400">{durationLabel(result.months)}</p>
              <p className="text-xs text-white/40">
                {result.date.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
              </p>
              <div className="pt-1 border-t border-white/8">
                <ResultRow label="Total terkumpul" value={fmt(result.total)} />
                {returnPct > 0 && result.total > target.value && (
                  <p className="text-[11px] text-emerald-400 mt-1">
                    💰 Potensi bunga: {fmt(result.total - target.value)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────── */
const TOOLS = [
  { id: "emergency", icon: PiggyBank, label: "Dana Darurat", desc: "Hitung kebutuhan dana darurat idealmu", component: EmergencyFund, color: "bg-blue-500/15 text-blue-400" },
  { id: "budget",    icon: BarChart3,  label: "Analisator Budget", desc: "Bandingkan pemasukan vs pengeluaran", component: BudgetAnalyzer, color: "bg-yellow-500/15 text-yellow-400" },
  { id: "savings",   icon: Calculator, label: "Simulasi Tabungan", desc: "Kapan target tabunganmu tercapai?", component: SavingsSimulator, color: "bg-emerald-500/15 text-emerald-400" },
];

export default function ToolsPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      <div>
        <h1 className="text-lg font-semibold">Tools</h1>
        <p className="text-xs text-muted-foreground">Kalkulator & alat perencanaan keuangan</p>
      </div>

      <div className="space-y-2">
        {TOOLS.map(({ id, icon: Icon, label, desc, component: Comp, color }) => (
          <Card key={id} className="rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden">
            <button
              className="w-full text-left active:bg-white/5 transition-colors"
              onClick={() => setOpen(open === id ? null : id)}
            >
              <div className="flex items-center gap-3 p-4">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-[11px] text-white/40 mt-0.5 truncate">{desc}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-white/25 shrink-0 transition-transform duration-200 ${open === id ? "rotate-90" : ""}`} />
              </div>
            </button>
            {open === id && (
              <div className="px-4 pb-4 pt-0 border-t border-white/5">
                <div className="pt-4">
                  <Comp />
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Quick tip */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/8 p-4">
        <p className="text-[11px] text-white/40 font-medium uppercase tracking-wide mb-2">💡 Tips Keuangan</p>
        <p className="text-xs text-white/60 leading-relaxed">
          Idealnya, alokasikan <span className="text-emerald-400 font-medium">50%</span> untuk kebutuhan,{" "}
          <span className="text-yellow-400 font-medium">30%</span> keinginan, dan{" "}
          <span className="text-blue-400 font-medium">20%</span> tabungan. Ini dikenal sebagai metode{" "}
          <span className="font-medium text-white/70">50/30/20</span>.
        </p>
      </div>

    </div>
  );
}
