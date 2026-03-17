import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketPrices {
  usdIdr: number; goldGram: number; bitcoin: number; ethereum: number;
  btcChange: number; ethChange: number; goldChange: number; usdChange: number;
  updatedAt: string;
}
interface NewsItem {
  title: string; source: string; url: string;
  publishedAt: string; impact: "high" | "medium" | "low";
}
interface MarketNews { articles: NewsItem[] }

function pct(n: number) {
  const up = n >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {up ? "+" : ""}{n.toFixed(2)}%
    </span>
  );
}

function shortIDR(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return n.toLocaleString("id-ID");
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (d < 60) return `${Math.floor(d)}m lalu`;
  if (d < 1440) return `${Math.floor(d / 60)}j lalu`;
  return `${Math.floor(d / 1440)}h lalu`;
}

function ImpactBadge({ v }: { v: NewsItem["impact"] }) {
  const cfg = {
    high:   { cls: "bg-red-500/15 text-red-400 border-red-500/20",     label: "🔴 Tinggi" },
    medium: { cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20", label: "🟡 Medium" },
    low:    { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", label: "🟢 Rendah" },
  }[v];
  return <Badge className={`text-[10px] px-1.5 py-0 border ${cfg.cls} hover:${cfg.cls}`}>{cfg.label}</Badge>;
}

export default function MarketPage() {
  const { data: p, isLoading: pl, refetch, isFetching } = useQuery<MarketPrices>({
    queryKey: ["/api/market/prices"], staleTime: 5 * 60_000, retry: 1,
  });
  const { data: news, isLoading: nl } = useQuery<MarketNews>({
    queryKey: ["/api/market/news"], staleTime: 10 * 60_000, retry: 1,
  });

  const snapshots = p ? [
    { icon: "💵", label: "USD/IDR", value: `Rp ${p.usdIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`, chg: p.usdChange },
    { icon: "🥇", label: "Emas/gram", value: `Rp ${shortIDR(p.goldGram)}`, chg: p.goldChange },
    { icon: "₿",  label: "Bitcoin",   value: `Rp ${shortIDR(p.bitcoin)}`,  chg: p.btcChange },
    { icon: "Ξ",  label: "Ethereum",  value: `Rp ${shortIDR(p.ethereum)}`, chg: p.ethChange },
  ] : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Market</h1>
          <p className="text-xs text-muted-foreground">Harga pasar & berita keuangan</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/8 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-white/50 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Snapshot grid */}
      <Card className="rounded-2xl border border-white/8 bg-white/[0.03]">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mb-3">Snapshot Pasar</p>
          {pl ? (
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-xl bg-white/5 p-3 space-y-2">
                  <Skeleton className="h-3 w-14 bg-white/10" />
                  <Skeleton className="h-4 w-20 bg-white/10" />
                  <Skeleton className="h-3 w-10 bg-white/10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {snapshots.map(s => (
                <div key={s.label} className="rounded-xl bg-white/[0.05] border border-white/5 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base leading-none">{s.icon}</span>
                    <span className="text-[11px] text-white/50">{s.label}</span>
                  </div>
                  <p className="text-sm font-semibold font-mono text-white leading-tight">{s.value}</p>
                  <div className="mt-0.5">{pct(s.chg)}</div>
                </div>
              ))}
            </div>
          )}
          {p?.updatedAt && (
            <p className="text-[10px] text-white/25 mt-3 text-right">Diperbarui {timeAgo(p.updatedAt)}</p>
          )}
        </CardContent>
      </Card>

      {/* News */}
      <Card className="rounded-2xl border border-white/8 bg-white/[0.03]">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-white/40 font-medium mb-3">Berita Keuangan</p>
          {nl ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="space-y-1.5 pb-3 border-b border-white/5 last:border-0 last:pb-0">
                  <Skeleton className="h-3.5 w-full bg-white/10" />
                  <Skeleton className="h-3 w-2/3 bg-white/10" />
                  <Skeleton className="h-3 w-16 bg-white/10" />
                </div>
              ))}
            </div>
          ) : news?.articles?.length ? (
            <div className="space-y-0">
              {news.articles.map((item, i) => (
                <div key={i} className="pb-3 mb-3 border-b border-white/5 last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <ImpactBadge v={item.impact} />
                    <span className="text-[10px] text-white/30">{timeAgo(item.publishedAt)}</span>
                  </div>
                  <p className="text-[13px] text-white/85 leading-snug line-clamp-2 mb-1.5">{item.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">{item.source}</span>
                    {item.url && item.url !== "#" && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-emerald-400/80 hover:text-emerald-400 transition-colors">
                        Baca <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/35 text-center py-3">Tidak ada berita tersedia.</p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
