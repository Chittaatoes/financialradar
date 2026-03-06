import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { playSound } from "@/hooks/use-sound";
import {
  Plus,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  PiggyBank, CreditCard, CalendarOff,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface Props {
  onSelectAction: (action: string) => void;
}

const ACTION_ITEMS = [
  { type: "income", icon: ArrowDownLeft, color: "bg-emerald-500", tLabel: "actionIncome", tDesc: "actionIncomeDesc" },
  { type: "expense", icon: ArrowUpRight, color: "bg-red-400", tLabel: "actionExpense", tDesc: "actionExpenseDesc" },
  { type: "transfer", icon: ArrowLeftRight, color: "bg-blue-500", tLabel: "actionTransfer", tDesc: "actionTransferDesc" },
  { type: "savings", icon: PiggyBank, color: "bg-teal-500", tLabel: "actionSavings", tDesc: "actionSavingsDesc" },
  { type: "debt_payment", icon: CreditCard, color: "bg-orange-500", tLabel: "actionDebtPayment", tDesc: "actionDebtPaymentDesc" },
  { type: "no_spend", icon: CalendarOff, color: "bg-slate-500", tLabel: "actionNoSpend", tDesc: "actionNoSpendDesc" },
] as const;

export function AddActionMobile({ onSelectAction }: Props) {
  const [open, setOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const { t } = useLanguage();
  const { toast } = useToast();
  const dashT = t.dashboard as any;

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

  const noSpendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/no-spending"),
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-focus"] });
      toast({ title: "Recorded!", description: "No spending today. +5 XP earned!" });
      setOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
    },
  });

  const handleAction = useCallback((type: string) => {
    if (type === "no_spend") {
      noSpendMutation.mutate();
      return;
    }
    setOpen(false);
    onSelectAction(type);
  }, [onSelectAction, noSpendMutation]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl border-t max-h-[70vh] overflow-auto"
          >
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mt-3" />
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-base font-serif font-bold">{dashT.addActionTitle}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{dashT.addActionDesc}</p>
            </div>
            <div className="px-5 pb-6 space-y-1">
              {ACTION_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.type}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                    onClick={() => handleAction(item.type)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                    data-testid={`fab-mobile-${item.type}`}
                  >
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", item.color)}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{dashT[item.tLabel]}</p>
                      <p className="text-xs text-muted-foreground">{dashT[item.tDesc]}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
