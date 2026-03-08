import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContentBottomSheet,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDisplay(value: string): string {
  if (!value) return "0";
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (!Number.isFinite(num)) return "Error";
  const str = String(Math.floor(Math.abs(num)));
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

interface CalculatorSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export function CalculatorSheet({ open, onClose, onConfirm }: CalculatorSheetProps) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("0");
  const [lastOp, setLastOp] = useState(false);

  const evaluate = useCallback((expr: string): string => {
    try {
      const sanitized = expr
        .replace(/÷/g, "/")
        .replace(/×/g, "*")
        .replace(/[^0-9+\-*/.]/g, "");
      if (!sanitized) return "0";
      const tokens: (number | string)[] = [];
      let num = "";
      for (let i = 0; i < sanitized.length; i++) {
        const ch = sanitized[i];
        if ("0123456789.".includes(ch)) {
          num += ch;
        } else if ("+-*/".includes(ch)) {
          if (num) { tokens.push(parseFloat(num)); num = ""; }
          else if (ch === "-" && (tokens.length === 0 || typeof tokens[tokens.length - 1] === "string")) { num += ch; continue; }
          tokens.push(ch);
        }
      }
      if (num) tokens.push(parseFloat(num));
      const t2: (number | string)[] = [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] === "*" || tokens[i] === "/") {
          const left = t2.pop() as number;
          const right = tokens[++i] as number;
          t2.push(tokens[i - 1] === "*" ? left * right : right === 0 ? 0 : left / right);
        } else { t2.push(tokens[i]); }
      }
      let result = t2[0] as number;
      for (let i = 1; i < t2.length; i += 2) {
        const op = t2[i] as string;
        const right = t2[i + 1] as number;
        if (op === "+") result += right;
        else if (op === "-") result -= right;
      }
      if (!Number.isFinite(result)) return "0";
      return String(Math.round(result));
    } catch {
      return "0";
    }
  }, []);

  const handleNumber = useCallback((num: string) => {
    setExpression((prev) => {
      const next = prev + num;
      setResult(evaluate(next));
      setLastOp(false);
      return next;
    });
  }, [evaluate]);

  const handleOperator = useCallback((op: string) => {
    setExpression((prev) => {
      if (!prev && op !== "-") return prev;
      if (lastOp) {
        const next = prev.slice(0, -1) + op;
        return next;
      }
      setLastOp(true);
      return prev + op;
    });
  }, [lastOp]);

  const handleClear = useCallback(() => {
    setExpression("");
    setResult("0");
    setLastOp(false);
  }, []);

  const handleBackspace = useCallback(() => {
    setExpression((prev) => {
      const next = prev.slice(0, -1);
      setResult(next ? evaluate(next) : "0");
      setLastOp(false);
      return next;
    });
  }, [evaluate]);

  const handleEquals = useCallback(() => {
    const val = evaluate(expression);
    setExpression(val === "0" ? "" : val);
    setResult(val);
    setLastOp(false);
  }, [expression, evaluate]);

  const handleConfirm = useCallback(() => {
    const val = result === "0" && expression ? evaluate(expression) : result;
    const finalVal = val === "0" ? "" : val;
    onConfirm(finalVal);
    handleClear();
    onClose();
  }, [result, expression, evaluate, onConfirm, onClose, handleClear]);

  const handleClose = useCallback(() => {
    handleClear();
    onClose();
  }, [onClose, handleClear]);

  const btnBase = "flex items-center justify-center rounded-xl text-lg font-semibold transition-colors active:scale-95 select-none h-14";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContentBottomSheet className="max-w-md mx-auto">
        <DialogHeader className="px-6 pt-2 pb-0 flex flex-row items-center justify-between">
          <div>
            <DialogTitle className="text-lg font-semibold">Calculator</DialogTitle>
            <DialogDescription className="sr-only">Calculate an amount to use</DialogDescription>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full p-1.5 hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </DialogHeader>

        <div className="px-6 pt-3 pb-2">
          <div className="rounded-xl bg-muted/50 p-4 min-h-[72px] flex flex-col items-end justify-center">
            <p className="text-xs text-muted-foreground font-mono truncate w-full text-right min-h-[16px]">
              {expression || "\u00A0"}
            </p>
            <p className="text-3xl font-bold tracking-tight font-mono">
              = {formatDisplay(result)}
            </p>
          </div>
        </div>

        <div className="px-6 pb-2 grid grid-cols-4 gap-2">
          <button type="button" onClick={handleClear} className={cn(btnBase, "bg-red-500/10 text-red-500 hover:bg-red-500/20")}>C</button>
          <button type="button" onClick={handleBackspace} className={cn(btnBase, "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20")}><Delete className="w-5 h-5" /></button>
          <button type="button" onClick={() => handleOperator("÷")} className={cn(btnBase, "bg-primary/5 text-primary hover:bg-primary/10")}>÷</button>
          <button type="button" onClick={() => handleOperator("×")} className={cn(btnBase, "bg-primary/5 text-primary hover:bg-primary/10")}>×</button>

          <button type="button" onClick={() => handleNumber("7")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>7</button>
          <button type="button" onClick={() => handleNumber("8")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>8</button>
          <button type="button" onClick={() => handleNumber("9")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>9</button>
          <button type="button" onClick={() => handleOperator("-")} className={cn(btnBase, "bg-primary/5 text-primary hover:bg-primary/10")}>−</button>

          <button type="button" onClick={() => handleNumber("4")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>4</button>
          <button type="button" onClick={() => handleNumber("5")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>5</button>
          <button type="button" onClick={() => handleNumber("6")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>6</button>
          <button type="button" onClick={() => handleOperator("+")} className={cn(btnBase, "bg-primary/5 text-primary hover:bg-primary/10")}>+</button>

          <button type="button" onClick={() => handleNumber("1")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>1</button>
          <button type="button" onClick={() => handleNumber("2")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>2</button>
          <button type="button" onClick={() => handleNumber("3")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>3</button>
          <button type="button" onClick={handleEquals} className={cn(btnBase, "bg-primary/5 text-primary hover:bg-primary/10")}>=</button>

          <button type="button" onClick={() => handleNumber("0")} className={cn(btnBase, "bg-muted/60 text-foreground hover:bg-muted")}>0</button>
          <button
            type="button"
            onClick={handleConfirm}
            className={cn("col-span-3 flex items-center justify-center rounded-xl text-base font-semibold transition-colors active:scale-[0.98] select-none h-14 bg-primary text-primary-foreground hover:bg-primary/90")}
          >
            Rp {formatDisplay(result)}
          </button>
        </div>

        <div className="h-2" />
      </DialogContentBottomSheet>
    </Dialog>
  );
}
