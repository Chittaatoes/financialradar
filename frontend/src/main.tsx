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

async function bootstrap() {
  const user = await queryClient.fetchQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (user) {
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
