import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { API_URL } from "@/lib/api";
import App from "./App";
import "./index.css";

fetch(`${API_URL}/api/health`).catch(() => {});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);
