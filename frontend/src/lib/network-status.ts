import { toast } from "@/hooks/use-toast";

let initialized = false;

export function initNetworkStatus(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener("offline", () => {
    toast.warning("Kamu sedang offline. Perubahan akan disinkronkan saat koneksi kembali.", {
      duration: 5000,
    });
  });

  window.addEventListener("online", () => {
    toast.success("Koneksi kembali. Menyinkronkan data...", {
      duration: 3000,
    });
    import("@/lib/offline-sync").then(({ syncOfflineQueue }) => {
      syncOfflineQueue();
    });
  });
}
