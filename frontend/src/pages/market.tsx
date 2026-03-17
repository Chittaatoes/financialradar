import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, RefreshCw, Newspaper, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/queryClient";

interface MarketPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  currency: string;
  icon: string;
}

interface MarketPrices {
  usdIdr: number;
  goldGram: number;
  bitcoin: number;
  ethereum: number;
  btcChange: number;
  ethChange: number;
  goldChange: number;
  usdChange: number;
  updatedAt: string;
}

interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  impact: "high" | "medium" | "low";
  impactReason?: string;
}

interface MarketNews {
  articles: NewsItem[];
}

function ImpactBadge({ impact }: { impact: NewsItem["impact"] }) {
  if (impact === "high") return <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/20">🔴 High</Badge>;
  if (impact === "medium") return <Badge className="text-[10px] px-1.5 py-0 bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20">🟡 Medium</Badge>;
  return <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">🟢 Low</Badge>;
}

function PriceRow({ icon, name, price, change, currency }: {
  icon: string; name: string; price: string; change: number; currency?: string;
}) {
  const isUp = change >= 0;
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-white">{name}</p>
          {currency && <p className="text-[11px] text-white/40">{currency}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-mono font-bold text-white">{price}</p>
        <div className={`flex items-center justify-end gap-0.5 text-[11px] font-medium ${isUp ? "text-emerald-400" : "text-red-400"}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? "+" : ""}{change.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}

function formatIDR(n: number): string {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(2)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(1)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function MarketPage() {
  const { data: prices, isLoading: pricesLoading, refetch: refetchPrices, isFetching: pricesFetching } = useQuery<MarketPrices>({
    queryKey: ["/api/market/prices"],
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const { data: news, isLoading: newsLoading } = useQuery<MarketNews>({
    queryKey: ["/api/market/news"],
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Market</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Harga pasar & berita keuangan</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8"
          onClick={() => refetchPrices()}
          disabled={pricesFetching}
        >
          <RefreshCw className={`w-4 h-4 ${pricesFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wide">Harga Aset</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {pricesLoading ? (
            <div className="space-y-4">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-8 h-8 rounded-full bg-white/10" />
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-20 bg-white/10" />
                      <Skeleton className="h-3 w-14 bg-white/10" />
                    </div>
                  </div>
                  <div className="space-y-1 text-right">
                    <Skeleton className="h-3.5 w-24 bg-white/10 ml-auto" />
                    <Skeleton className="h-3 w-12 bg-white/10 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : prices ? (
            <>
              <PriceRow
                icon="💵"
                name="USD / IDR"
                price={`Rp ${prices.usdIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
                change={prices.usdChange}
                currency="US Dollar"
              />
              <PriceRow
                icon="🥇"
                name="Emas (per gram)"
                price={`Rp ${prices.goldGram.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
                change={prices.goldChange}
                currency="XAU/IDR"
              />
              <PriceRow
                icon="₿"
                name="Bitcoin"
                price={formatIDR(prices.bitcoin)}
                change={prices.btcChange}
                currency="BTC/IDR"
              />
              <PriceRow
                icon="Ξ"
                name="Ethereum"
                price={formatIDR(prices.ethereum)}
                change={prices.ethChange}
                currency="ETH/IDR"
              />
              {prices.updatedAt && (
                <p className="text-[10px] text-white/30 mt-3 text-right">
                  Diperbarui {timeAgo(prices.updatedAt)}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-white/40 text-center py-4">Gagal memuat harga. Coba refresh.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-white/50" />
            <CardTitle className="text-sm font-semibold text-white/70 uppercase tracking-wide">Berita Keuangan</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {newsLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3.5 w-full bg-white/10" />
                  <Skeleton className="h-3 w-3/4 bg-white/10" />
                  <Skeleton className="h-3 w-20 bg-white/10" />
                </div>
              ))}
            </div>
          ) : news?.articles?.length ? (
            news.articles.map((item, i) => (
              <div key={i} className="border-b border-white/5 last:border-0 pb-3 last:pb-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <ImpactBadge impact={item.impact} />
                  <span className="text-[10px] text-white/30 shrink-0">{timeAgo(item.publishedAt)}</span>
                </div>
                <p className="text-sm text-white/80 leading-snug mb-1 line-clamp-2">{item.title}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/40">{item.source}</span>
                  {item.url && item.url !== "#" && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                    >
                      Baca <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-white/40 text-center py-4">Tidak ada berita tersedia.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
