import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Trash2, Search } from "lucide-react";
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

const POPULAR = [
  { symbol: "BBCA.JK", name: "BCA" },
  { symbol: "BBRI.JK", name: "BRI" },
  { symbol: "TLKM.JK", name: "Telkom" },
  { symbol: "ASII.JK", name: "Astra" },
  { symbol: "BMRI.JK", name: "Mandiri" },
];

function fmtRp(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}Jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function ChangePill({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? "+" : ""}{v.toFixed(2)}%
    </span>
  );
}

function StockRow({ symbol, onAdd }: { symbol: string; onAdd?: (q: StockQuote) => void }) {
  const { data, isLoading } = useQuery<StockQuote>({
    queryKey: [`/api/invest/quote/${symbol}`], staleTime: 5 * 60_000, retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-lg bg-white/8" />
          <div className="space-y-1.5"><Skeleton className="h-3 w-14 bg-white/8" /><Skeleton className="h-2.5 w-10 bg-white/8" /></div>
        </div>
        <Skeleton className="h-4 w-20 bg-white/8" />
      </div>
    );
  }
  if (!data) return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/30">{symbol} — tidak tersedia</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center">
          <span className="text-[9px] font-bold text-white/50">{data.symbol.replace(".JK","")}</span>
        </div>
        <div>
          <p className="text-[13px] font-medium">{data.name || data.symbol}</p>
          <ChangePill v={data.changePct} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-[13px] font-mono font-semibold">Rp {data.price.toLocaleString("id-ID")}</p>
          <p className={`text-[10px] font-mono ${data.change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {data.change >= 0 ? "+" : ""}{data.change.toFixed(0)}
          </p>
        </div>
        {onAdd && (
          <button onClick={() => onAdd(data)}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-emerald-500/20 transition-colors flex items-center justify-center">
            <Plus className="w-3.5 h-3.5 text-white/50" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function InvestPage() {
  const [search, setSearch] = useState("");
  const [searched, setSearched] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  const [addSym, setAddSym] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const quotes = new Map<string, StockQuote>();
  portfolio.forEach(item => {
    const q = queryClient.getQueryData<StockQuote>([`/api/invest/quote/${item.symbol}`]);
    if (q) quotes.set(item.symbol, q);
  });

  const handleSearch = () => {
    const sym = search.toUpperCase().trim();
    if (!sym) return;
    const s = sym.endsWith(".JK") ? sym : `${sym}.JK`;
    setSearched(p => p.includes(s) ? p : [...p, s]);
    setSearch("");
  };

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
  };

  const totalValue = portfolio.reduce((s, i) => s + (quotes.get(i.symbol)?.price ?? i.avgPrice) * i.shares, 0);
  const totalCost = portfolio.reduce((s, i) => s + i.avgPrice * i.shares, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      <div>
        <h1 className="text-lg font-semibold">Investasi</h1>
        <p className="text-xs text-muted-foreground">Pantau harga saham Indonesia</p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <Input className="pl-9 h-9 text-sm font-mono uppercase bg-white/[0.04] border-white/10"
            placeholder="Cari kode saham, mis. BBCA"
            value={search} onChange={e => setSearch(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSearch()} />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs shrink-0" onClick={handleSearch}>Cari</Button>
      </div>

      {/* Search results */}
      {searched.length > 0 && (
        <Card className="rounded-2xl border border-white/8 bg-white/[0.03]">
          <CardContent className="px-4 py-2">
            <p className="text-[11px] text-white/40 uppercase tracking-wide pt-2 pb-1">Hasil pencarian</p>
            {searched.map(sym => <StockRow key={sym} symbol={sym} onAdd={addToPortfolio} />)}
          </CardContent>
        </Card>
      )}

      {/* Popular stocks */}
      <Card className="rounded-2xl border border-white/8 bg-white/[0.03]">
        <CardContent className="px-4 py-2">
          <p className="text-[11px] text-white/40 uppercase tracking-wide pt-2 pb-1">Saham Populer IDX</p>
          {POPULAR.map(({ symbol }) => <StockRow key={symbol} symbol={symbol} onAdd={addToPortfolio} />)}
        </CardContent>
      </Card>

      {/* Portfolio */}
      <Card className="rounded-2xl border border-white/8 bg-white/[0.03]">
        <CardContent className="px-4 pt-4 pb-4 space-y-4">
          <p className="text-[11px] text-white/40 uppercase tracking-wide">Portofolio Saya</p>

          {portfolio.length > 0 && (
            <>
              {/* Summary */}
              <div className={`rounded-xl border p-3 ${totalPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-white/40">Nilai Portofolio</p>
                    <p className="text-lg font-bold font-mono">{fmtRp(totalValue)}</p>
                  </div>
                  {totalCost > 0 && (
                    <div className="text-right">
                      <p className="text-[10px] text-white/40">Untung / Rugi</p>
                      <p className={`text-sm font-bold font-mono ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalPL >= 0 ? "+" : ""}{fmtRp(Math.abs(totalPL))}
                      </p>
                      <p className={`text-[10px] ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {totalPLPct >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Holdings list */}
              <div className="space-y-0">
                {portfolio.map(item => {
                  const q = quotes.get(item.symbol);
                  const cur = q?.price ?? item.avgPrice;
                  const val = cur * item.shares;
                  const pl = item.avgPrice > 0 ? (cur - item.avgPrice) * item.shares : 0;
                  const plp = item.avgPrice > 0 ? ((cur - item.avgPrice) / item.avgPrice) * 100 : 0;
                  return (
                    <div key={item.symbol} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.07] flex items-center justify-center">
                          <span className="text-[9px] font-bold text-white/50">{item.symbol.replace(".JK","")}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium">{item.symbol.replace(".JK","")}</span>
                            {q && <ChangePill v={q.changePct} />}
                          </div>
                          <p className="text-[10px] text-white/35">{item.shares} lbr · avg Rp {item.avgPrice.toLocaleString("id-ID")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-[13px] font-mono font-semibold">{fmtRp(val)}</p>
                          {item.avgPrice > 0 && (
                            <p className={`text-[10px] font-mono ${pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {pl >= 0 ? "+" : ""}{fmtRp(Math.abs(pl))}
                            </p>
                          )}
                        </div>
                        <button onClick={() => setPortfolio(p => p.filter(x => x.symbol !== item.symbol))}
                          className="w-6 h-6 rounded-md hover:bg-red-500/15 transition-colors flex items-center justify-center">
                          <Trash2 className="w-3 h-3 text-white/25 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {portfolio.length === 0 && (
            <p className="text-xs text-white/30 text-center py-2">Belum ada saham. Tambahkan dari daftar di atas atau manual di bawah.</p>
          )}

          {/* Add manually */}
          <div className="rounded-xl border border-white/8 bg-white/[0.04] p-3 space-y-3">
            <p className="text-[11px] text-white/40 font-medium">Tambah manual</p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-[10px] text-white/30 mb-1">Kode</p>
                <Input className="h-8 text-xs font-mono uppercase bg-white/5 border-white/10"
                  placeholder="BBCA" value={addSym} onChange={e => setAddSym(e.target.value.toUpperCase())} />
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-1">Lembar</p>
                <Input className="h-8 text-xs font-mono bg-white/5 border-white/10"
                  type="number" placeholder="100" value={addShares} onChange={e => setAddShares(e.target.value)} />
              </div>
              <div>
                <p className="text-[10px] text-white/30 mb-1">Harga beli</p>
                <Input className="h-8 text-xs font-mono bg-white/5 border-white/10"
                  type="number" placeholder="9500" value={addPrice} onChange={e => setAddPrice(e.target.value)} />
              </div>
            </div>
            <Button size="sm" variant="outline"
              className="w-full h-8 text-xs border-white/10 bg-white/5 hover:bg-white/10"
              onClick={addManual} disabled={!addSym || !addShares}>
              <Plus className="w-3 h-3 mr-1" /> Tambah ke Portofolio
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-white/20 text-center pb-2">
        Data via Yahoo Finance. Mungkin tertunda 15 menit. Bukan rekomendasi investasi.
      </p>
    </div>
  );
}
