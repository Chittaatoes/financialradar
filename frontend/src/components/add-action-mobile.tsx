import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { ActionSelectorSheet } from "./action-selector-sheet";

interface Props {
  onSelectAction: (action: string) => void;
}

export function AddActionMobile({ onSelectAction }: Props) {
  const [open, setOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > lastY + 8) setScrolledDown(true);
      else if (y < lastY - 8) setScrolledDown(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <ActionSelectorSheet
        open={open}
        onClose={() => setOpen(false)}
        onSelectAction={(type) => {
          setOpen(false);
          onSelectAction(type);
        }}
      />

      {!open && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{
              scale: scrolledDown ? 0.92 : 1,
              opacity: 1,
            }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onClick={() => setOpen(true)}
            className="relative w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(145deg, hsl(158 32% 19%), hsl(158 26% 30%))",
              boxShadow: scrolledDown
                ? "0 4px 14px rgba(0,0,0,0.2)"
                : "0 8px 32px rgba(0,0,0,0.28), 0 0 0 1.5px hsl(158 26% 45% / 0.25)",
            }}
            data-testid="button-fab-mobile"
          >
            <motion.span
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: "-4px",
                border: "1.5px solid hsl(158 26% 48% / 0.35)",
                borderRadius: "9999px",
              }}
              animate={{
                scale: [1, 1.22, 1],
                opacity: [0.65, 0, 0.65],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                repeatDelay: 7.5,
                ease: "easeInOut",
              }}
            />
            <Plus className="w-7 h-7 text-white relative z-10" strokeWidth={2.5} />
          </motion.button>
        </div>
      )}
    </>
  );
}
