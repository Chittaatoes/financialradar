import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Trash2, Search, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

interface StockQuote {
  symbol: string; name: string; price: number;
  change: number; changePct: number; currency: string; marketStatus: "open" | "closed";
}
interface PortfolioItem { symbol: string; shares: number; avgPrice: number }

const ALL_STOCKS = [
  { symbol: "BBCA.JK", name: "Bank Central Asia BCA" },
  { symbol: "BBRI.JK", name: "Bank Rakyat Indonesia BRI" },
  { symbol: "TLKM.JK", name: "Telkom Indonesia Telekomunikasi" },
  { symbol: "ASII.JK", name: "Astra International" },
  { symbol: "BMRI.JK", name: "Bank Mandiri" },
  { symbol: "GOTO.JK", name: "GoTo Gojek Tokopedia" },
  { symbol: "BYAN.JK", name: "Bayan Resources Batu Bara" },
  { symbol: "UNVR.JK", name: "Unilever Indonesia" },
  { symbol: "ICBP.JK", name: "Indofood CBP Sukses Makmur" },
  { symbol: "INDF.JK", name: "Indofood Sukses Makmur" },
  { symbol: "KLBF.JK", name: "Kalbe Farma" },
  { symbol: "ANTM.JK", name: "Aneka Tambang Emas" },
  { symbol: "PTBA.JK", name: "Bukit Asam Batu Bara" },
  { symbol: "MDKA.JK", name: "Merdeka Copper Gold" },
];

const POPULAR = ALL_STOCKS.slice(0, 5);

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}Jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

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
    queryKey: [`/api/invest/quote/${symbol}`],
    staleTime: 5 * 60_000, retry: 1, gcTime: 10 * 60_000,
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

  if (!data) return (
    <div className={`flex items-center py-3 ${!isLast ? "border-b border-border" : ""}`}>
      <span className="text-xs text-muted-foreground">Data {symbol} tidak tersedia</span>
    </div>
  );

  const ticker = data.symbol.replace(".JK", "");
  const up = data.changePct >= 0;
  return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? "border-b border-border" : ""}`}>
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
          <span className="text-[9px] font-bold text-muted-foreground leading-tight text-center px-0.5">{ticker}</span>
        </div>
        <div>
          <p className="text-[13px] font-medium text-foreground leading-tight">{data.name || ticker}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <ChangePill v={data.changePct} />
            <span className={`text-[10px] font-mono ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {up ? "+" : ""}{data.change.toFixed(0)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <p className="text-[13px] font-mono font-semibold text-foreground">
          Rp {data.price.toLocaleString("id-ID")}
        </p>
        {onAdd && (
          <button onClick={() => onAdd(data)}
            className="w-7 h-7 rounded-lg bg-muted hover:bg-primary/10 transition-colors flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

function InvestInsight({ portfolio, quotes }: { portfolio: PortfolioItem[]; quotes: Map<string, StockQuote> }) {
  if (portfolio.length === 0) return null;

  const totalValue = portfolio.reduce((s, i) => s + (quotes.get(i.symbol)?.price ?? i.avgPrice) * i.shares, 0);
  const totalCost = portfolio.reduce((s, i) => s + i.avgPrice * i.shares, 0);
  const plPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

  let msg = "";
  if (portfolio.length === 1) {
    msg = `Portofolio kamu hanya berisi 1 saham. Pertimbangkan diversifikasi ke sektor lain untuk mengurangi risiko.`;
  } else if (plPct >= 15) {
    msg = `Keuntungan kamu sudah ${plPct.toFixed(1)}% — pertimbangkan untuk sebagian profit taking atau tambah posisi di saham defensif.`;
  } else if (plPct <= -10) {
    msg = `Portofolio sedang merugi ${Math.abs(plPct).toFixed(1)}%. Evaluasi apakah ini koreksi sementara atau ada perubahan fundamental.`;
  } else if (portfolio.length >= 5) {
    msg = `Kamu sudah diversifikasi dengan ${portfolio.length} saham. Pastikan kamu rutin review kinerja masing-masing.`;
  } else {
    msg = `Kamu punya ${portfolio.length} saham. Kinerja portofolio ${plPct >= 0 ? "+" : ""}${plPct.toFixed(1)}% dari modal awal.`;
  }

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

export default function InvestPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [manualSearched, setManualSearched] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [addSym, setAddSym] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [showManual, setShowManual] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const quotes = new Map<string, StockQuote>();
  portfolio.forEach(item => {
    const q = queryClient.getQueryData<StockQuote>([`/api/invest/quote/${item.symbol}`]);
    if (q) quotes.set(item.symbol, q);
  });

  // Debounce search 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // Fuzzy search: partial match on ticker + name
  const kw = debouncedSearch.toLowerCase().replace(/\s/g, "");
  const listMatches = kw.length >= 1
    ? ALL_STOCKS.filter(s =>
        s.symbol.toLowerCase().replace(".jk", "").startsWith(kw) ||
        s.symbol.toLowerCase().replace(".jk", "").includes(kw) ||
        s.name.toLowerCase().replace(/\s/g, "").includes(kw)
      ).sort((a, b) => {
        const as = a.symbol.toLowerCase().replace(".jk", "").startsWith(kw) ? 0 : 1;
        const bs = b.symbol.toLowerCase().replace(".jk", "").startsWith(kw) ? 0 : 1;
        return as - bs;
      })
    : [];

  // Manual ticker lookup (symbols not in the list)
  const handleManualSearch = useCallback(() => {
    const sym = search.trim().toUpperCase();
    if (!sym) return;
    const withJK = sym.endsWith(".JK") ? sym : `${sym}.JK`;
    const inList = ALL_STOCKS.find(s => s.symbol === withJK);
    if (!inList) {
      setManualSearched(p => p.includes(withJK) ? p : [...p, withJK]);
    }
    setSearch("");
    setDebouncedSearch("");
  }, [search]);

  const isSearching = debouncedSearch.length >= 1;

  const addToPortfolio = (q: StockQuote) => {
    if (portfolio.find(p => p.symbol === q.symbol)) return;
    setPortfolio(p => [...p, { symbol: q.symbol, shares: 100, avgPrice: q.price }]);
  };

  const addManual = () => {
    const sym = addSym.toUpperCase().trim();
    if (!sym || !addShares) return;
    const withJK = sym.endsWith(".JK") ? sym : `${sym}.JK`;
    setPortfolio(p => {
      const idx = p.findIndex(i => i.symbol === withJK);
      if (idx >= 0) {
        const up = [...p];
        up[idx] = { ...up[idx], shares: up[idx].shares + Number(addShares), avgPrice: Number(addPrice) || up[idx].avgPrice };
        return up;
      }
      return [...p, { symbol: withJK, shares: Number(addShares), avgPrice: Number(addPrice) || 0 }];
    });
    setAddSym(""); setAddShares(""); setAddPrice("");
    setShowManual(false);
  };

  const totalValue = portfolio.reduce((s, i) => s + (quotes.get(i.symbol)?.price ?? i.avgPrice) * i.shares, 0);
  const totalCost = portfolio.reduce((s, i) => s + i.avgPrice * i.shares, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      <div>
        <h1 className="text-lg font-semibold text-foreground">Investasi</h1>
        <p className="text-xs text-muted-foreground">Pantau harga saham Indonesia</p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Cari saham: BCA, Bank, Telkom…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManualSearch()}
          />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs shrink-0" onClick={handleManualSearch}>Cari</Button>
      </div>

      {/* Search results — fuzzy match from list + manual lookups */}
      {isSearching && (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="px-4 py-2">
            {listMatches.length > 0 ? (
              <>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide pt-2 pb-1">
                  Hasil untuk &ldquo;{debouncedSearch}&rdquo;
                </p>
                {listMatches.map((s, i) => (
                  <StockRow key={s.symbol} symbol={s.symbol} onAdd={addToPortfolio} isLast={i === listMatches.length - 1} />
                ))}
              </>
            ) : (
              <div className="py-3 space-y-1">
                <p className="text-[12px] text-muted-foreground">
                  Tidak ditemukan untuk &ldquo;{debouncedSearch}&rdquo; di daftar saham.
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  Tekan <strong>Cari</strong> untuk lookup langsung ke bursa.
                </p>
              </div>
            )}
            {/* Manual lookups that aren't in the list */}
            {manualSearched.length > 0 && (
              <>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide pt-3 pb-1">Pencarian manual</p>
                {manualSearched.map((s, i) => (
                  <StockRow key={s} symbol={s} onAdd={addToPortfolio} isLast={i === manualSearched.length - 1} />
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Popular stocks — hidden when search is active */}
      {!isSearching && (
        <Card className="rounded-2xl border border-border shadow-sm">
          <CardContent className="px-4 py-2">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide pt-2 pb-1">Saham Populer IDX</p>
            {POPULAR.map((s, i) => (
              <StockRow key={s.symbol} symbol={s.symbol} onAdd={addToPortfolio} isLast={i === POPULAR.length - 1} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Portfolio */}
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="px-4 pt-4 pb-4 space-y-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Portofolio Saya</p>

          {portfolio.length > 0 && (
            <>
              {/* P&L summary */}
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

              {/* Insight */}
              <InvestInsight portfolio={portfolio} quotes={quotes} />

              {/* Holdings */}
              <div>
                {portfolio.map((item, idx) => {
                  const q = quotes.get(item.symbol);
                  const cur = q?.price ?? item.avgPrice;
                  const val = cur * item.shares;
                  const pl = item.avgPrice > 0 ? (cur - item.avgPrice) * item.shares : 0;
                  const plp = item.avgPrice > 0 ? ((cur - item.avgPrice) / item.avgPrice) * 100 : 0;
                  const isUp = plp >= 0;
                  const isLast = idx === portfolio.length - 1;
                  return (
                    <div key={item.symbol} className={`flex items-center justify-between py-3 ${!isLast ? "border-b border-border" : ""}`}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-muted-foreground leading-tight text-center px-0.5">{item.symbol.replace(".JK","")}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-foreground">{item.symbol.replace(".JK","")}</span>
                            {q && <ChangePill v={q.changePct} />}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.shares} lbr · avg Rp {item.avgPrice.toLocaleString("id-ID")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-[13px] font-mono font-semibold text-foreground">{fmtRp(val)}</p>
                          {item.avgPrice > 0 && (
                            <p className={`text-[10px] font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                              {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{fmtRp(Math.abs(pl))} ({plp >= 0 ? "+" : ""}{plp.toFixed(1)}%)
                            </p>
                          )}
                        </div>
                        <button onClick={() => setPortfolio(p => p.filter(x => x.symbol !== item.symbol))}
                          className="w-6 h-6 rounded-md hover:bg-red-100 dark:hover:bg-red-500/15 transition-colors flex items-center justify-center group">
                          <Trash2 className="w-3 h-3 text-muted-foreground group-hover:text-red-600 dark:group-hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {portfolio.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Belum ada saham. Tambahkan via (+) dari daftar atau isi manual di bawah.
            </p>
          )}

          {/* Add manually — collapsible */}
          <div className="border-t border-border pt-3">
            <button
              onClick={() => setShowManual(p => !p)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
            >
              <Plus className="w-3 h-3" />
              <span>Tambah Manual</span>
              {showManual ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
            </button>

            {showManual && (
              <div className="mt-3 rounded-xl border border-border bg-muted/50 p-3 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Kode</p>
                    <Input className="h-8 text-xs font-mono uppercase"
                      placeholder="BBCA" value={addSym} onChange={e => setAddSym(e.target.value.toUpperCase())} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Lembar</p>
                    <Input className="h-8 text-xs font-mono"
                      type="number" placeholder="100" value={addShares} onChange={e => setAddShares(e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Harga beli</p>
                    <Input className="h-8 text-xs font-mono"
                      type="number" placeholder="9500" value={addPrice} onChange={e => setAddPrice(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={addManual} disabled={!addSym || !addShares}>
                  <Plus className="w-3 h-3 mr-1" /> Tambah ke Portofolio
                </Button>
              </div>
            )}
          </div>

        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground/60 text-center pb-2">
        Data via Yahoo Finance · Mungkin tertunda 15 menit · Bukan rekomendasi investasi
      </p>
    </div>
  );
}
