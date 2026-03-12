// import { createRoot } from "react-dom/client";
// import { QueryClientProvider } from "@tanstack/react-query";
// import { ThemeProvider } from "@/components/theme-provider";
// import { LanguageProvider } from "@/lib/i18n";
// import { queryClient, getQueryFn } from "@/lib/queryClient";
// import App from "./App";
// import "./index.css";

// queryClient.prefetchQuery({
//   queryKey: ["/api/dashboard"],
//   queryFn: getQueryFn({ on401: "returnNull" }),
// });
// queryClient.prefetchQuery({
//   queryKey: ["/api/profile"],
//   queryFn: getQueryFn({ on401: "returnNull" }),
// });
// queryClient.prefetchQuery({
//   queryKey: ["/api/daily-focus"],
//   queryFn: getQueryFn({ on401: "returnNull" }),
// });

// createRoot(document.getElementById("root")!).render(
//   <QueryClientProvider client={queryClient}>
//     <ThemeProvider>
//       <LanguageProvider>
//         <App />
//       </LanguageProvider>
//     </ThemeProvider>
//   </QueryClientProvider>
// );

import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n";
import { queryClient, getQueryFn } from "@/lib/queryClient";
import { setQueryInvalidator } from "@/lib/offline-sync";
import App from "./App";
import "./index.css";

// Wire React Query cache invalidation into the offline sync module
// so syncOfflineQueue() can refresh data without a circular import.
setQueryInvalidator(() => queryClient.invalidateQueries());

// Minimal guest fallback returned when /api/auth/user fails offline with no cache.
// Keeps the app renderable — the real user will be fetched on reconnect.
const GUEST_FALLBACK = {
  id: null,
  username: "Guest",
  firstName: "Guest",
  isGuest: true,
  xp: 0,
  level: 1,
};

async function bootstrap() {
  let user: unknown = null;

  try {
    user = await queryClient.fetchQuery({
      queryKey: ["/api/auth/user"],
      queryFn: getQueryFn({ on401: "returnNull" }),
      // Short stale threshold: always try network on first load
      staleTime: 0,
    });
  } catch {
    // Network unavailable and no IndexedDB cache — use guest fallback so the
    // app renders instead of hanging on a blank white screen.
    user = GUEST_FALLBACK;
    queryClient.setQueryData(["/api/auth/user"], GUEST_FALLBACK);
  }

  if (user) {
    // Fire-and-forget prefetches — errors are silently ignored
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
  }
}

const API = import.meta.env.VITE_API_URL;
if (API) {
  fetch(`${API}/health`).catch(() => {});
}

bootstrap().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
});
