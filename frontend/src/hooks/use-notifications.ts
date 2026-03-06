const STORAGE_KEY = "fr_notifications";

export interface NotificationSettings {
  enabled: boolean;
  hour: number;
  minute: number;
  timezone: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  hour: 21,
  minute: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta",
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

export function scheduleNotificationCheck(): void {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const target = new Date();
  target.setHours(settings.hour, settings.minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target.getTime() - now.getTime();

  const timerId = setTimeout(() => {
    new Notification("Financial Radar", {
      body: "Jangan lupa catat transaksi hari ini! 💰",
      icon: "/favicon.png",
      tag: "daily-reminder",
    });
    scheduleNotificationCheck();
  }, delay);

  (window as any).__frNotifTimer = timerId;
}

export function cancelScheduledNotification(): void {
  if ((window as any).__frNotifTimer) {
    clearTimeout((window as any).__frNotifTimer);
    (window as any).__frNotifTimer = null;
  }
}

export const COMMON_TIMEZONES = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Auckland",
];
