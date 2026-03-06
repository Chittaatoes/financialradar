import { motion } from "framer-motion";

interface ScoreRingProps {
  score: number;
  tier: string;
  size?: number;
  strokeWidth?: number;
  compact?: boolean;
  animate?: boolean;
}

function getTierStyles(tier: string) {
  const base = "stroke-primary";
  switch (tier) {
    case "Diamond": return { stroke: base, width: 1.3, glow: "drop-shadow(0 0 8px hsl(var(--primary) / 0.4))" };
    case "Platinum": return { stroke: base, width: 1.2, glow: "drop-shadow(0 0 6px hsl(var(--primary) / 0.3))" };
    case "Gold": return { stroke: base, width: 1.1, glow: "drop-shadow(0 0 4px hsl(var(--primary) / 0.2))" };
    case "Silver": return { stroke: base, width: 1.0, glow: "drop-shadow(0 0 2px hsl(var(--primary) / 0.15))" };
    default: return { stroke: base, width: 1.0, glow: "none" };
  }
}

export default function ScoreRing({ score, tier, size = 120, strokeWidth = 10, compact = false, animate = true }: ScoreRingProps) {
  const tierStyle = getTierStyles(tier);
  const adjustedStroke = strokeWidth * tierStyle.width;
  const radius = (size - adjustedStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        style={{ filter: tierStyle.glow }}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className="stroke-muted"
          strokeWidth={adjustedStroke}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className={tierStyle.stroke}
          strokeWidth={adjustedStroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animate ? { strokeDashoffset: circumference } : { strokeDashoffset: circumference - progress }}
          animate={{ strokeDashoffset: circumference - progress }}
          transition={animate ? { duration: 1.2, ease: "easeOut", delay: 0.3 } : { duration: 0.6, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {compact ? (
          <motion.span
            className="font-mono font-bold text-foreground"
            style={{ fontSize: size * 0.28 }}
            initial={animate ? { opacity: 0 } : { opacity: 1 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {score}
          </motion.span>
        ) : (
          <>
            <motion.span
              className="font-mono font-bold text-foreground"
              style={{ fontSize: size * 0.22 }}
              initial={animate ? { opacity: 0, scale: 0.8 } : { opacity: 1 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8, duration: 0.4 }}
            >
              {score}
            </motion.span>
            <motion.span
              className="text-muted-foreground"
              style={{ fontSize: size * 0.08 }}
              initial={animate ? { opacity: 0 } : { opacity: 1 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              / 100
            </motion.span>
          </>
        )}
      </div>
    </div>
  );
}
