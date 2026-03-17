/**
 * ===== SIDEBAR NAVIGATION =====
 * Shadcn Sidebar component with level-gated feature locking.
 *
 * Sections:
 * - Header: Brand logo + name
 * - Main nav: Dashboard, Accounts, Transactions, Goals (always available)
 * - Advanced nav: Debt Health (Level 5), Net Worth (Level 7) — locked items show badge
 * - Admin: Visible only when profile.isAdmin === true
 * - Footer: Language toggle (EN/ID), user avatar, logout button
 *
 * To add a new page:
 * 1. Add to mainItems or advancedItems array below
 * 2. If level-gated, add feature key to FEATURE_UNLOCKS in constants.ts
 * 3. Register route in App.tsx
 */
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  Target,
  Shield,
  TrendingUp,
  LogOut,
  Globe,
  ShieldCheck,
  Award,
  PiggyBank,
  User,
  BarChart2,
  Calculator,
  Bot,
  CandlestickChart,
} from "lucide-react";
import logoImg from "@assets/favicon_1771971850849.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import type { UserProfile } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n";
import { getTierKey } from "@/lib/constants";
import { prefetchRouteData } from "@/lib/prefetch";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isGuest, isAuthenticated, logout } = useAuth();
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });
  const level = profile?.level ?? 1;
  const isAdmin = profile?.isAdmin === true;
  const { language, setLanguage, t } = useLanguage();

  const mainItems = [
    { title: t.nav.dashboard, url: "/", icon: LayoutDashboard, feature: "core" },
    { title: t.nav.accounts, url: "/accounts", icon: Wallet, feature: "core" },
    { title: t.nav.transactions, url: "/transactions", icon: ArrowLeftRight, feature: "core" },
    { title: (t.nav as any).budget || "Budget", url: "/budget", icon: PiggyBank, feature: "core" },
    { title: t.nav.goals, url: "/goals", icon: Target, feature: "core" },
  ];

  const advancedItems = [
    { title: t.nav.debtHealth, url: "/debt", icon: Shield },
    { title: t.nav.netWorth, url: "/networth", icon: TrendingUp },
    { title: t.nav.achievements, url: "/achievements", icon: Award },
    { title: (t.nav as any).profile || "Profile", url: "/profile", icon: User },
  ];

  const exploreItems = [
    { title: "Market", url: "/market", icon: BarChart2 },
    { title: "Tools", url: "/tools", icon: Calculator },
    { title: "AI Advisor", url: "/ai-advisor", icon: Bot },
    { title: "Investasi", url: "/invest", icon: CandlestickChart },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="Financial Radar" className="w-8 h-8 rounded-md object-cover" />
          <div>
            <h2 className="font-bold text-sm" data-testid="text-sidebar-brand">{t.brand}</h2>
            <p className="text-xs text-muted-foreground">{t.brandSub}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t.nav.main}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-nav-${item.url.replace("/", "") || "dashboard"}`}
                  >
                    <Link
                      href={item.url}
                      onMouseEnter={() => prefetchRouteData(item.url)}
                      onTouchStart={() => prefetchRouteData(item.url)}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t.nav.advanced}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {advancedItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-nav-${item.url.replace("/", "")}`}
                  >
                    <Link
                      href={item.url}
                      onMouseEnter={() => prefetchRouteData(item.url)}
                      onTouchStart={() => prefetchRouteData(item.url)}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Explore</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {exploreItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-nav-${item.url.replace("/", "")}`}
                  >
                    <Link
                      href={item.url}
                      onMouseEnter={() => prefetchRouteData(item.url)}
                      onTouchStart={() => prefetchRouteData(item.url)}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/admin"}
                    data-testid="link-nav-admin"
                  >
                    <Link href="/admin">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t.nav.admin}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="p-4 border-t space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="w-3.5 h-3.5" />
            <span>{t.common.language}</span>
          </div>
          <div className="flex rounded-md border overflow-visible">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-0.5 text-xs font-medium transition-colors ${language === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              data-testid="button-lang-en"
            >
              EN
            </button>
            <button
              onClick={() => setLanguage("id")}
              className={`px-2 py-0.5 text-xs font-medium transition-colors ${language === "id" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              data-testid="button-lang-id"
            >
              ID
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.profileImageUrl || ""} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">
              {user?.firstName?.[0] || (user as any)?.email?.[0]?.toUpperCase() || "G"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">
              {isGuest ? "Guest" : (user?.firstName || (user as any)?.email || "User")}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-user-tier">
              {(t.tiers as any)[getTierKey(level)]} &middot; Lv {level}
            </p>
          </div>
          {isAuthenticated && (
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-logout"
              onClick={() => logout()}
            >
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
