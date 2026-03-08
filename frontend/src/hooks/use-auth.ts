import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

async function fetchUser(): Promise<User | null> {
  const res = await fetch(`${API_URL}/api/auth/user`, {
    credentials: "include",
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
  });

  if (!res.ok) throw new Error("Guest login failed");

  return res.json();
}

async function logout() {
  const res = await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) throw new Error("Logout failed");

  return true;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: Infinity,
  });

  const guestLoginMutation = useMutation({
    mutationFn: guestLogin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
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
    guestLogin: guestLoginMutation.mutate,
    logout: logoutMutation.mutate,
    isGuestLoggingIn: guestLoginMutation.isPending,
    isLoggingOut: logoutMutation.isPending,
  };
}