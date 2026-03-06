import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { playSound } from "@/hooks/use-sound";

interface XpChipProps {
  amount: number;
  show: boolean;
  onDone?: () => void;
}

export function XpChip({ amount, show, onDone }: XpChipProps) {
  const [visible, setVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setVisible(true);
      playSound("xp");
      const timer = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: -20, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.6 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] pointer-events-none"
        >
          <div className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-xl">
            <Sparkles className="w-4 h-4" />
            <span className="font-mono font-bold text-sm">+{amount} XP</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
