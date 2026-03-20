import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload, Loader2, AlertCircle, CheckCircle2, X,
  Trash2, TrendingUp, TrendingDown, ChevronRight, ImageUp,
  ArrowLeftRight,
} from "lucide-react";
import { runOCR } from "@/lib/receipt-ocr";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ParsedTrade {
  symbol: string;
  type: "buy" | "sell";
  lot: number;
  openPrice: number;
  closePrice: number;
  profit: number;
}

interface ParseResponse {
  success: boolean;
  trades: ParsedTrade[];
  message?: string;
  debug?: { rawText: string; cleanText: string };
}

type Stage = "upload" | "scanning" | "preview" | "saving" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ForexUploadSheet({ open, onClose }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [stage, setStage] = useState<Stage>("upload");
  const [trades, setTrades] = useState<ParsedTrade[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ rawText: string; cleanText: string } | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [saveResult, setSaveResult] = useState<{ inserted: number; duplicates: number } | null>(null);

  const reset = useCallback(() => {
    setStage("upload");
    setTrades([]);
    setParseError(null);
    setDebugInfo(null);
    setShowDebug(false);
    setSaveResult(null);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const parseMutation = useMutation({
    mutationFn: (text: string) =>
      apiRequest("POST", "/api/forex/parse", { text }).then(r => r.json()) as Promise<ParseResponse>,
    onSuccess: (data) => {
      if (data.debug) setDebugInfo(data.debug);
      if (!data.success || data.trades.length === 0) {
        setParseError(data.message ?? "Tidak ada data trading yang terdeteksi. Coba input manual di bawah.");
        setStage("preview");
      } else {
        setTrades(data.trades);
        setParseError(null);
        setStage("preview");
      }
    },
    onError: () => {
      setParseError("Gagal menganalisis gambar. Coba input manual di bawah.");
      setStage("preview");
    },
  });

  const saveMutation = useMutation({
    mutationFn: (trades: ParsedTrade[]) =>
      apiRequest("POST", "/api/forex/save", { trades }).then(r => r.json()) as Promise<{ inserted: number; duplicates: number }>,
    onSuccess: (data) => {
      setSaveResult(data);
      setStage("done");
    },
    onError: () => {
      toast({ title: "Gagal menyimpan", description: "Coba lagi.", variant: "destructive" });
      setStage("preview");
    },
  });

  const processFile = useCallback(async (file: File) => {
    setStage("scanning");
    setParseError(null);
    try {
      const text = await runOCR(file);
      parseMutation.mutate(text);
    } catch {
      setParseError("Gagal membaca gambar. Coba input manual di bawah.");
      setStage("preview");
    }
  }, [parseMutation]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }, [processFile]);

  const updateTrade = useCallback((index: number, field: keyof ParsedTrade, value: string) => {
    setTrades(prev => prev.map((t, i) => {
      if (i !== index) return t;
      if (field === "type") return { ...t, type: value as "buy" | "sell" };
      const num = parseFloat(value);
      return { ...t, [field]: isNaN(num) ? t[field] : num };
    }));
  }, []);

  const deleteTrade = useCallback((index: number) => {
    setTrades(prev => prev.filter((_, i) => i !== index));
  }, []);

  const addManualTrade = useCallback(() => {
    setTrades(prev => [...prev, {
      symbol: "XAUUSD", type: "buy", lot: 0.01,
      openPrice: 0, closePrice: 0, profit: 0,
    }]);
  }, []);

  const isValidTrades = trades.length > 0 && trades.every(
    t => t.symbol && t.lot > 0 && t.openPrice > 0 && t.closePrice > 0,
  );

  if (!mounted) return null;

  return createPortal(
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-md z-[60]"
            onClick={handleClose}
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
            className="fixed bottom-0 left-0 right-0 z-[70] bg-background rounded-t-2xl shadow-2xl border-t flex flex-col"
            style={{ maxHeight: "calc(92dvh - env(safe-area-inset-bottom, 0px))" }}
          >
            {/* Handle bar */}
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mt-3 shrink-0" />

            {/* Header */}
            <div className="px-5 pt-3 pb-3 flex items-start justify-between shrink-0 border-b">
              <div>
                <h3 className="text-base font-bold">Tambahkan Trading Hari Ini</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stage === "upload"   && "Upload screenshot hasil trading kamu"}
                  {stage === "scanning" && "Menganalisis trading..."}
                  {stage === "preview"  && (trades.length > 0 ? `${trades.length} trade — periksa & konfirmasi` : "Input data trading manual")}
                  {stage === "saving"   && "Menyimpan data..."}
                  {stage === "done"     && "Data berhasil disimpan!"}
                </p>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* ── Upload stage ── */}
              {stage === "upload" && (
                <div className="p-5 space-y-3">
                  {/* Gallery tap area — compact for mobile */}
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-violet-400 active:scale-[0.99] transition-all p-6 flex flex-col items-center gap-3 text-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                      <ImageUp className="w-6 h-6 text-violet-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Pilih dari Galeri</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Pilih screenshot MT4 / MT5</p>
                    </div>
                  </button>

                  {/* Manual input — styled as a proper button, always visible */}
                  <div className="relative flex items-center gap-3 py-1">
                    <div className="flex-1 border-t border-border/60" />
                    <span className="text-[11px] text-muted-foreground font-medium">atau</span>
                    <div className="flex-1 border-t border-border/60" />
                  </div>

                  <button
                    onClick={() => { setStage("preview"); addManualTrade(); }}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 active:scale-[0.98] transition-all text-sm font-medium text-foreground"
                  >
                    <Upload className="w-4 h-4 text-muted-foreground" />
                    Input manual
                    <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                  </button>

                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>
              )}

              {/* ── Scanning stage ── */}
              {stage === "scanning" && (
                <div className="p-8 flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Menganalisis trading...</p>
                    <p className="text-xs text-muted-foreground mt-1">OCR sedang membaca data dari screenshot kamu</p>
                  </div>
                </div>
              )}

              {/* ── Preview / Manual input stage ── */}
              {(stage === "preview" || stage === "saving") && (
                <div className="p-4 space-y-3 pb-4">
                  {parseError && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{parseError}</p>
                      </div>
                      {debugInfo && (
                        <div className="mt-1">
                          <button
                            className="text-[10px] text-muted-foreground underline"
                            onClick={() => setShowDebug(v => !v)}
                          >
                            {showDebug ? "Sembunyikan" : "Lihat"} teks OCR hasil baca
                          </button>
                          {showDebug && (
                            <div className="mt-2 space-y-1.5">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Teks asli:</p>
                              <pre className="text-[10px] bg-muted rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                {debugInfo.rawText || "(kosong)"}
                              </pre>
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Setelah normalisasi:</p>
                              <pre className="text-[10px] bg-muted rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                                {debugInfo.cleanText || "(kosong)"}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {trades.map((trade, i) => (
                    <TradeEditCard
                      key={`${trade.symbol}-${trade.type}-${trade.openPrice}-${trade.closePrice}-${i}`}
                      trade={trade}
                      index={i}
                      onChange={updateTrade}
                      onDelete={deleteTrade}
                    />
                  ))}

                  <button
                    onClick={addManualTrade}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40 hover:border-foreground/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                  >
                    + Tambah trade lain
                  </button>
                </div>
              )}

              {/* ── Done stage ── */}
              {stage === "done" && saveResult && (
                <div className="p-8 flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-base font-bold">Data Tersimpan!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{saveResult.inserted} trade</span> berhasil disimpan
                      {saveResult.duplicates > 0 && (
                        <>, <span className="text-amber-500 font-semibold">{saveResult.duplicates}</span> dilewati (duplikat)</>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-3 w-full mt-2">
                    <Button variant="outline" className="flex-1" onClick={() => { reset(); }}>
                      Upload Lagi
                    </Button>
                    <Button className="flex-1 bg-[#19432c] hover:bg-emerald-800 text-white" onClick={handleClose}>
                      Selesai
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Sticky footer (preview/saving) — above mobile nav ── */}
            {(stage === "preview" || stage === "saving") && (
              <div
                className="shrink-0 border-t px-4 pt-3 pb-3 bg-background space-y-2"
                style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
              >
                <Button
                  className="w-full bg-[#19432c] hover:bg-emerald-800 text-white font-semibold"
                  disabled={!isValidTrades || stage === "saving"}
                  onClick={() => {
                    if (!isValidTrades) return;
                    setStage("saving");
                    saveMutation.mutate(trades);
                  }}
                >
                  {stage === "saving" ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Menyimpan...</>
                  ) : (
                    <>Simpan {trades.length} Trade <ChevronRight className="w-4 h-4 ml-1.5" /></>
                  )}
                </Button>
                <button
                  onClick={() => { setStage("upload"); setTrades([]); setParseError(null); }}
                  className="w-full text-xs text-center text-muted-foreground py-1 hover:text-foreground transition-colors"
                >
                  ← Upload ulang
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
}

// ─── Trade Edit Card — Fintech Style ─────────────────────────────────────────
function TradeEditCard({
  trade, index, onChange, onDelete,
}: {
  trade: ParsedTrade;
  index: number;
  onChange: (i: number, field: keyof ParsedTrade, val: string) => void;
  onDelete: (i: number) => void;
}) {
  const isBuy    = trade.type === "buy";
  const isProfit = trade.profit >= 0;

  return (
    <div className={cn(
      "rounded-2xl overflow-hidden border shadow-sm",
      isBuy
        ? "border-emerald-200 dark:border-emerald-800/60"
        : "border-red-200 dark:border-red-800/60",
    )}>
      {/* ── Colored header band ── */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        isBuy
          ? "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5"
          : "bg-gradient-to-r from-red-500/10 to-red-500/5",
      )}>
        {/* Left: icon + symbol */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
            isBuy ? "bg-emerald-500/20" : "bg-red-500/20",
          )}>
            {isBuy
              ? <TrendingUp  className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              : <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
            }
          </div>
          <div>
            <Input
              value={trade.symbol}
              onChange={e => onChange(index, "symbol", e.target.value.toUpperCase())}
              className={cn(
                "h-7 w-28 px-0 text-sm font-bold uppercase border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0",
                isBuy ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400",
              )}
              placeholder="XAUUSD"
            />
            <p className="text-[10px] text-muted-foreground -mt-0.5">Pasangan aset</p>
          </div>
        </div>

        {/* Right: BUY/SELL toggle + delete */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(index, "type", isBuy ? "sell" : "buy")}
            className={cn(
              "flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-full border transition-colors",
              isBuy
                ? "bg-emerald-500 text-white border-emerald-500"
                : "bg-red-500 text-white border-red-500",
            )}
          >
            <ArrowLeftRight className="w-2.5 h-2.5" />
            {isBuy ? "BUY" : "SELL"}
          </button>
          <button
            onClick={() => onDelete(index)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Fields ── */}
      <div className="p-3 grid grid-cols-2 gap-2 bg-background">
        {/* Lot */}
        <FieldBox
          label="Lot"
          sublabel="Ukuran posisi"
          value={String(trade.lot)}
          onChange={v => onChange(index, "lot", v)}
        />
        {/* Open price */}
        <FieldBox
          label="Open"
          sublabel="Harga buka"
          value={String(trade.openPrice)}
          onChange={v => onChange(index, "openPrice", v)}
        />
        {/* Close price */}
        <FieldBox
          label="Close"
          sublabel="Harga tutup"
          value={String(trade.closePrice)}
          onChange={v => onChange(index, "closePrice", v)}
        />
        {/* Profit/Loss — spans full width + colored */}
        <div className={cn(
          "rounded-xl border p-3",
          isProfit
            ? "bg-emerald-500/8 border-emerald-200 dark:border-emerald-800/60"
            : "bg-red-500/8 border-red-200 dark:border-red-800/60",
        )}>
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">P / L</p>
          <p className="text-[9px] text-muted-foreground/70 mb-1.5">Profit / Loss</p>
          <Input
            type="number"
            value={String(trade.profit)}
            onChange={e => onChange(index, "profit", e.target.value)}
            className={cn(
              "h-7 text-sm font-bold font-mono px-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0",
              isProfit
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-500 dark:text-red-400",
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Reusable field box ───────────────────────────────────────────────────────
function FieldBox({
  label, sublabel, value, onChange,
}: {
  label: string;
  sublabel: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl bg-muted/50 border border-border/60 p-3">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/70 mb-1.5">{sublabel}</p>
      <Input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 text-sm font-semibold font-mono px-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
      />
    </div>
  );
}
