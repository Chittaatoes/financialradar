import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { playSound } from "@/hooks/use-sound";
import {
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight,
  PiggyBank, CreditCard, CalendarOff, TrendingUp,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { ForexUploadSheet } from "./forex-upload-sheet";

export const ACTION_SELECTOR_ITEMS = [
  { type: "income", icon: ArrowDownLeft, color: "bg-emerald-500", tLabel: "actionIncome", tDesc: "actionIncomeDesc" },
  { type: "expense", icon: ArrowUpRight, color: "bg-red-400", tLabel: "actionExpense", tDesc: "actionExpenseDesc" },
  { type: "transfer", icon: ArrowLeftRight, color: "bg-blue-500", tLabel: "actionTransfer", tDesc: "actionTransferDesc" },
  { type: "savings", icon: PiggyBank, color: "bg-teal-500", tLabel: "actionSavings", tDesc: "actionSavingsDesc" },
  { type: "debt_payment", icon: CreditCard, color: "bg-orange-500", tLabel: "actionDebtPayment", tDesc: "actionDebtPaymentDesc" },
  { type: "no_spend", icon: CalendarOff, color: "bg-slate-500", tLabel: "actionNoSpend", tDesc: "actionNoSpendDesc" },
  { type: "forex", icon: TrendingUp, color: "bg-violet-500", tLabel: "actionForex", tDesc: "actionForexDesc" },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectAction: (type: string) => void;
}

export function ActionSelectorSheet({ open, onClose, onSelectAction }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const dashT = t.dashboard as any;
  const [forexOpen, setForexOpen] = useState(false);

  const noSpendMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/no-spending"),
    onSuccess: () => {
      playSound("transaction");
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/daily-focus"] });
      toast({ title: "Recorded!", description: "No spending today. +5 XP earned!" });
      onClose();
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
    if (type === "forex") {
      onClose();
      setForexOpen(true);
      return;
    }
    onClose();
    onSelectAction(type);
  }, [onSelectAction, onClose, noSpendMutation]);

  return (
    <>
      <ForexUploadSheet open={forexOpen} onClose={() => setForexOpen(false)} />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
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
              {ACTION_SELECTOR_ITEMS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.button
                    key={item.type}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.2 }}
                    onClick={() => handleAction(item.type)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors text-left"
                    data-testid={`action-sheet-${item.type}`}
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
    </>
  );
}
