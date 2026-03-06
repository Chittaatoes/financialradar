import { useState } from "react";
import { Plus, X, ArrowDownLeft, ArrowUpRight, Ban } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

interface FabAction {
  label: string;
  icon: typeof Plus;
  color: string;
  action: () => void;
}

export function MobileFAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  const actions: FabAction[] = [
    {
      label: "Income",
      icon: ArrowDownLeft,
      color: "bg-emerald-500",
      action: () => {
        setOpen(false);
        setLocation("/transactions?action=add&type=income");
      },
    },
    {
      label: "Expense",
      icon: ArrowUpRight,
      color: "bg-red-400",
      action: () => {
        setOpen(false);
        setLocation("/transactions?action=add&type=expense");
      },
    },
    {
      label: "No Spend",
      icon: Ban,
      color: "bg-blue-400",
      action: () => {
        setOpen(false);
        setLocation("/?no_spend=1");
      },
    },
  ];

  return (
    <div className="fixed bottom-20 right-4 z-50 md:hidden">
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute bottom-16 right-0 z-50 space-y-2">
              {actions.map((act, i) => {
                const Icon = act.icon;
                return (
                  <motion.button
                    key={act.label}
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.8 }}
                    transition={{ delay: i * 0.06, duration: 0.2 }}
                    onClick={act.action}
                    className="flex items-center gap-2 whitespace-nowrap"
                    data-testid={`fab-action-${act.label.toLowerCase().replace(" ", "-")}`}
                  >
                    <span className="bg-background text-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-lg border">
                      {act.label}
                    </span>
                    <div className={`w-10 h-10 rounded-full ${act.color} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl relative z-50"
        whileTap={{ scale: 0.9 }}
        data-testid="button-fab"
      >
        <motion.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </motion.div>
      </motion.button>
    </div>
  );
}
