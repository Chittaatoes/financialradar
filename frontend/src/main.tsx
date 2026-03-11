import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import { queryClient, getQueryFn } from "@/lib/queryClient";
import App from "./App";
import "./index.css";

queryClient.prefetchQuery({
  queryKey: ["/api/dashboard"],
  queryFn: getQueryFn({ on401: "returnNull" }),
});
queryClient.prefetchQuery({
  queryKey: ["/api/profile"],
  queryFn: getQueryFn({ on401: "returnNull" }),
});
queryClient.prefetchQuery({
  queryKey: ["/api/daily-focus"],
  queryFn: getQueryFn({ on401: "returnNull" }),
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
