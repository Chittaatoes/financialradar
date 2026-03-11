import { useLocation, Link } from "wouter";
import { Home, Wallet, Plus, User, ArrowLeftRight } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { prefetchRouteData } from "@/lib/prefetch";

interface MobileBottomNavProps {
  onPlusClick?: () => void;
}

export function MobileBottomNav({ onPlusClick }: MobileBottomNavProps) {
  const [location] = useLocation();
  const { t } = useLanguage();

  const leftItems = [
    { key: "dashboard", path: "/", icon: Home, label: t.nav.dashboard },
    { key: "accounts", path: "/accounts", icon: Wallet, label: t.nav.accounts },
  ];

  const rightItems = [
    { key: "transactions", path: "/transactions", icon: ArrowLeftRight, label: t.nav.transactions },
    { key: "profile", path: "/profile", icon: User, label: (t.nav as any).profile || "Profile" },
  ];

  const renderNavItem = (item: typeof leftItems[0]) => {
    const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
    const Icon = item.icon;
    return (
      <Link
        key={item.key}
        href={item.path}
        data-testid={`mobile-nav-${item.key}`}
        onTouchStart={() => prefetchRouteData(item.path)}
        className={`flex flex-col items-center justify-center gap-0.5 min-w-[64px] py-1.5 transition-colors ${
          isActive ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <div className={`p-1.5 rounded-2xl transition-all ${isActive ? "bg-primary/10" : ""}`}>
          <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.8} />
        </div>
        <span className="text-[10px] font-medium leading-tight">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom" data-testid="mobile-bottom-nav">
      <div className="relative mx-3 mb-2">
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={onPlusClick}
            data-testid="mobile-nav-add"
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-primary/30 transition-transform active:scale-90"
            style={{ background: "linear-gradient(135deg, #4CAF6A 0%, #3d9d5c 50%, #2E7D46 100%)" }}
          >
            <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
          </button>
        </div>

        <div className="bg-background/95 backdrop-blur-xl rounded-2xl border shadow-sm">
          <div className="flex items-center justify-around h-16 px-3">
            <div className="flex items-center gap-2 flex-1 justify-around">
              {leftItems.map(renderNavItem)}
            </div>

            <div className="w-16 shrink-0" />

            <div className="flex items-center gap-2 flex-1 justify-around">
              {rightItems.map(renderNavItem)}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
