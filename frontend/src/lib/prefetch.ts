import { queryClient, getQueryFn } from "@/lib/queryClient";

const prefetchMap: Record<string, string[]> = {
  "/": ["/api/dashboard", "/api/profile", "/api/daily-focus"],
  "/accounts": ["/api/accounts"],
  "/transactions": ["/api/transactions", "/api/accounts"],
  "/budget": ["/api/budget"],
  "/goals": ["/api/goals"],
  "/debt": ["/api/debt-health"],
  "/networth": ["/api/net-worth"],
  "/achievements": ["/api/badges"],
  "/profile": ["/api/profile"],
  "/score": ["/api/finance-score"],
};

const prefetched = new Map<string, number>();

export function prefetchRouteData(path: string) {
  const now = Date.now();
  const last = prefetched.get(path);
  if (last && now - last < 30000) return;
  prefetched.set(path, now);

  const endpoints = prefetchMap[path];
  if (!endpoints) return;

  for (const endpoint of endpoints) {
    queryClient.prefetchQuery({
      queryKey: [endpoint],
      queryFn: getQueryFn({ on401: "throw" }),
      staleTime: 30000,
    });
  }
}
