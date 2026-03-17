import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";

interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
  marketStatus: "open" | "closed";
}

interface PortfolioItem {
  symbol: string;
  shares: number;
  avgPrice: number;
}

const POPULAR_IDX = [
  { symbol: "BBCA.JK", name: "BCA" },
  { symbol: "BBRI.JK", name: "BRI" },
  { symbol: "TLKM.JK", name: "Telkom" },
  { symbol: "ASII.JK", name: "Astra" },
  { symbol: "BMRI.JK", name: "Mandiri" },
];

function formatRp(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}Jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function StockCard({ symbol, onAdd }: { symbol: string; onAdd?: (q: StockQuote) => void }) {
  const { data, isLoading, refetch, isFetching } = useQuery<StockQuote>({
    queryKey: [`/api/invest/quote/${symbol}`],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-16 bg-white/10" />
          <Skeleton className="h-3 w-24 bg-white/10" />
        </div>
        <Skeleton className="h-8 w-20 bg-white/10" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
        <span className="text-xs text-white/40">{symbol} — tidak tersedia</span>
      </div>
    );
  }

  const isUp = data.changePct >= 0;

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white/60">{data.symbol.replace(".JK", "")}</span>
        </div>
        <div>
          <p className="text-sm font-semibold">{data.name || data.symbol}</p>
          <div className={`flex items-center gap-0.5 text-[11px] font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isUp ? "+" : ""}{data.changePct.toFixed(2)}%
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-mono font-bold">Rp {data.price.toLocaleString("id-ID")}</p>
          <p className={`text-[10px] font-mono ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? "+" : ""}{data.change.toFixed(0)}
          </p>
        </div>
        {onAdd && (
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 rounded-lg"
            onClick={() => onAdd(data)}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PortfolioSection({ portfolio, setPortfolio, quotes }: {
  portfolio: PortfolioItem[];
  setPortfolio: (p: PortfolioItem[]) => void;
  quotes: Map<string, StockQuote>;
}) {
  const [addSymbol, setAddSymbol] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const handleAdd = () => {
    const sym = addSymbol.toUpperCase().trim();
    if (!sym || !addShares) return;
    const existing = portfolio.findIndex(p => p.symbol === sym);
    if (existing >= 0) {
      const updated = [...portfolio];
      updated[existing] = {
        ...updated[existing],
        shares: updated[existing].shares + Number(addShares),
        avgPrice: addPrice ? Number(addPrice.replace(/\D/g, "")) : updated[existing].avgPrice,
      };
      setPortfolio(updated);
    } else {
      setPortfolio([...portfolio, {
        symbol: sym,
        shares: Number(addShares),
        avgPrice: Number(addPrice.replace(/\D/g, "")) || 0,
      }]);
    }
    setAddSymbol(""); setAddShares(""); setAddPrice("");
  };

  const totalValue = portfolio.reduce((sum, item) => {
    const q = quotes.get(item.symbol);
    return sum + (q ? q.price * item.shares : item.avgPrice * item.shares);
  }, 0);

  const totalCost = portfolio.reduce((sum, item) => sum + item.avgPrice * item.shares, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wide">Portofolio Saya</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        {portfolio.length > 0 && (
          <>
            <div className={`rounded-xl border p-3 ${totalPL >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-white/50">Nilai Portofolio</p>
                  <p className="text-lg font-bold font-mono">{formatRp(totalValue)}</p>
                </div>
                {totalCost > 0 && (
                  <div className="text-right">
                    <p className="text-[11px] text-white/50">Untung / Rugi</p>
                    <p className={`text-sm font-bold font-mono ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {totalPL >= 0 ? "+" : ""}{formatRp(Math.abs(totalPL))}
                    </p>
                    <p className={`text-[10px] ${totalPL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      ({totalPLPct >= 0 ? "+" : ""}{totalPLPct.toFixed(2)}%)
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {portfolio.map(item => {
                const q = quotes.get(item.symbol);
                const currentPrice = q?.price ?? item.avgPrice;
                const value = currentPrice * item.shares;
                const pl = item.avgPrice > 0 ? (currentPrice - item.avgPrice) * item.shares : 0;
                const plPct = item.avgPrice > 0 ? ((currentPrice - item.avgPrice) / item.avgPrice) * 100 : 0;
                return (
                  <div key={item.symbol} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold">{item.symbol.replace(".JK", "")}</span>
                        {q && (
                          <span className={`text-[10px] font-medium ${q.changePct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {q.changePct >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/40">{item.shares} lembar · avg Rp {item.avgPrice.toLocaleString("id-ID")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold">{formatRp(value)}</p>
                        {item.avgPrice > 0 && (
                          <p className={`text-[10px] font-mono ${pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {pl >= 0 ? "+" : ""}{formatRp(Math.abs(pl))} ({plPct >= 0 ? "+" : ""}{plPct.toFixed(1)}%)
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6 rounded-md text-white/30 hover:text-red-400"
                        onClick={() => setPortfolio(portfolio.filter(p => p.symbol !== item.symbol))}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="rounded-xl border border-white/10 p-3 space-y-3">
          <p className="text-xs text-white/50 font-medium">Tambah Saham</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-white/40">Kode</Label>
              <Input
                className="h-8 text-xs font-mono uppercase"
                placeholder="BBCA"
                value={addSymbol}
                onChange={e => setAddSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-white/40">Lembar</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="100"
                type="number"
                value={addShares}
                onChange={e => setAddShares(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-white/40">Harga beli</Label>
              <Input
                className="h-8 text-xs font-mono"
                placeholder="9500"
                type="number"
                value={addPrice}
                onChange={e => setAddPrice(e.target.value)}
              />
            </div>
          </div>
          <Button size="sm" className="w-full h-8 text-xs" onClick={handleAdd} disabled={!addSymbol || !addShares}>
            <Plus className="w-3 h-3 mr-1" /> Tambah ke Portofolio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InvestPage() {
  const [searchSymbol, setSearchSymbol] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [searched, setSearched] = useState<string[]>([]);

  const portfolioQueries = portfolio.map(item => {
    return { symbol: item.symbol };
  });

  const allSymbols = [...new Set([...POPULAR_IDX.map(s => s.symbol), ...searched])];

  const quotes = new Map<string, StockQuote>();
  portfolio.forEach(item => {
    const q = queryClient.getQueryData<StockQuote>([`/api/invest/quote/${item.symbol}`]);
    if (q) quotes.set(item.symbol, q);
  });

  const handleSearch = () => {
    const sym = searchSymbol.toUpperCase().trim();
    if (!sym) return;
    const withJK = sym.endsWith(".JK") ? sym : `${sym}.JK`;
    if (!searched.includes(withJK)) setSearched(prev => [...prev, withJK]);
  };

  const addToPortfolio = (q: StockQuote) => {
    if (portfolio.find(p => p.symbol === q.symbol)) return;
    setPortfolio(prev => [...prev, { symbol: q.symbol, shares: 100, avgPrice: q.price }]);
    quotes.set(q.symbol, q);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Investasi</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Pantau harga saham Indonesia</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <Input
            className="pl-9 h-9 text-sm font-mono uppercase"
            placeholder="Cari saham, mis. BBCA"
            value={searchSymbol}
            onChange={e => setSearchSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs" onClick={handleSearch}>Cari</Button>
      </div>

      {searched.length > 0 && (
        <Card>
          <CardContent className="px-4 py-2">
            {searched.map(sym => (
              <StockCard key={sym} symbol={sym} onAdd={addToPortfolio} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wide">Saham Populer IDX</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {POPULAR_IDX.map(({ symbol }) => (
            <StockCard key={symbol} symbol={symbol} onAdd={addToPortfolio} />
          ))}
        </CardContent>
      </Card>

      <PortfolioSection
        portfolio={portfolio}
        setPortfolio={setPortfolio}
        quotes={quotes}
      />

      <p className="text-[10px] text-white/25 text-center px-4">
        Data saham menggunakan Yahoo Finance. Harga bisa tertunda 15 menit.
        Bukan rekomendasi investasi.
      </p>
    </div>
  );
}
