import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageProvider } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import { MobileBottomNav } from "@/components/mobile-nav";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const Accounts = lazy(() => import("@/pages/accounts"));
const Transactions = lazy(() => import("@/pages/transactions"));
const Goals = lazy(() => import("@/pages/goals"));
const DebtHealth = lazy(() => import("@/pages/debt-health"));
const BudgetPage = lazy(() => import("@/pages/budget"));
const NetWorth = lazy(() => import("@/pages/net-worth"));
const Achievements = lazy(() => import("@/pages/achievements"));
const ScorePage = lazy(() => import("@/features/score/score-page"));
const Admin = lazy(() => import("@/pages/admin"));
const ProfilePage = lazy(() => import("@/pages/profile"));

function useNavPlusHandler() {
  const [location, setLocation] = useLocation();

  const handlePlusClick = useCallback(() => {
    if (location === "/transactions") {
      window.dispatchEvent(new CustomEvent("fr-open-add-tx"));
    } else if (location !== "/") {
      setLocation("/");
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("fr-open-action", { detail: "expense" }));
      }, 300);
    } else {
      window.dispatchEvent(new CustomEvent("fr-open-action", { detail: "expense" }));
    }
  }, [location, setLocation]);

  return handlePlusClick;
}

function AuthenticatedLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  const handlePlusClick = useNavPlusHandler();

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <header className="hidden md:flex items-center justify-between gap-4 p-3 border-b sticky top-0 z-50 bg-background/80 backdrop-blur-md">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto pb-20 md:pb-0">
            <Suspense fallback={<div className="flex items-center justify-center p-8"><Skeleton className="h-8 w-32" /></div>}>
              <Switch>
                <Route path="/" component={Dashboard} />
                <Route path="/accounts" component={Accounts} />
                <Route path="/transactions" component={Transactions} />
                <Route path="/goals" component={Goals} />
                <Route path="/budget" component={BudgetPage} />
                <Route path="/debt" component={DebtHealth} />
                <Route path="/networth" component={NetWorth} />
                <Route path="/achievements" component={Achievements} />
                <Route path="/score" component={ScorePage} />
                <Route path="/admin" component={Admin} />
                <Route path="/profile" component={ProfilePage} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </main>
        </div>
        <MobileBottomNav onPlusClick={handlePlusClick} />
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const guestLoginCalled = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginResult = params.get("login");
    const errorResult = params.get("error");
    if (loginResult === "success" || errorResult) {
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
      if (loginResult === "success") {
        queryClient.invalidateQueries();
        toast({ title: "Login berhasil!", description: "Akun Google kamu sudah terhubung." });
      } else if (errorResult === "auth_failed") {
        toast({ title: "Login gagal", description: "Autentikasi Google gagal. Coba lagi.", variant: "destructive" });
      }
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (user) {
      setReady(true);
      return;
    }

    if (!guestLoginCalled.current) {
      guestLoginCalled.current = true;
      apiRequest("POST", "/api/guest-login", {})
        .then(() => {
          queryClient.invalidateQueries();
        })
        .catch(() => {
          setReady(true);
        });

      setTimeout(() => setReady(true), 5000);
    }
  }, [isLoading, user]);

  useEffect(() => {
    if (user) setReady(true);
  }, [user]);

  if (isLoading || !ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <TooltipProvider>
      <Toaster />
      <AppContent />
    </TooltipProvider>
  );
}

export default App;
