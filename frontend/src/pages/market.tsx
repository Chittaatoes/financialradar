import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, RefreshCw, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";

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

function ChangePill({ v }: { v: number }) {
  const up = v >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-semibold tabular-nums ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {Math.abs(v).toFixed(2)}%
    </span>
  );
}

function shortNum(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return n.toLocaleString("id-ID");
}

function timeAgo(iso: string, lang: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 60000;
  if (lang === "en") {
    if (d < 60) return `${Math.floor(d)}m ago`;
    if (d < 1440) return `${Math.floor(d / 60)}h ago`;
    return `${Math.floor(d / 1440)}d ago`;
  }
  if (d < 60) return `${Math.floor(d)}m lalu`;
  if (d < 1440) return `${Math.floor(d / 60)}j lalu`;
  return `${Math.floor(d / 1440)}h lalu`;
}

function ImpactBadge({ v, lang }: { v: NewsItem["impact"]; lang: string }) {
  const labels = lang === "en"
    ? { high: "🔴 High", medium: "🟡 Medium", low: "🟢 Low" }
    : { high: "🔴 Tinggi", medium: "🟡 Sedang", low: "🟢 Rendah" };
  const cls = {
    high:   "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/20",
    low:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
  }[v];
  return <Badge className={`text-[10px] px-1.5 py-0 border ${cls} hover:opacity-90`}>{labels[v]}</Badge>;
}

export default function MarketPage() {
  const { language } = useLanguage();
  const isEN = language === "en";

  const { data: p, isLoading: pl, refetch, isFetching } = useQuery<MarketPrices>({
    queryKey: ["/api/market/prices"],
    staleTime: 5 * 60_000,
    gcTime: 0,
    retry: 3,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: news, isLoading: nl } = useQuery<MarketNews>({
    queryKey: ["/api/market/news", language],
    staleTime: 8 * 60_000,
    gcTime: 0,
    retry: 3,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await fetch(`/api/market/news?lang=${language}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch news");
      return res.json();
    },
  });

  const NA = isEN ? "Unavailable" : "Tidak tersedia";
  const snapshots = p ? [
    { icon: "💵", label: "USD/IDR",   value: p.usdIdr  > 0 ? `Rp ${p.usdIdr.toLocaleString("id-ID", { maximumFractionDigits: 0 })}` : NA, chg: p.usdChange,  unavail: p.usdIdr  === 0 },
    { icon: "🥇", label: isEN ? "Gold/gram" : "Emas/gram", value: p.goldGram > 0 ? `Rp ${shortNum(p.goldGram)}` : NA,                    chg: p.goldChange, unavail: p.goldGram === 0 },
    { icon: "₿",  label: "Bitcoin",   value: p.bitcoin  > 0 ? `Rp ${shortNum(p.bitcoin)}`  : NA,                                         chg: p.btcChange,  unavail: p.bitcoin  === 0 },
    { icon: "Ξ",  label: "Ethereum",  value: p.ethereum > 0 ? `Rp ${shortNum(p.ethereum)}` : NA,                                         chg: p.ethChange,  unavail: p.ethereum === 0 },
  ] : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Market</h1>
          <p className="text-xs text-muted-foreground">
            {isEN ? "Market prices & financial news" : "Harga pasar & berita keuangan"}
          </p>
        </div>
        <button
          onClick={() => refetch()} disabled={isFetching}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-accent transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Snapshot grid */}
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
            {isEN ? "Market Snapshot" : "Snapshot Pasar"}
          </p>
          {pl ? (
            <div className="grid grid-cols-2 gap-2">
              {[1,2,3,4].map(i => (
                <div key={i} className="rounded-xl bg-muted p-3 space-y-2">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-10" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {snapshots.map(s => (
                <div key={s.label} className="rounded-xl bg-muted border border-border p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base leading-none">{s.icon}</span>
                    <span className="text-[11px] text-muted-foreground">{s.label}</span>
                  </div>
                  <p className={`text-sm font-semibold font-mono leading-tight ${s.unavail ? "text-muted-foreground/60 text-xs" : "text-foreground"}`}>{s.value}</p>
                  <div className="mt-0.5">
                    {s.unavail
                      ? <span className="text-[10px] text-muted-foreground/50">{isEN ? "Tap refresh to retry" : "Tap refresh untuk coba lagi"}</span>
                      : <ChangePill v={s.chg} />
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
          {p?.updatedAt && (
            <p className="text-[10px] text-muted-foreground/60 mt-3 text-right">
              {isEN ? `Updated ${timeAgo(p.updatedAt, language)}` : `Diperbarui ${timeAgo(p.updatedAt, language)}`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* News */}
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-3">
            {isEN ? "Financial News" : "Berita Keuangan"}
          </p>
          {nl ? (
            <div className="space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="space-y-1.5 pb-3 border-b border-border last:border-0 last:pb-0">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          ) : news?.articles?.length ? (
            <div>
              {news.articles.map((item, i) => (
                <div key={i} className="pb-3 mb-3 border-b border-border last:border-0 last:mb-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <ImpactBadge v={item.impact} lang={language} />
                    <span className="text-[10px] text-muted-foreground/60">{timeAgo(item.publishedAt, language)}</span>
                  </div>
                  <p className="text-[13px] text-foreground leading-snug line-clamp-2 mb-1.5">{item.title}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{item.source}</span>
                    {item.url && item.url !== "#" && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors">
                        {isEN ? "Read" : "Baca"} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3">
              {isEN ? "No news available." : "Tidak ada berita tersedia."}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
