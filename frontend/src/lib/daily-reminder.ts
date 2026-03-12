import { getNotificationSettings } from "@/hooks/use-notifications";

declare global {
  interface Window {
    finRadarReminderStarted?: boolean;
  }
}

function getTodayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `finradar-reminder-${y}-${m}-${day}`;
}

function hasSentToday(): boolean {
  return !!localStorage.getItem(getTodayKey());
}

function markSentToday(): void {
  localStorage.setItem(getTodayKey(), "1");
}

function isWithinCooldown(): boolean {
  const last = localStorage.getItem("finradar-last-reminder");
  if (!last) return false;
  return Date.now() - Number(last) < 10 * 60 * 1000;
}

function sendReminder(): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (hasSentToday()) return;
  if (isWithinCooldown()) return;

  new Notification("Financial Radar", {
    body: "Jangan lupa catat transaksi hari ini! 💰",
    icon: "/favicon.png",
    tag: "financial-radar-daily-reminder",
  });

  markSentToday();
  localStorage.setItem("finradar-last-reminder", String(Date.now()));
}

function scheduleNext(): void {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const now = new Date();
  const target = new Date();
  target.setHours(settings.hour, settings.minute, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);

  const delay = target.getTime() - now.getTime();

  const timerId = window.setTimeout(() => {
    sendReminder();
    scheduleNext();
  }, delay);

  (window as any).__frDailyReminderTimer = timerId;
}

export function startDailyReminder(): void {
  if (window.finRadarReminderStarted) return;
  window.finRadarReminderStarted = true;

  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  scheduleNext();
}

export function stopDailyReminder(): void {
  window.finRadarReminderStarted = false;
  if ((window as any).__frDailyReminderTimer) {
    clearTimeout((window as any).__frDailyReminderTimer);
    (window as any).__frDailyReminderTimer = null;
  }
}

export function restartDailyReminder(): void {
  stopDailyReminder();
  startDailyReminder();
}
