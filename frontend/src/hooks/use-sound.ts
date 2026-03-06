import { useCallback, useRef } from "react";

type SoundType = "xp" | "levelUp" | "transaction" | "streak";

const audioCtxRef: { current: AudioContext | null } = { current: null };

function getAudioContext(): AudioContext {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContext();
  }
  if (audioCtxRef.current.state === "suspended") {
    audioCtxRef.current.resume();
  }
  return audioCtxRef.current;
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  startTime: number,
  type: OscillatorType = "sine",
  volume: number = 0.15
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function playXpSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  playTone(ctx, 880, 0.12, now, "sine", 0.12);
  playTone(ctx, 1174, 0.15, now + 0.08, "sine", 0.1);
}

function playLevelUpSound() {
  try {
    const audio = new Audio("/sounds/level-up.mp3");
    audio.volume = 0.8;
    audio.play().catch(() => {
      const ctx = getAudioContext();
      const now = ctx.currentTime;
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        playTone(ctx, freq, 0.2, now + i * 0.12, "sine", 0.13);
      });
      playTone(ctx, 1047, 0.5, now + 0.48, "triangle", 0.08);
    });
  } catch {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      playTone(ctx, freq, 0.2, now + i * 0.12, "sine", 0.13);
    });
  }
}

function playTransactionSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  playTone(ctx, 660, 0.08, now, "sine", 0.1);
  playTone(ctx, 880, 0.12, now + 0.06, "sine", 0.08);
  playTone(ctx, 1100, 0.1, now + 0.12, "sine", 0.06);
}

function playStreakSound() {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  playTone(ctx, 440, 0.15, now, "triangle", 0.1);
  playTone(ctx, 554, 0.15, now + 0.1, "triangle", 0.1);
  playTone(ctx, 659, 0.15, now + 0.2, "triangle", 0.1);
  playTone(ctx, 880, 0.3, now + 0.3, "sine", 0.12);
}

const soundMap: Record<SoundType, () => void> = {
  xp: playXpSound,
  levelUp: playLevelUpSound,
  transaction: playTransactionSound,
  streak: playStreakSound,
};

function isSoundEnabled(): boolean {
  return localStorage.getItem("fr_sound_enabled") !== "false";
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem("fr_sound_enabled", enabled ? "true" : "false");
}

export function getSoundEnabled(): boolean {
  return isSoundEnabled();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  });
}

export function playSound(type: SoundType) {
  if (!isSoundEnabled()) return;
  try {
    soundMap[type]();
  } catch (_e) {
  }
}

export function useSound() {
  const lastPlayedRef = useRef<Record<string, number>>({});

  const play = useCallback((type: SoundType, debounceMs: number = 200) => {
    if (!isSoundEnabled()) return;
    const now = Date.now();
    if (now - (lastPlayedRef.current[type] || 0) < debounceMs) return;
    lastPlayedRef.current[type] = now;
    try {
      soundMap[type]();
    } catch (_e) {
    }
  }, []);

  return { play };
}
