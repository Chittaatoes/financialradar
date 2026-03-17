import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { API_URL } from "@/lib/api";
import { localDb } from "@/lib/local-db";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

async function fetchUser(): Promise<User | null> {
  const res = await fetch(`${API_URL}/api/auth/user`, {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) {
    return null;
  }
  if (!res.ok) throw new Error("Failed to fetch user");

  return res.json();
}

async function guestLogin() {
  const res = await fetch(`${API_URL}/api/guest-login`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Guest login failed");

  return res.json();
}

async function logout() {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) throw new Error("Logout failed");

  return true;
}

async function clearAllCaches() {
  // 1. Clear persisted React Query cache from localStorage.
  //    This is the primary fix for "logout sometimes fails" — without this,
  //    persistQueryClient restores the old user on the next page load and
  //    React Query won't refetch (stale time hasn't passed) so the app
  //    thinks the user is still logged in even though the session cookie is gone.
  localStorage.removeItem("REACT_QUERY_OFFLINE_CACHE");

  // 2. Clear IndexedDB cache_store for all auth-related keys so the offline
  //    fallback in getQueryFn never serves a stale authenticated user.
  try {
    await localDb.cache_store.where("key").startsWith("/api/auth").delete();
    await localDb.cache_store.delete("/api/profile");
  } catch {
    // non-fatal — best effort
  }

  // 3. Clear ALL service worker / browser caches (Workbox cache names vary,
  //    so the old "api-" prefix filter was missing them entirely).
  if ("caches" in window) {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch {
      // non-fatal
    }
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false,
    // staleTime: 0 ensures the auth state is ALWAYS re-validated on mount.
    // This prevents the "app renders with old user after logout" flash.
    // During the background re-fetch, the cached value is shown seamlessly
    // (isLoading stays false), so there is no visible loading spinner.
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) {
      const staleKeys = ["auth-user", "fr-user", "user"];
      staleKeys.forEach((k) => {
        if (localStorage.getItem(k)) localStorage.removeItem(k);
      });
    }
  }, [user]);

  const guestLoginMutation = useMutation({
    mutationFn: guestLogin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      // Clear React Query in-memory cache first
      queryClient.clear();

      // Then clear all persisted caches (localStorage + IndexedDB + SW caches)
      await clearAllCaches();

      window.location.href = "/";
    },
    onError: async () => {
      // Even if the server logout request fails (e.g. network error),
      // still clear local caches so the UI reflects a logged-out state.
      queryClient.clear();
      await clearAllCaches();
      window.location.href = "/";
    },
  });

  const isGuest = !!(user && (user as any).isGuest);
  const isAuthenticated = !!(user && !(user as any).isGuest);

  return {
    user,
    isLoading,
    isError,
    isGuest,
    isAuthenticated,
    refetch,
    guestLogin: guestLoginMutation.mutate,
    logout: logoutMutation.mutate,
    isGuestLoggingIn: guestLoginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}
