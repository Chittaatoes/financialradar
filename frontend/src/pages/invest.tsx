import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Trash2, Search, X, Lightbulb, CalendarDays, Layers, Landmark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";

// ── Types ──────────────────────────────────────────────────────────────
interface StockQuote {
  symbol: string; name: string; price: number;
  change: number; changePct: number; currency: string; marketStatus: "open" | "closed";
}
interface DBHolding {
  id: number; userId: string; symbol: string;
  lots: number; avgPrice: string; buyDate: string | null; createdAt: string;
}
interface IHSGData {
  price: number; prevClose: number; change: number; changePct: number;
  points: { t: number; v: number }[];
}
interface Account {
  id: number; name: string; type: "cash" | "bank" | "ewallet"; balance: string;
}

// ── Constants ──────────────────────────────────────────────────────────
interface StockEntry { symbol: string; name: string; aliases: string[]; }

const ALL_STOCKS: StockEntry[] = [
  // ── Perbankan ──────────────────────────────────────────────────────
  { symbol: "BBCA.JK", name: "Bank Central Asia Tbk", aliases: ["bca","central asia","bank bca"] },
  { symbol: "BBRI.JK", name: "Bank Rakyat Indonesia Tbk", aliases: ["bri","rakyat","bank bri"] },
  { symbol: "BMRI.JK", name: "Bank Mandiri Tbk", aliases: ["mandiri","bank mandiri"] },
  { symbol: "BBNI.JK", name: "Bank Negara Indonesia Tbk", aliases: ["bni","negara","bank bni"] },
  { symbol: "BRIS.JK", name: "Bank Syariah Indonesia Tbk", aliases: ["bsi","syariah","bank syariah","bris"] },
  { symbol: "BNGA.JK", name: "Bank CIMB Niaga Tbk", aliases: ["cimb","niaga","cimb niaga"] },
  { symbol: "MEGA.JK", name: "Bank Mega Tbk", aliases: ["mega","bank mega"] },
  { symbol: "PNBN.JK", name: "Bank Pan Indonesia Tbk", aliases: ["panin","pan","bank panin"] },
  { symbol: "BTPS.JK", name: "Bank BTPN Syariah Tbk", aliases: ["btpn","btps"] },
  // ── Teknologi & Telekomunikasi ─────────────────────────────────────
  { symbol: "TLKM.JK", name: "Telkom Indonesia Tbk", aliases: ["telkom","telecom","telekomunikasi"] },
  { symbol: "ISAT.JK", name: "Indosat Ooredoo Hutchison Tbk", aliases: ["indosat","im3","ooredoo","hutchison"] },
  { symbol: "EXCL.JK", name: "XL Axiata Tbk", aliases: ["xl","axiata","xlaxiata"] },
  { symbol: "MTEL.JK", name: "Dayamitra Telekomunikasi (Mitratel) Tbk", aliases: ["mitratel","tower","menara"] },
  { symbol: "TOWR.JK", name: "Sarana Menara Nusantara Tbk", aliases: ["menara","tower","protelindo"] },
  { symbol: "GOTO.JK", name: "GoTo Gojek Tokopedia Tbk", aliases: ["gojek","tokopedia","ojek","gofood","gopay"] },
  { symbol: "EMTK.JK", name: "Elang Mahkota Teknologi Tbk", aliases: ["emtek","sctv","okezone","vidio"] },
  // ── Otomotif & Industri ────────────────────────────────────────────
  { symbol: "ASII.JK", name: "Astra International Tbk", aliases: ["astra","auto"] },
  { symbol: "AUTO.JK", name: "Astra Otoparts Tbk", aliases: ["otoparts","spare part","sparepart"] },
  { symbol: "HEXA.JK", name: "Hexindo Adiperkasa Tbk", aliases: ["hexindo","komatsu"] },
  // ── Energi & Tambang ──────────────────────────────────────────────
  { symbol: "ADRO.JK", name: "Adaro Andalan Indonesia Tbk", aliases: ["adaro","batu bara"] },
  { symbol: "BYAN.JK", name: "Bayan Resources Tbk", aliases: ["bayan","batu bara"] },
  { symbol: "PTBA.JK", name: "Bukit Asam Tbk", aliases: ["bukit asam","batu bara"] },
  { symbol: "ITMG.JK", name: "Indo Tambangraya Megah Tbk", aliases: ["tambangraya","itm","batu bara"] },
  { symbol: "ANTM.JK", name: "Aneka Tambang Tbk", aliases: ["antam","emas","tambang","nikel"] },
  { symbol: "MDKA.JK", name: "Merdeka Copper Gold Tbk", aliases: ["merdeka","copper","gold","emas"] },
  { symbol: "AMMN.JK", name: "Amman Mineral Internasional Tbk", aliases: ["amman","mineral","nikel","tembaga"] },
  { symbol: "PGEO.JK", name: "Pertamina Geothermal Energy Tbk", aliases: ["pertamina","geothermal","pge"] },
  { symbol: "PGAS.JK", name: "Perusahaan Gas Negara Tbk", aliases: ["pgn","gas","gas negara"] },
  { symbol: "ELSA.JK", name: "Elnusa Tbk", aliases: ["elnusa","migas"] },
  // ── Consumer & FMCG ──────────────────────────────────────────────
  { symbol: "UNVR.JK", name: "Unilever Indonesia Tbk", aliases: ["unilever","sabun","pepsodent"] },
  { symbol: "ICBP.JK", name: "Indofood CBP Sukses Makmur Tbk", aliases: ["indofood cbp","indomie","mie"] },
  { symbol: "INDF.JK", name: "Indofood Sukses Makmur Tbk", aliases: ["indofood","bogasari"] },
  { symbol: "MYOR.JK", name: "Mayora Indah Tbk", aliases: ["mayora","biscuit","biskuit","kopiko"] },
  { symbol: "SIDO.JK", name: "Industri Jamu Sido Muncul Tbk", aliases: ["sido muncul","jamu","tolak angin"] },
  { symbol: "GGRM.JK", name: "Gudang Garam Tbk", aliases: ["gudang garam","rokok","surya"] },
  { symbol: "HMSP.JK", name: "HM Sampoerna Tbk", aliases: ["sampoerna","a mild","rokok"] },
  { symbol: "CPIN.JK", name: "Charoen Pokphand Indonesia Tbk", aliases: ["charoen","pokphand","ayam","pakan"] },
  // ── Farmasi & Kesehatan ───────────────────────────────────────────
  { symbol: "KLBF.JK", name: "Kalbe Farma Tbk", aliases: ["kalbe","farma","obat","farmasi"] },
  { symbol: "KAEF.JK", name: "Kimia Farma Tbk", aliases: ["kimia farma","apotik","apotek","obat"] },
  { symbol: "MIKA.JK", name: "Mitra Keluarga Karyasehat Tbk", aliases: ["mika","rumah sakit","rs mitra"] },
  // ── Properti & Konstruksi ─────────────────────────────────────────
  { symbol: "BSDE.JK", name: "Bumi Serpong Damai Tbk", aliases: ["bsd","serpong","damai"] },
  { symbol: "CTRA.JK", name: "Ciputra Development Tbk", aliases: ["ciputra","perumahan","citra"] },
  { symbol: "SMRA.JK", name: "Summarecon Agung Tbk", aliases: ["summarecon","kelapa gading"] },
  { symbol: "PWON.JK", name: "Pakuwon Jati Tbk", aliases: ["pakuwon","pakuon","pakuwon mall"] },
  { symbol: "WIKA.JK", name: "Wijaya Karya Tbk", aliases: ["wijaya karya","konstruksi"] },
  { symbol: "WSKT.JK", name: "Waskita Karya Tbk", aliases: ["waskita","konstruksi","tol"] },
  { symbol: "PTPP.JK", name: "PP Presisi Tbk", aliases: ["pp","pembangunan perumahan","konstruksi"] },
  // ── Retail & Ritel ────────────────────────────────────────────────
  { symbol: "ACES.JK", name: "Ace Hardware Indonesia Tbk", aliases: ["ace","hardware","ace hardware"] },
  { symbol: "MAPI.JK", name: "Mitra Adiperkasa Tbk", aliases: ["mapi","zara","starbucks","sport station"] },
  { symbol: "ERAA.JK", name: "Erajaya Swasembada Tbk", aliases: ["erajaya","ibox","iphone","samsung store"] },
  // ── Semen & Material ─────────────────────────────────────────────
  { symbol: "SMGR.JK", name: "Semen Indonesia Tbk", aliases: ["semen indonesia","semen","gresik"] },
  { symbol: "INTP.JK", name: "Indocement Tunggal Prakarsa Tbk", aliases: ["indocement","semen","tiga roda"] },
];

const POPULAR = ALL_STOCKS.slice(0, 5);

function scoreStock(s: StockEntry, raw: string): number {
  const kw = raw.toLowerCase().trim();
  if (!kw) return 0;
  const kwNoSpace = kw.replace(/\s+/g, "");
  const sym = s.symbol.replace(".JK", "").toLowerCase();
  const nameLow = s.name.toLowerCase();

  if (sym === kwNoSpace) return 100;
  if (sym.startsWith(kwNoSpace)) return 85;
  if (s.aliases.some(a => a === kw)) return 80;
  if (s.aliases.some(a => a.startsWith(kw))) return 70;
  if (sym.includes(kwNoSpace)) return 65;
  if (nameLow.split(" ").some(w => w.startsWith(kw))) return 55;
  if (nameLow.includes(kw)) return 45;
  if (s.aliases.some(a => a.includes(kw))) return 40;
  return 0;
}

// ── Helpers ────────────────────────────────────────────────────────────
function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}Jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function today() { return new Date().toISOString().slice(0, 10); }

// ── Sub-components ─────────────────────────────────────────────────────
function ChangePill({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function StockRow({ symbol, onAdd, isLast }: { symbol: string; onAdd?: (q: StockQuote) => void; isLast?: boolean }) {
  const { data, isLoading } = useQuery<StockQuote>({
    queryKey: [`/api/invest/quote/${symbol}`], staleTime: 5 * 60_000, retry: 1,
  });
  if (isLoading) return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? "border-b border-border" : ""}`}>
      <div className="flex items-center gap-2.5">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <div className="space-y-1.5"><Skeleton className="h-3 w-24" /><Skeleton className="h-2.5 w-14" /></div>
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
  if (!data) return null;
  const ticker = data.symbol.replace(".JK", "");
  return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? "border-b border-border" : ""}`}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-muted-foreground text-center px-0.5">{ticker}</span>
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground leading-tight">{data.name || ticker}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChangePill v={data.changePct} />
            <span className={`text-[10px] font-mono ${data.changePct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {data.changePct >= 0 ? "+" : ""}{data.change.toFixed(0)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-mono font-semibold text-foreground">Rp {data.price.toLocaleString("id-ID")}</p>
        {onAdd && (
          <button onClick={() => onAdd(data)}
            className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-primary" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Add Stock Bottom Sheet ─────────────────────────────────────────────
function AddStockSheet({
  stock, onClose, onSaved,
}: {
  stock: StockQuote;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lots, setLots] = useState("1");
  const [buyPrice, setBuyPrice] = useState(String(stock.price));
  const [buyDate, setBuyDate] = useState(today());
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
    staleTime: 60_000,
  });

  const lembar = (Number(lots) || 0) * 100;
  const totalCost = lembar * (Number(buyPrice) || 0);
  const currentValue = lembar * stock.price;

  const selectedAccount = accounts?.find(a => String(a.id) === selectedAccountId);
  const hasEnoughBalance = selectedAccount
    ? parseFloat(selectedAccount.balance) >= totalCost
    : true;

  // Hide bottom nav while sheet is open
  useEffect(() => {
    document.body.classList.add("sheet-open");
    return () => document.body.classList.remove("sheet-open");
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portfolio", {
        symbol: stock.symbol,
        lots: Number(lots),
        avgPrice: Number(buyPrice),
        buyDate,
        ...(selectedAccountId ? { accountId: Number(selectedAccountId) } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      if (selectedAccountId) {
        qc.invalidateQueries({ queryKey: ["/api/accounts"] });
        qc.invalidateQueries({ queryKey: ["/api/transactions"] });
        qc.invalidateQueries({ queryKey: ["/api/dashboard"] });
      }
      onSaved();
      onClose();
    },
  });

  // Close on overlay click
  const handleOverlay = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlay}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg bg-card rounded-t-3xl border border-border shadow-2xl p-5 pb-8 animate-in slide-in-from-bottom duration-300">

        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-border mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
              <span className="text-[10px] font-bold text-muted-foreground">{stock.symbol.replace(".JK", "")}</span>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-foreground leading-tight">{stock.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-mono text-muted-foreground">Rp {stock.price.toLocaleString("id-ID")}</span>
                <ChangePill v={stock.changePct} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center hover:bg-accent transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          {/* Date */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium mb-1.5">
              <CalendarDays className="w-3 h-3" /> Tanggal Beli
            </label>
            <Input type="date" className="h-10 text-sm" value={buyDate} onChange={e => setBuyDate(e.target.value)} max={today()} />
          </div>

          {/* Account selector */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium mb-1.5">
              <Landmark className="w-3 h-3" /> Potong dari Rekening <span className="text-muted-foreground/50">(opsional)</span>
            </label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              <option value="">— Tidak dipotong dari rekening —</option>
              {(accounts ?? []).map(a => (
                <option key={a.id} value={String(a.id)}>
                  {a.name} · Rp {parseFloat(a.balance).toLocaleString("id-ID", { maximumFractionDigits: 0 })}
                </option>
              ))}
            </select>
            {selectedAccount && !hasEnoughBalance && (
              <p className="text-[10px] text-red-500 mt-1">Saldo tidak cukup. Tersedia: Rp {parseFloat(selectedAccount.balance).toLocaleString("id-ID", { maximumFractionDigits: 0 })}</p>
            )}
          </div>

          {/* Lots + Price side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium mb-1.5">
                <Layers className="w-3 h-3" /> Jumlah Lot
              </label>
              <Input type="number" min="1" className="h-10 text-sm font-mono"
                placeholder="1" value={lots} onChange={e => setLots(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">= {lembar.toLocaleString("id-ID")} lembar</p>
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground font-medium mb-1.5 block">Harga Beli / Lembar</label>
              <Input type="number" className="h-10 text-sm font-mono"
                placeholder={String(stock.price)} value={buyPrice} onChange={e => setBuyPrice(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-1">
                Harga pasar: Rp {stock.price.toLocaleString("id-ID")}
              </p>
            </div>
          </div>
        </div>

        {/* Estimasi rincian */}
        {lembar > 0 && Number(buyPrice) > 0 && (
          <div className="mt-4 rounded-2xl bg-muted border border-border p-4 space-y-2.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Estimasi Rincian</p>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{Number(lots)} lot × 100 lembar</span>
                <span className="font-mono font-medium text-foreground">{lembar.toLocaleString("id-ID")} lbr</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modal ({lembar.toLocaleString()} × Rp {Number(buyPrice).toLocaleString("id-ID")})</span>
                <span className="font-mono font-semibold text-foreground">{fmtRp(totalCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nilai saat ini ({lembar.toLocaleString()} × Rp {stock.price.toLocaleString("id-ID")})</span>
                <span className="font-mono font-medium text-foreground">{fmtRp(currentValue)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Save button */}
        <Button
          className="w-full h-11 mt-4 text-sm font-semibold rounded-2xl"
          onClick={() => save.mutate()}
          disabled={!lots || !buyPrice || save.isPending || !hasEnoughBalance}
        >
          {save.isPending
            ? "Menyimpan..."
            : selectedAccountId
              ? `Tambah & Potong ${fmtRp(totalCost)} dari Rekening`
              : `Tambah ${stock.symbol.replace(".JK", "")} ke Portofolio`}
        </Button>
      </div>
    </div>
  );
}

// ── Insight ────────────────────────────────────────────────────────────
function InvestInsight({ holdings, quotes }: { holdings: DBHolding[]; quotes: Map<string, StockQuote> }) {
  if (holdings.length === 0) return null;
  const totalValue = holdings.reduce((s, h) => s + (quotes.get(h.symbol)?.price ?? Number(h.avgPrice)) * h.lots * 100, 0);
  const totalCost = holdings.reduce((s, h) => s + Number(h.avgPrice) * h.lots * 100, 0);
  const plPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
  let msg = "";
  if (holdings.length === 1) msg = "Portofolio kamu hanya berisi 1 saham. Pertimbangkan diversifikasi ke sektor lain untuk kurangi risiko.";
  else if (plPct >= 15) msg = `Keuntungan kamu sudah ${plPct.toFixed(1)}% — pertimbangkan profit taking atau tambah posisi di saham defensif.`;
  else if (plPct <= -10) msg = `Portofolio merugi ${Math.abs(plPct).toFixed(1)}%. Evaluasi apakah ini koreksi sementara atau ada perubahan fundamental.`;
  else if (holdings.length >= 5) msg = `Diversifikasi ${holdings.length} saham sudah bagus. Rutin review kinerja masing-masing setiap bulan.`;
  else msg = `${holdings.length} saham di portofoliomu. Kinerja ${plPct >= 0 ? "+" : ""}${plPct.toFixed(1)}% dari modal awal.`;
  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3.5 py-3 flex gap-2.5">
      <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Insight Investasi</p>
        <p className="text-[12px] text-amber-800 dark:text-amber-300 leading-relaxed">{msg}</p>
      </div>
    </div>
  );
}

// ── IHSG Sparkline Banner ─────────────────────────────────────────────
function Sparkline({ points, up }: { points: { t: number; v: number }[]; up: boolean }) {
  if (points.length < 2) return null;
  const W = 120; const H = 40;
  const minV = Math.min(...points.map(p => p.v));
  const maxV = Math.max(...points.map(p => p.v));
  const range = maxV - minV || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map(p => H - ((p.v - minV) / range) * (H - 4) - 2);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const color = up ? "#10b981" : "#ef4444";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function IHSGBanner() {
  const { data, isLoading } = useQuery<IHSGData | null>({
    queryKey: ["/api/invest/ihsg"], staleTime: 5 * 60_000, retry: 1,
  });
  if (isLoading) return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 flex items-center justify-between">
      <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-28" /></div>
      <Skeleton className="h-10 w-28 rounded-lg" />
    </div>
  );
  if (!data) return null;
  const up = data.change >= 0;
  const color = up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">IHSG · IDX Composite</p>
        <p className="text-[22px] font-bold font-mono text-foreground leading-tight">{data.price.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {up ? <TrendingUp className={`w-3 h-3 ${color}`} /> : <TrendingDown className={`w-3 h-3 ${color}`} />}
          <span className={`text-[12px] font-semibold tabular-nums ${color}`}>
            {up ? "+" : ""}{data.change.toFixed(2)} ({up ? "+" : ""}{data.changePct.toFixed(2)}%)
          </span>
        </div>
      </div>
      <div className="shrink-0">
        <Sparkline points={data.points} up={up} />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────
export default function InvestPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [addSheet, setAddSheet] = useState<StockQuote | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DB portfolio
  const { data: holdingsRaw } = useQuery<DBHolding[] | null>({
    queryKey: ["/api/portfolio"], staleTime: 0, gcTime: 0, refetchOnMount: true,
  });
  const holdings: DBHolding[] = Array.isArray(holdingsRaw) ? holdingsRaw : [];

  // Prefetch quotes for portfolio holdings
  const quotes = new Map<string, StockQuote>();
  holdings.forEach(h => {
    const q = qc.getQueryData<StockQuote>([`/api/invest/quote/${h.symbol}`]);
    if (q) quotes.set(h.symbol, q);
  });

  // Debounce 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Local instant results (scored from local list)
  const localMatches = debouncedSearch.trim().length >= 1
    ? ALL_STOCKS
        .map(s => ({ s, score: scoreStock(s, debouncedSearch) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(x => x.s)
    : [];

  // API search — hits Yahoo Finance for all IDX stocks
  const { data: apiSearchRaw, isFetching: searchFetching } = useQuery<{ symbol: string; name: string }[] | null>({
    queryKey: ["/api/invest/search", debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.trim().length < 2) return null;
      const res = await apiRequest("GET", `/api/invest/search?q=${encodeURIComponent(debouncedSearch.trim())}`);
      return res.json();
    },
    enabled: debouncedSearch.trim().length >= 2,
    staleTime: 30_000,
  });
  const apiResults: { symbol: string; name: string }[] = Array.isArray(apiSearchRaw) ? apiSearchRaw : [];

  // Merge: local first (instant), then API results not already in local
  const localSymbols = new Set(localMatches.map(s => s.symbol));
  const mergedResults = [
    ...localMatches,
    ...apiResults.filter(a => !localSymbols.has(a.symbol)),
  ].slice(0, 12);

  const isSearching = debouncedSearch.length >= 1;

  // Delete holding
  const deleteHolding = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/portfolio/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/portfolio"] }),
  });

  // Portfolio totals
  const totalValue = holdings.reduce((s, h) => s + (quotes.get(h.symbol)?.price ?? Number(h.avgPrice)) * h.lots * 100, 0);
  const totalCost = holdings.reduce((s, h) => s + Number(h.avgPrice) * h.lots * 100, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        <div>
          <h1 className="text-lg font-semibold text-foreground">Investasi</h1>
          <p className="text-xs text-muted-foreground">Pantau harga saham Indonesia</p>
        </div>

        {/* IHSG Banner */}
        <IHSGBanner />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input className="pl-9 pr-9 h-9 text-sm"
            placeholder="Cari saham: BCA, Bumi, Telkom, bank…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setSearch(""); setDebouncedSearch(""); } }}
          />
          {search && (
            <button onClick={() => { setSearch(""); setDebouncedSearch(""); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Search results */}
        {isSearching && (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="px-4 py-2">
              {mergedResults.length > 0 ? (
                <>
                  <div className="flex items-center justify-between pt-2 pb-1">
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                      Hasil pencarian
                    </p>
                    {searchFetching && <span className="text-[10px] text-muted-foreground animate-pulse">Mencari…</span>}
                  </div>
                  {mergedResults.map((s, i) => (
                    <StockRow key={s.symbol} symbol={s.symbol} isLast={i === mergedResults.length - 1}
                      onAdd={q => setAddSheet(q)} />
                  ))}
                </>
              ) : searchFetching ? (
                <div className="py-3 flex items-center gap-2">
                  <span className="text-[12px] text-muted-foreground animate-pulse">Mencari di bursa…</span>
                </div>
              ) : (
                <div className="py-3">
                  <p className="text-[12px] text-muted-foreground">Tidak ditemukan untuk &ldquo;{debouncedSearch}&rdquo;</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Tekan Cari untuk lookup langsung ke bursa.</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Popular stocks — hidden while searching */}
        {!isSearching && (
          <Card className="rounded-2xl border border-border shadow-sm">
            <CardContent className="px-4 py-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide pt-2 pb-1">Saham Populer IDX</p>
              {POPULAR.map((s, i) => (
                <StockRow key={s.symbol} symbol={s.symbol} isLast={i === POPULAR.length - 1}
                  onAdd={q => setAddSheet(q)} />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Portfolio */}
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="px-4 pt-4 pb-4 space-y-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Portofolio Saya</p>

            {holdings.length > 0 ? (
              <>
                {/* P&L Summary */}
                <div className={`rounded-xl border p-3.5 ${totalPL >= 0 ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20" : "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/20"}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Nilai Portofolio</p>
                      <p className="text-xl font-bold font-mono text-foreground">{fmtRp(totalValue)}</p>
                    </div>
                    {totalCost > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Untung / Rugi</p>
                        <p className={`text-[15px] font-bold font-mono ${totalPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {totalPL >= 0 ? "+" : "-"}{fmtRp(Math.abs(totalPL))}
                        </p>
                        <p className={`text-[11px] font-semibold ${totalPL >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {totalPLPct >= 0 ? "▲" : "▼"} {totalPLPct >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <InvestInsight holdings={holdings} quotes={quotes} />

                {/* Holdings list */}
                {holdings.map((h, idx) => {
                  const q = quotes.get(h.symbol);
                  const cur = q?.price ?? Number(h.avgPrice);
                  const lembar = h.lots * 100;
                  const val = cur * lembar;
                  const avgP = Number(h.avgPrice);
                  const pl = avgP > 0 ? (cur - avgP) * lembar : 0;
                  const plp = avgP > 0 ? ((cur - avgP) / avgP) * 100 : 0;
                  const isLast = idx === holdings.length - 1;
                  return (
                    <div key={h.id} className={`flex items-center justify-between py-3 ${!isLast ? "border-b border-border" : ""}`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-muted-foreground text-center px-0.5">{h.symbol.replace(".JK", "")}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-foreground">{h.symbol.replace(".JK", "")}</span>
                            {q && <ChangePill v={q.changePct} />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {h.lots} lot · {lembar.toLocaleString("id-ID")} lbr · avg Rp {avgP.toLocaleString("id-ID")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-[13px] font-mono font-semibold text-foreground">{fmtRp(val)}</p>
                          {avgP > 0 && (
                            <p className={`text-[10px] font-mono ${plp >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {plp >= 0 ? "▲ +" : "▼ "}{fmtRp(Math.abs(pl))} ({plp >= 0 ? "+" : ""}{plp.toFixed(1)}%)
                            </p>
                          )}
                        </div>
                        <button onClick={() => deleteHolding.mutate(h.id)}
                          className="w-6 h-6 rounded-md hover:bg-red-100 dark:hover:bg-red-500/15 transition-colors flex items-center justify-center group">
                          <Trash2 className="w-3 h-3 text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="text-center py-6 space-y-2">
                <p className="text-sm text-muted-foreground">Portofolio masih kosong</p>
                <p className="text-xs text-muted-foreground/60">Tap tombol <span className="font-semibold text-primary">+</span> di samping saham untuk menambahkan</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground/60 text-center pb-2">
          Data via Yahoo Finance · Mungkin tertunda 15 menit · Bukan rekomendasi investasi
        </p>
      </div>

      {/* Bottom Sheet */}
      {addSheet && (
        <AddStockSheet
          stock={addSheet}
          onClose={() => setAddSheet(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["/api/portfolio"] })}
        />
      )}
    </>
  );
}
