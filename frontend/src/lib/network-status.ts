import { toast } from "@/hooks/use-toast";
import { syncOfflineQueue } from "@/lib/offline-sync";

let initialized = false;

export function initNetworkStatus(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener("offline", () => {
    toast.warning(
      "Kamu sedang offline. Perubahan akan disinkronkan saat koneksi kembali.",
      { duration: 5000 },
    );
  });

  window.addEventListener("online", () => {
    toast.success("Koneksi kembali. Menyinkronkan data...", { duration: 3000 });
    syncOfflineQueue();
  });
}
