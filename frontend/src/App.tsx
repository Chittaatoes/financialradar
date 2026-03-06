import { useState, useEffect, useCallback, useRef } from "react";
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
import Accounts from "@/pages/accounts";
import Transactions from "@/pages/transactions";
import Goals from "@/pages/goals";
import DebtHealth from "@/pages/debt-health";
import BudgetPage from "@/pages/budget";
import NetWorth from "@/pages/net-worth";
import Achievements from "@/pages/achievements";
import ScorePage from "@/features/score/score-page";
import Admin from "@/pages/admin";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";
import { MobileBottomNav } from "@/components/mobile-nav";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

function useNavPlusHandler() {
  const [location, setLocation] = useLocation();

  const handlePlusClick = useCallback(() => {
    if (location !== "/") {
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
          </main>
        </div>
        <MobileBottomNav onPlusClick={handlePlusClick} />
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();
  const guestLoginCalled = useRef(false);
  const [loginFailed, setLoginFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const attemptGuestLogin = useCallback(() => {
    setRetrying(true);
    setLoginFailed(false);
    apiRequest("POST", "/api/guest-login", {})
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["user"] });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["user"] });
          setRetrying(false);
        }, 1500);
      })
      .catch(() => {
        setLoginFailed(true);
        setRetrying(false);
      });
  }, []);

  useEffect(() => {
    if (!isLoading && !user && !guestLoginCalled.current) {
      guestLoginCalled.current = true;
      attemptGuestLogin();
    }
  }, [isLoading, user, attemptGuestLogin]);

  useEffect(() => {
    if (guestLoginCalled.current && !user && !isLoading && !loginFailed && !retrying) {
      const timeout = setTimeout(() => {
        setLoginFailed(true);
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [user, isLoading, loginFailed, retrying]);

  if (isLoading || retrying || (!user && !guestLoginCalled.current)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <Skeleton className="h-10 w-10 rounded-md mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!user && loginFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 text-center max-w-sm px-4">
          <p className="text-lg font-semibold text-foreground">Connection Issue</p>
          <p className="text-sm text-muted-foreground">
            Unable to connect to the server. Please check your internet connection and try again.
          </p>
          <button
            onClick={() => {
              guestLoginCalled.current = false;
              attemptGuestLogin();
              guestLoginCalled.current = true;
            }}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
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
