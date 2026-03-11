import { API_URL } from "@/lib/api";
import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  ChevronRight,
  ShieldCheck,
  Lock,
  Award,
  LogOut,
  Globe,
  Moon,
  Sun,
  User,
  Heart,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Clock,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/lib/i18n";
import { useTheme } from "@/components/theme-provider";
import { getTierKey } from "@/lib/constants";

import { ProfileAuthorFooter } from "@/components/profile-author-footer";
import { getSoundEnabled, setSoundEnabled, playSound } from "@/hooks/use-sound";
import type { UserProfile } from "@shared/schema";
import {
  getNotificationSettings,
  saveNotificationSettings,
  requestNotificationPermission,
  scheduleNotificationCheck,
  cancelScheduledNotification,
  COMMON_TIMEZONES,
  type NotificationSettings,
} from "@/hooks/use-notifications";

function ScrollPicker({
  values,
  selected,
  onSelect,
}: {
  values: number[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const itemHeight = 44;

  useEffect(() => {
    const idx = values.indexOf(selected);
    if (containerRef.current && idx >= 0) {
      containerRef.current.scrollTop = idx * itemHeight;
    }
  }, [selected, values]);

  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (!containerRef.current) return;
      const idx = Math.round(containerRef.current.scrollTop / itemHeight);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      if (values[clamped] !== selected) onSelect(values[clamped]);
    });
  };

  return (
    <div className="relative w-16 h-[132px] overflow-hidden rounded-lg border bg-background select-none">
      <div className="absolute inset-x-0 top-0 h-11 bg-gradient-to-b from-background/95 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-11 bg-gradient-to-t from-background/95 to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-11 border-y border-primary/30 z-10 pointer-events-none bg-primary/5" />
      <div
        ref={containerRef}
        className="h-full overflow-y-scroll scrollbar-hide"
        onScroll={handleScroll}
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-y",
          overscrollBehavior: "contain",
        } as React.CSSProperties}
      >
        <div style={{ paddingTop: itemHeight, paddingBottom: itemHeight }}>
          {values.map((v) => (
            <div
              key={v}
              className={`flex items-center justify-center font-mono font-semibold cursor-pointer transition-colors ${
                v === selected ? "text-primary text-base" : "text-muted-foreground text-sm"
              }`}
              style={{ height: itemHeight, scrollSnapAlign: "center", scrollSnapStop: "always" }}
              onClick={() => onSelect(v)}
            >
              {String(v).padStart(2, "0")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimezoneSelector({
  value,
  onChange,
  timezones,
}: {
  value: string;
  onChange: (tz: string) => void;
  timezones: string[];
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const shortLabel = value.split("/").pop()?.replace(/_/g, " ") ?? value;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-sm border rounded-lg px-3 py-2 w-full bg-background text-foreground hover:bg-muted/50 transition-colors focus:outline-none"
        data-testid="profile-notif-timezone"
      >
        <span className="truncate text-left">{shortLabel}</span>
        <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ maxHeight: "154px", overflowY: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        >
          {timezones.map((tz) => {
            const label = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
            const isSelected = tz === value;
            return (
              <button
                key={tz}
                type="button"
                onClick={() => { onChange(tz); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                <span className="truncate">{label}</span>
                {isSelected && (
                  <svg className="w-3.5 h-3.5 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NotificationRow() {
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState<NotificationSettings>(() => getNotificationSettings());
  const [showPicker, setShowPicker] = useState(false);
  const pickerDropdownRef = useRef<HTMLDivElement>(null);
  const timeButtonRef = useRef<HTMLButtonElement>(null);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerDropdownRef.current && !pickerDropdownRef.current.contains(e.target as Node) &&
        timeButtonRef.current && !timeButtonRef.current.contains(e.target as Node)
      ) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const handleToggle = async (enabled: boolean) => {
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alert("Aktifkan izin notifikasi di browser kamu untuk menerima pengingat.");
        return;
      }
    }
    const next = { ...settings, enabled };
    setSettings(next);
    saveNotificationSettings(next);
    if (enabled) {
      scheduleNotificationCheck();
    } else {
      cancelScheduledNotification();
    }
  };

  const handleHour = (hour: number) => {
    const next = { ...settings, hour };
    setSettings(next);
    saveNotificationSettings(next);
    if (next.enabled) scheduleNotificationCheck();
  };

  const handleMinute = (minute: number) => {
    const next = { ...settings, minute };
    setSettings(next);
    saveNotificationSettings(next);
    if (next.enabled) scheduleNotificationCheck();
  };

  const handleTimezone = (tz: string) => {
    const next = { ...settings, timezone: tz };
    setSettings(next);
    saveNotificationSettings(next);
  };

  const timeLabel = `${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}`;

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {settings.enabled ? (
            <Bell className="w-4 h-4 text-muted-foreground" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm">Pengingat transaksi harian</span>
        </div>
        <button
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => handleToggle(!settings.enabled)}
          data-testid="profile-notif-toggle"
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            settings.enabled ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {settings.enabled && (
        <div className="px-4 pb-3 pt-1 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Waktu Pengingat
              </p>
              {!isMobile ? (
                <input
                  type="time"
                  value={timeLabel}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(":").map(Number);
                    if (!isNaN(h)) handleHour(h);
                    if (!isNaN(m)) handleMinute(m);
                  }}
                  className="flex items-center gap-2 text-sm font-mono font-semibold text-foreground border rounded-lg px-3 py-2 w-full hover:bg-muted/50 transition-colors bg-background"
                  data-testid="profile-notif-time"
                />
              ) : (
                <>
                  <button
                    ref={timeButtonRef}
                    className="flex items-center gap-2 text-sm font-mono font-semibold text-foreground border rounded-lg px-3 py-2 w-full hover:bg-muted/50 transition-colors"
                    onClick={() => setShowPicker(!showPicker)}
                    data-testid="profile-notif-time"
                  >
                    {timeLabel}
                    <Clock className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                  </button>
                  {showPicker && (
                    <div
                      ref={pickerDropdownRef}
                      className="absolute top-full left-0 z-50 mt-1.5 bg-background border border-border rounded-xl shadow-xl p-3 flex items-center gap-3"
                    >
                      <ScrollPicker values={hours} selected={settings.hour} onSelect={handleHour} />
                      <span className="font-bold text-lg text-muted-foreground">:</span>
                      <ScrollPicker values={minutes} selected={settings.minute} onSelect={handleMinute} />
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Zona Waktu
              </p>
              <TimezoneSelector
                value={settings.timezone}
                onChange={handleTimezone}
                timezones={COMMON_TIMEZONES}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout, isGuest, isAuthenticated } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const pt = (t as any).profile;
  const nt = t.nav;
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const queryClient = useQueryClient();

  const updateNameMutation = useMutation({
    mutationFn: (firstName: string) => apiRequest("PATCH", "/api/user/name", { firstName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      setEditingName(false);
    },
  });

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile"],
  });

  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const tierKey = getTierKey(level);
  const tierName = (t.tiers as any)[tierKey] ?? tierKey;

  const displayName = user?.firstName
    || (user as any)?.email
    || pt.guest;

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="p-4 pb-2 space-y-5 max-w-lg mx-auto">
      <h1 className="text-lg font-serif font-bold" data-testid="text-profile-title">
        {pt.title}
      </h1>

      <Card className="rounded-2xl p-4 shadow-sm" data-testid="card-account">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {pt.account}
        </p>
        <div className="flex items-center gap-3">
          <Avatar className="w-12 h-12">
            <AvatarImage src={user?.profileImageUrl || ""} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {user?.firstName?.[0] || <User className="w-5 h-5" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameInput.trim()) updateNameMutation.mutate(nameInput.trim());
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  className="text-sm font-semibold bg-transparent border-b border-primary outline-none w-full max-w-[160px]"
                  maxLength={50}
                />
                <button
                  onClick={() => { if (nameInput.trim()) updateNameMutation.mutate(nameInput.trim()); }}
                  disabled={updateNameMutation.isPending || !nameInput.trim()}
                  className="text-primary hover:text-primary/80 disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-semibold truncate" data-testid="text-profile-name">
                  {displayName}
                </p>
                {user && !user.isGuest && (
                  <button
                    onClick={() => { setNameInput(user?.firstName || ""); setEditingName(true); }}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                    data-testid="button-edit-name"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground" data-testid="text-profile-tier">
              {tierName} &middot; Lv {level}
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min((xp % 100), 100)}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-profile-xp">
            {xp} XP
          </span>
        </div>

        {(!user || user.isGuest) && (
          <div className="mt-4 pt-3 border-t border-border/50" data-testid="card-secure-account">
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground/80">Progress belum disimpan ke cloud</p>
                <p className="text-[11px] text-muted-foreground/55 mt-0.5">
                  Tautkan agar level &amp; target tidak hilang.
                </p>
                <button
                  className="mt-2 flex items-center gap-0.5 text-xs text-primary/80 font-medium hover:text-primary transition-colors"
                  onClick={() => window.location.href = `${API_URL}/api/login`}
                  data-testid="profile-button-secure-google"
                >
                  Tautkan dengan Google
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {user && !user.isGuest && (
          <div className="mt-4 pt-3 border-t border-border/50" data-testid="card-account-linked">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-primary/60 shrink-0" />
              <p className="text-xs text-primary/70">Akun Terhubung · Progress Anda sudah aman</p>
            </div>
          </div>
        )}
      </Card>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          {language === "id" ? "Preferensi" : "Preferences"}
        </p>
        <div className="rounded-2xl bg-card border shadow-sm overflow-hidden">
          <NotificationRow />

          <div className="border-t border-border/50" />

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm">{t.common.language}</span>
            </div>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setLanguage("en")}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  language === "en"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                data-testid="profile-lang-en"
              >
                EN
              </button>
              <button
                onClick={() => setLanguage("id")}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  language === "id"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                data-testid="profile-lang-id"
              >
                ID
              </button>
            </div>
          </div>

          <div className="border-t border-border/50" />

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Sun className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">{theme === "dark" ? pt.darkMode : pt.lightMode}</span>
            </div>
            <button
              role="switch"
              aria-checked={theme === "dark"}
              onClick={toggleTheme}
              data-testid="profile-theme-toggle"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  theme === "dark" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-border/50" />

          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {soundOn ? (
                <Volume2 className="w-4 h-4 text-muted-foreground" />
              ) : (
                <VolumeX className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">{pt.soundEffects}</span>
            </div>
            <button
              role="switch"
              aria-checked={soundOn}
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playSound("xp");
              }}
              data-testid="profile-sound-toggle"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                soundOn ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                  soundOn ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
          {language === "id" ? "Lainnya" : "More"}
        </p>
        <div className="rounded-2xl bg-card border shadow-sm overflow-hidden">
          <Link href="/achievements">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              data-testid="profile-link-achievements"
            >
              <Award className="w-4 h-4 text-muted-foreground" />
              <span className="flex-1 text-sm">{nt.achievements}</span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </Link>

          <div className="border-t border-border/50" />

          <a
            href="https://saweria.co/chittaatoes"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            data-testid="card-support-developer"
          >
            <Heart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">{language === "id" ? "Dukung Pengembang" : "Support Developer"}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </a>

          {(profile as any)?.role === "admin" && (
            <>
              <div className="border-t border-border/50" />
              <Link href="/admin">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  data-testid="profile-link-admin"
                >
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="flex-1 text-sm">{nt.admin}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              </Link>
            </>
          )}
        </div>
      </div>

      {isAuthenticated && (
        <Button
          variant="ghost"
          onClick={() => logout()}
          className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-2xl h-11"
          data-testid="profile-button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {t.auth.logout}
        </Button>
      )}

      <ProfileAuthorFooter />
    </div>
  );
}
