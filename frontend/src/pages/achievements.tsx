import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useLocation } from "wouter";
import { getTierKey, getLevelFromXp } from "@/lib/constants";
import type { UserProfile } from "@shared/schema";
import {
  Footprints,
  Flame,
  Shield,
  BrickWall,
  Crown,
  Sparkles,
  Star,
  FileText,
  CheckCircle,
  HeartPulse,
  Trophy,
  Target,
  Flag,
  TrendingUp,
  Gem,
  Wallet,
  Layers,
  Shuffle,
  LayoutGrid,
  Lock,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  footprints: Footprints,
  flame: Flame,
  shield: Shield,
  "brick-wall": BrickWall,
  crown: Crown,
  sparkles: Sparkles,
  star: Star,
  "file-text": FileText,
  "check-circle": CheckCircle,
  "heart-pulse": HeartPulse,
  trophy: Trophy,
  target: Target,
  flag: Flag,
  "trending-up": TrendingUp,
  gem: Gem,
  wallet: Wallet,
  layers: Layers,
  shuffle: Shuffle,
  "layout-grid": LayoutGrid,
};

interface BadgeData {
  id: number;
  name: string;
  description: string;
  category: string;
  icon: string;
  unlockConditionType: string;
  unlockConditionValue: string;
  sortOrder: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

const CATEGORY_ORDER = ["discipline", "debt", "wealth", "smart_money"];

export default function AchievementsPage() {
  const [, navigate] = useLocation();
  const { t } = useLanguage();

  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const { data: allBadges, isLoading } = useQuery<BadgeData[]>({
    queryKey: ["/api/badges"],
  });

  useEffect(() => {
    apiRequest("POST", "/api/badges/check")
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/badges"] }))
      .catch((err) => {
        if (isUnauthorizedError(err)) navigate("/");
      });
  }, [navigate]);

  const level = profile?.level ?? 1;
  const tierKey = getTierKey(level);
  const tierName = (t.tiers as any)[tierKey];

  const unlockedCount = allBadges?.filter((b) => b.unlocked).length ?? 0;
  const totalCount = allBadges?.length ?? 0;

  const grouped = CATEGORY_ORDER.reduce<Record<string, BadgeData[]>>((acc, cat) => {
    acc[cat] = (allBadges || []).filter((b) => b.category === cat);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 overflow-y-auto h-full">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-achievements-title">
          {t.achievements.title}
        </h1>
        <p className="text-muted-foreground text-sm mt-1" data-testid="text-achievements-subtitle">
          {t.achievements.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-badge-count">
                {unlockedCount}/{totalCount}
              </p>
              <p className="text-xs text-muted-foreground">{t.achievements.totalBadges}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="flex-1 min-w-[180px]">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Crown className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-semibold" data-testid="text-tier-name">{tierName}</p>
              <p className="text-xs text-muted-foreground">Lv {level}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const catBadges = grouped[cat] || [];
        if (catBadges.length === 0) return null;
        const catLabel = (t.achievements.categories as any)[cat] || cat;

        return (
          <div key={cat} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground" data-testid={`text-category-${cat}`}>
              {catLabel}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {catBadges.map((b) => {
                const IconComp = ICON_MAP[b.icon] || Star;
                const badgeName = (t.achievements.badges as any)[b.name] || b.name;
                const badgeDesc = (t.achievements.badges as any)[`${b.name}_desc`] || b.description;

                return (
                  <Card
                    key={b.id}
                    className={`relative transition-all ${
                      b.unlocked
                        ? "ring-1 ring-primary/20 shadow-[0_0_12px_rgba(61,157,92,0.08)]"
                        : "opacity-50"
                    }`}
                    data-testid={`card-badge-${b.name}`}
                  >
                    <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-md flex items-center justify-center ${
                          b.unlocked
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {b.unlocked ? (
                          <IconComp className="w-5 h-5" />
                        ) : (
                          <Lock className="w-4 h-4" />
                        )}
                      </div>
                      <p className="text-xs font-semibold leading-tight">{badgeName}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{badgeDesc}</p>
                      {b.unlocked && b.unlockedAt && (
                        <Badge variant="secondary" className="text-[9px] mt-1">
                          {new Date(b.unlockedAt).toLocaleDateString()}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
