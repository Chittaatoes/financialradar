import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera, Upload, Loader2, AlertCircle, CheckCircle2, X,
  Trash2, TrendingUp, TrendingDown, ChevronRight,
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
  const cameraRef = useRef<HTMLInputElement>(null);

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
      symbol: "XAUUSD", type: "buy", lot: 1,
      openPrice: 0, closePrice: 0, profit: 0,
    }]);
  }, []);

  const isValidTrades = trades.length > 0 && trades.every(
    t => t.symbol && t.lot > 0 && t.openPrice > 0 && t.closePrice > 0,
  );

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
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
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl border-t max-h-[92vh] flex flex-col"
          >
            {/* Handle + header */}
            <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mt-3 shrink-0" />
            <div className="px-5 pt-3 pb-3 flex items-start justify-between shrink-0 border-b">
              <div>
                <h3 className="text-base font-bold">Tambahkan Trading Hari Ini</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {stage === "upload" && "Upload screenshot hasil trading kamu"}
                  {stage === "scanning" && "Menganalisis trading..."}
                  {stage === "preview" && `${trades.length} trade terdeteksi — periksa & konfirmasi`}
                  {stage === "saving" && "Menyimpan data..."}
                  {stage === "done" && "Data berhasil disimpan!"}
                </p>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">

              {/* ── Upload stage ── */}
              {stage === "upload" && (
                <div className="p-5 space-y-4">
                  <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 flex flex-col items-center gap-3 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                      <Upload className="w-7 h-7 text-violet-500" />
                    </div>
                    <p className="text-sm font-medium">Upload screenshot MT4 / MT5</p>
                    <p className="text-xs text-muted-foreground">Sistem akan membaca data trading secara otomatis</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => cameraRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <Camera className="w-6 h-6 text-violet-500" />
                      <span className="text-xs font-medium">Ambil Screenshot</span>
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-background hover:bg-muted/50 transition-colors"
                    >
                      <Upload className="w-6 h-6 text-sky-500" />
                      <span className="text-xs font-medium">Pilih dari Galeri</span>
                    </button>
                  </div>

                  <div className="relative flex items-center gap-3">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground">atau</span>
                    <div className="flex-1 border-t" />
                  </div>

                  <button
                    onClick={() => { setStage("preview"); addManualTrade(); }}
                    className="w-full text-sm text-center text-muted-foreground hover:text-foreground transition-colors py-2"
                  >
                    Input manual &rarr;
                  </button>

                  {/* Hidden file inputs */}
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
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

              {/* ── Preview stage ── */}
              {(stage === "preview" || stage === "saving") && (
                <div className="p-5 space-y-4 pb-36">
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
                    className="w-full py-3 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
                  >
                    + Tambah trade manual
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
                    <Button className="flex-1" onClick={handleClose}>
                      Selesai
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer CTA (preview stage) ── */}
            {(stage === "preview" || stage === "saving") && (
              <div className="shrink-0 border-t px-5 py-4 bg-background space-y-2">
                <Button
                  className="w-full"
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
                    <>Simpan {trades.length} Trade <ChevronRight className="w-4 h-4 ml-1" /></>
                  )}
                </Button>
                <button
                  onClick={() => { setStage("upload"); setTrades([]); setParseError(null); }}
                  className="w-full text-xs text-center text-muted-foreground py-1"
                >
                  ← Upload ulang
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Trade Edit Card ──────────────────────────────────────────────────────────
function TradeEditCard({
  trade, index, onChange, onDelete,
}: {
  trade: ParsedTrade;
  index: number;
  onChange: (i: number, field: keyof ParsedTrade, val: string) => void;
  onDelete: (i: number) => void;
}) {
  const isBuy = trade.type === "buy";
  const isProfit = trade.profit >= 0;

  return (
    <div className={cn(
      "rounded-2xl border p-4 space-y-3",
      isBuy ? "border-emerald-200 dark:border-emerald-800" : "border-red-200 dark:border-red-800",
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            isBuy ? "bg-emerald-500/15" : "bg-red-500/15",
          )}>
            {isBuy
              ? <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              : <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
            }
          </div>
          <div>
            <Input
              value={trade.symbol}
              onChange={e => onChange(index, "symbol", e.target.value.toUpperCase())}
              className="h-7 text-sm font-bold w-28 px-2 uppercase"
              placeholder="XAUUSD"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(index, "type", isBuy ? "sell" : "buy")}
            className={cn(
              "text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors",
              isBuy
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/15 text-red-600 dark:text-red-400",
            )}
          >
            {isBuy ? "BUY" : "SELL"}
          </button>
          <button onClick={() => onDelete(index)} className="text-muted-foreground hover:text-red-500 transition-colors p-1">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fields grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Lot", field: "lot" as keyof ParsedTrade },
          { label: "Open", field: "openPrice" as keyof ParsedTrade },
          { label: "Close", field: "closePrice" as keyof ParsedTrade },
          { label: "Profit/Loss", field: "profit" as keyof ParsedTrade },
        ].map(({ label, field }) => (
          <div key={field} className={cn(
            "rounded-xl p-2.5",
            field === "profit"
              ? isProfit ? "bg-emerald-500/10 border border-emerald-200 dark:border-emerald-800" : "bg-red-500/10 border border-red-200 dark:border-red-800"
              : "bg-muted/40",
          )}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <Input
              type="number"
              value={String(trade[field])}
              onChange={e => onChange(index, field, e.target.value)}
              className={cn(
                "h-7 text-sm font-semibold px-1.5 border-0 bg-transparent p-0 focus-visible:ring-0",
                field === "profit" && (isProfit
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400"),
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
