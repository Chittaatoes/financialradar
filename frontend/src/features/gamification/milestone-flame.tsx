import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

export function getMilestoneLevel(days: number): number {
  if (days >= 365) return 6;
  if (days >= 180) return 5;
  if (days >= 90) return 4;
  if (days >= 30) return 3;
  if (days >= 7) return 2;
  if (days >= 3) return 1;
  return 0;
}

export function getMilestoneName(level: number): string {
  switch (level) {
    case 1: return "Momentum";
    case 2: return "1 Week Consistent";
    case 3: return "1 Month Discipline";
    case 4: return "3 Month Discipline";
    case 5: return "6 Month Consistency";
    case 6: return "1 Year Elite";
    default: return "";
  }
}

interface MilestoneFlameProps {
  streakDays: number;
  size?: number;
  showUnlock?: boolean;
}

export function MilestoneFlame({ streakDays, size = 160, showUnlock = false }: MilestoneFlameProps) {
  const level = getMilestoneLevel(streakDays);
  const [hasUnlocked, setHasUnlocked] = useState(false);

  useEffect(() => {
    if (showUnlock && level > 0) {
      setHasUnlocked(true);
      const timer = setTimeout(() => setHasUnlocked(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showUnlock, level]);

  const flameScale = 1 + level * 0.04;
  const glowRadius = 10 + level * 6;
  const glowOpacity = 0.35 + level * 0.08;

  const outerGradientStops = getOuterGradient(level);
  const innerGradientStops = getInnerGradient(level);

  const unlockScale = level >= 4 ? 1.15 : level >= 2 ? 1.12 : 1.08;
  const unlockDuration = 0.6 + level * 0.15;

  const outerPath = level >= 2
    ? "M50 2 C50 2, 10 38, 10 68 C10 96, 27 118, 50 118 C73 118, 90 96, 90 68 C90 38, 50 2, 50 2Z"
    : "M50 5 C50 5, 15 40, 15 70 C15 95, 30 115, 50 115 C70 115, 85 95, 85 70 C85 40, 50 5, 50 5Z";

  const innerPath = level >= 2
    ? "M50 30 C50 30, 26 52, 26 73 C26 93, 36 108, 50 108 C64 108, 74 93, 74 73 C74 52, 50 30, 50 30Z"
    : "M50 35 C50 35, 30 55, 30 75 C30 92, 38 105, 50 105 C62 105, 70 92, 70 75 C70 55, 50 35, 50 35Z";

  const coreVisible = level >= 3;
  const corePath = "M50 55 C50 55, 38 68, 38 80 C38 92, 43 100, 50 100 C57 100, 62 92, 62 80 C62 68, 50 55, 50 55Z";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {level >= 5 && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: size * 1.5,
            height: size * 1.5,
            background: `radial-gradient(circle, ${level >= 6 ? "rgba(251,191,36,0.12)" : "rgba(251,191,36,0.07)"} 0%, transparent 70%)`,
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {level >= 2 && (
        <motion.div
          className="absolute rounded-full border"
          style={{
            width: size * 0.95,
            height: size * 0.95,
            borderColor: level >= 4 ? "rgba(251,191,36,0.2)" : "rgba(168,85,247,0.25)",
            borderWidth: level >= 4 ? 2 : 1.5,
          }}
          initial={hasUnlocked ? { scale: 1, opacity: 0 } : { opacity: 0.25 }}
          animate={hasUnlocked
            ? { scale: [1, 1.3, 1], opacity: [0, 0.4, 0.25] }
            : { opacity: 0.25 }
          }
          transition={hasUnlocked
            ? { duration: 1, ease: [0.22, 1, 0.36, 1] }
            : {}
          }
        />
      )}

      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.9,
          height: size * 0.9,
          background: `radial-gradient(circle, ${getGlowColor(level)} 0%, transparent 70%)`,
          filter: `blur(${glowRadius}px)`,
          opacity: glowOpacity,
        }}
        animate={level >= 1
          ? { scale: [1, 1.15, 1], opacity: [glowOpacity, glowOpacity + 0.1, glowOpacity] }
          : {}
        }
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />

      {level >= 4 && (
        <AnimatePresence>
          {hasUnlocked && (
            <motion.div
              className="absolute rounded-full"
              style={{
                width: size * 0.5,
                height: size * 0.5,
                border: `2px solid ${level >= 6 ? "rgba(251,191,36,0.2)" : "rgba(168,85,247,0.2)"}`,
              }}
              initial={{ scale: 0.5, opacity: 0.4 }}
              animate={{ scale: 3, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
      )}

      {level >= 6 && (
        <motion.div
          className="absolute"
          style={{
            width: size * 0.6,
            height: size * 0.3,
            top: size * 0.02,
          }}
          animate={{ opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 60 30" className="w-full h-full">
            <path
              d="M30 2 L36 12 L46 12 L38 19 L41 28 L30 22 L19 28 L22 19 L14 12 L24 12 Z"
              fill="rgba(251,191,36,0.12)"
            />
          </svg>
        </motion.div>
      )}

      <motion.div
        className="relative"
        style={{ width: size * 0.85, height: size * 0.85 }}
        animate={hasUnlocked
          ? {
            scale: [1, unlockScale, 1],
            y: level >= 5 ? [0, -10, 0] : level >= 2 ? [0, -8, 0] : [0, 0, 0],
          }
          : { scale: flameScale }
        }
        transition={hasUnlocked
          ? { duration: unlockDuration, ease: "easeOut" }
          : { duration: 0.3 }
        }
      >
        <svg viewBox="0 0 100 120" className="w-full h-full" style={{
          filter: `drop-shadow(0 0 ${glowRadius}px ${getGlowColor(level)}) drop-shadow(0 0 ${glowRadius * 0.5}px ${getGlowColor(level)})`,
        }}>
          <defs>
            <linearGradient id={`flameOuter-${level}`} x1="0%" y1="100%" x2="0%" y2="0%">
              {outerGradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
            <linearGradient id={`flameInner-${level}`} x1="0%" y1="100%" x2="0%" y2="0%">
              {innerGradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
            <linearGradient id={`flameCore-${level}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="50%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
            {level >= 4 && (
              <filter id={`goldOutline-${level}`}>
                <feMorphology in="SourceAlpha" operator="dilate" radius={level >= 6 ? 2 : 1.5} result="dilated" />
                <feFlood floodColor={level >= 6 ? "rgba(251,191,36,0.5)" : "rgba(251,191,36,0.35)"} result="color" />
                <feComposite in="color" in2="dilated" operator="in" result="outline" />
                <feMerge>
                  <feMergeNode in="outline" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            )}
          </defs>
          <g filter={level >= 4 ? `url(#goldOutline-${level})` : undefined}>
            <path
              d={outerPath}
              fill={`url(#flameOuter-${level})`}
              className="animate-[flamePulse_1.8s_ease-in-out_infinite]"
            />
            <path
              d={innerPath}
              fill={`url(#flameInner-${level})`}
              className="animate-[flamePulse_1.8s_ease-in-out_infinite_0.2s]"
            />
            {coreVisible && (
              <motion.path
                d={corePath}
                fill={`url(#flameCore-${level})`}
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </g>
          {level >= 3 && (
            <motion.rect
              x={33} y={45} width={34} height={55} rx={17}
              fill="rgba(255,255,255,0.04)"
              animate={{ opacity: [0.02, 0.08, 0.02] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </svg>
      </motion.div>

      {hasUnlocked && level >= 3 && (
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0.2 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          style={{
            background: level >= 5
              ? "radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 60%)"
              : "radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 60%)",
          }}
        />
      )}

      <style>{`
        @keyframes flamePulse {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          50% { transform: scaleY(1.06) scaleX(0.94); }
        }
      `}</style>
    </div>
  );
}

function getGlowColor(level: number): string {
  if (level >= 6) return "rgba(251,191,36,0.6)";
  if (level >= 5) return "rgba(251,191,36,0.5)";
  if (level >= 4) return "rgba(168,85,247,0.5)";
  if (level >= 3) return "rgba(168,85,247,0.45)";
  if (level >= 2) return "rgba(168,85,247,0.4)";
  return "rgba(168,85,247,0.35)";
}

type GradientStop = { offset: string; color: string };

function getOuterGradient(level: number): GradientStop[] {
  if (level >= 6) return [
    { offset: "0%", color: "#ea580c" },
    { offset: "20%", color: "#f97316" },
    { offset: "50%", color: "#fbbf24" },
    { offset: "80%", color: "#f59e0b" },
    { offset: "100%", color: "#d97706" },
  ];
  if (level >= 5) return [
    { offset: "0%", color: "#ea580c" },
    { offset: "25%", color: "#f97316" },
    { offset: "50%", color: "#fbbf24" },
    { offset: "75%", color: "#d946ef" },
    { offset: "100%", color: "#a855f7" },
  ];
  if (level >= 3) return [
    { offset: "0%", color: "#f97316" },
    { offset: "25%", color: "#fbbf24" },
    { offset: "50%", color: "#d946ef" },
    { offset: "100%", color: "#a855f7" },
  ];
  if (level >= 2) return [
    { offset: "0%", color: "#ea580c" },
    { offset: "30%", color: "#f97316" },
    { offset: "60%", color: "#d946ef" },
    { offset: "100%", color: "#a855f7" },
  ];
  return [
    { offset: "0%", color: "#f97316" },
    { offset: "40%", color: "#d946ef" },
    { offset: "100%", color: "#a855f7" },
  ];
}

function getInnerGradient(level: number): GradientStop[] {
  if (level >= 6) return [
    { offset: "0%", color: "#fef3c7" },
    { offset: "30%", color: "#fde68a" },
    { offset: "60%", color: "#fbbf24" },
    { offset: "100%", color: "#f59e0b" },
  ];
  if (level >= 5) return [
    { offset: "0%", color: "#fef3c7" },
    { offset: "40%", color: "#fde68a" },
    { offset: "70%", color: "#fbbf24" },
    { offset: "100%", color: "#f472b6" },
  ];
  if (level >= 3) return [
    { offset: "0%", color: "#fde68a" },
    { offset: "50%", color: "#fbbf24" },
    { offset: "100%", color: "#f472b6" },
  ];
  if (level >= 2) return [
    { offset: "0%", color: "#fde68a" },
    { offset: "40%", color: "#fbbf24" },
    { offset: "100%", color: "#f472b6" },
  ];
  return [
    { offset: "0%", color: "#fbbf24" },
    { offset: "100%", color: "#f472b6" },
  ];
}
