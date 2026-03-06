import { useState, useEffect, useRef } from "react";

interface LevelUpCelebrationProps {
  level: number;
  xpCurrent: number;
  xpNext: number;
  onClose: () => void;
  t: any;
}

const SPARKS = [
  { tx: "-28px", ty: "-74px", delay: "0ms" },
  { tx: "28px",  ty: "-74px", delay: "50ms" },
  { tx: "-62px", ty: "-52px", delay: "30ms" },
  { tx: "62px",  ty: "-52px", delay: "80ms" },
  { tx: "-78px", ty: "-16px", delay: "60ms" },
  { tx: "78px",  ty: "-16px", delay: "20ms" },
  { tx: "-46px", ty: "-68px", delay: "90ms" },
  { tx: "46px",  ty: "-68px", delay: "40ms" },
];

export function LevelUpCelebration({ level, xpCurrent, xpNext, onClose, t }: LevelUpCelebrationProps) {
  const [phase, setPhase] = useState(0);
  const [xpWidth, setXpWidth] = useState(0);
  const [xpTransition, setXpTransition] = useState(false);
  const [xpFlashing, setXpFlashing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const xpPct = xpNext > 0 ? Math.min((xpCurrent / xpNext) * 100, 100) : 0;

  useEffect(() => {
    const add = (fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      timers.current.push(id);
    };

    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(40);
    }

    requestAnimationFrame(() => setPhase(1));

    add(() => setPhase(2), 400);
    add(() => setPhase(3), 700);

    add(() => {
      setXpTransition(true);
      setXpWidth(100);
    }, 750);

    add(() => setXpFlashing(true), 1400);

    add(() => {
      setXpFlashing(false);
      setXpTransition(false);
      setXpWidth(0);
    }, 1620);

    add(() => {
      setXpTransition(true);
      setXpWidth(xpPct);
    }, 1680);

    add(() => setPhase(4), 2200);
    add(onClose, 5000);

    return () => timers.current.forEach(clearTimeout);
  }, []);

  const badgeStyle: React.CSSProperties =
    phase >= 4
      ? { animation: "iconBreathe 3s ease-in-out infinite" }
      : phase >= 1
      ? { animation: "iconEnter 0.6s cubic-bezier(0.22,1,0.36,1) forwards" }
      : { opacity: 0 };

  const d = t?.dashboard ?? {};
  const titleText = `Level ${level} ${d.levelUpUnlocked ?? "Unlocked"}`;
  const subtitleText = d.levelUpMessage ?? "Your wealth journey just advanced.";
  const progressLabel = `${d.levelUpProgress ?? "Progress to Level"} ${level + 1}`;

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center pointer-events-none"
      data-testid="levelup-celebration"
    >
      {/* Vignette overlay — radial, darker at edges */}
      <div
        className="absolute inset-0 pointer-events-auto cursor-pointer"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.18) 100%)",
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
      />

      <div className="relative z-10 pointer-events-auto flex flex-col items-center">

        {/* ── Phase 1: Icon zone — HERO ── */}
        <div className="relative w-40 h-40 flex items-center justify-center">

          {/* Radial glow behind badge */}
          {phase >= 1 && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
              }}
            />
          )}

          {/* Pulse rings */}
          {phase >= 1 && (
            <>
              <div
                className="absolute inset-0 rounded-full border border-emerald-400/40"
                style={{ animation: "pulseRing 0.9s cubic-bezier(0.2,0.8,0.4,1) forwards" }}
              />
              <div
                className="absolute inset-0 rounded-full border border-emerald-400/25"
                style={{ animation: "pulseRing 0.9s cubic-bezier(0.2,0.8,0.4,1) 160ms forwards" }}
              />
            </>
          )}

          {/* Spark particles */}
          {phase >= 1 && SPARKS.map((s, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400/75"
              style={{
                "--tx": s.tx,
                "--ty": s.ty,
                animation: `sparkFloat 1.0s ease-out ${s.delay} forwards`,
              } as React.CSSProperties}
            />
          ))}

          {/* Level number — dominant hero badge */}
          <div
            className="relative z-10 flex items-center justify-center w-24 h-24 rounded-[22px] select-none"
            style={{
              ...badgeStyle,
              background: "linear-gradient(145deg, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.06) 100%)",
              boxShadow: phase >= 1 ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 12px rgba(16,185,129,0.10)" : "none",
              border: "1px solid rgba(16,185,129,0.18)",
            }}
            data-testid="text-levelup-badge"
          >
            <span className="text-6xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
              {level}
            </span>
          </div>
        </div>

        {/* ── Phase 2: Card — elevated, slides beneath icon ── */}
        {phase >= 2 && (
          <div
            className="bg-card/96 backdrop-blur-lg rounded-[24px] border border-emerald-500/[0.12] px-8 pt-7 pb-8 text-center -mt-10 w-[290px]"
            style={{
              animation: "cardSlideIn 0.35s cubic-bezier(0.22,1,0.36,1) forwards",
              boxShadow: "0 24px 64px -8px rgba(0,0,0,0.22), 0 4px 16px -4px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >

            {/* ── Phase 3: Typography ── */}
            {phase >= 3 && (
              <div style={{ animation: "textFadeIn 0.3s ease-out forwards" }}>
                <p
                  className="font-semibold text-[17px] leading-snug tracking-tight text-foreground"
                  data-testid="text-levelup-heading"
                >
                  {titleText}
                </p>
                <p className="text-[12px] text-muted-foreground/70 mt-1 leading-snug">
                  {subtitleText}
                </p>
              </div>
            )}

            {/* ── XP bar (phase 3+) ── */}
            {phase >= 3 && (
              <div className="mt-5 w-full">
                <p className="text-[10px] text-muted-foreground/60 mb-2 tracking-wide uppercase font-medium">
                  {progressLabel}
                </p>
                <div className="h-[10px] w-full rounded-full bg-emerald-500/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${xpWidth}%`,
                      background: "linear-gradient(90deg, #059669 0%, #10b981 100%)",
                      transition: xpTransition ? "width 0.6s ease-out" : "none",
                      animation: xpFlashing ? "xpFlash 0.22s ease-out forwards" : "none",
                    }}
                    data-testid="bar-levelup-xp"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/55 mt-2 tabular-nums">
                  {xpCurrent} / {xpNext} XP
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
