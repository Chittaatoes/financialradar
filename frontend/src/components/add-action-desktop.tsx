import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { playSound } from "@/hooks/use-sound";
import {
  Plus, X,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  PiggyBank, CreditCard, CalendarOff,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Props {
  onSelectAction: (action: string) => void;
}

const ACTION_ITEMS = [
  { type: "income", icon: ArrowDownLeft, color: "bg-emerald-500", tLabel: "actionIncome" },
  { type: "expense", icon: ArrowUpRight, color: "bg-red-400", tLabel: "actionExpense" },
  { type: "transfer", icon: ArrowLeftRight, color: "bg-blue-500", tLabel: "actionTransfer" },
  { type: "savings", icon: PiggyBank, color: "bg-teal-500", tLabel: "actionSavings" },
  { type: "debt_payment", icon: CreditCard, color: "bg-orange-500", tLabel: "actionDebtPayment" },
  { type: "no_spend", icon: CalendarOff, color: "bg-slate-500", tLabel: "actionNoSpend" },
] as const;

export function AddActionDesktop({ onSelectAction }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const { toast } = useToast();
  const dashT = t.dashboard as any;

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

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-end gap-3">
        <motion.button
          onClick={() => setOpen(!open)}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          data-testid="button-fab-desktop"
        >
          <motion.div
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {open && (
            <div className="flex flex-col items-end gap-2">
              {ACTION_ITEMS.map((item, i) => {
                const Icon = item.icon;
                const reverseIndex = ACTION_ITEMS.length - 1 - i;
                return (
                  <motion.button
                    key={item.type}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    transition={{
                      delay: reverseIndex * 0.05,
                      duration: 0.2,
                      ease: "easeOut",
                    }}
                    onClick={() => handleAction(item.type)}
                    className="flex items-center gap-2.5 group"
                    data-testid={`fab-desktop-${item.type}`}
                  >
                    <motion.span
                      className="bg-background text-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-md border opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                    >
                      {dashT[item.tLabel]}
                    </motion.span>
                    <div
                      className={`w-11 h-11 rounded-full ${item.color} flex items-center justify-center shadow-md transition-transform duration-200 group-hover:scale-110`}
                    >
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
