import { useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Upload, Loader2, AlertCircle, CheckCircle2, X, ArrowLeft, Calculator } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORY_GROUPS } from "@/lib/constants";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Account, CustomCategory } from "@shared/schema";
import { parseTotal, parseMerchant, parseDate, suggestCategory, detectTransfer, parseRecipient, detectBankName } from "@/lib/receipt-parser";
import { runOCR } from "@/lib/receipt-ocr";
import { format } from "date-fns";
import { CalculatorSheet } from "@/components/calculator-sheet";

interface ScanPanelProps {
  onBack: () => void;
  onSave: () => void;
}

type Stage = "upload" | "scanning" | "preview";

export function ScanPanel({ onBack, onSave }: ScanPanelProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [total, setTotal] = useState("");
  const [category, setCategory] = useState("Shopping");
  const [accountId, setAccountId] = useState<string>("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [calcOpen, setCalcOpen] = useState(false);
  const [txType, setTxType] = useState<"expense" | "transfer">("expense");

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: customCategories = [] } = useQuery<CustomCategory[]>({ queryKey: ["/api/custom-categories"] });
  const customExpenseCats = customCategories.filter(c => c.type === "needs" || c.type === "wants" || c.type === "expense");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/transactions", {
        type: "expense",
        amount: total,
        date,
        fromAccountId: accountId ? Number(accountId) : undefined,
        category: txType === "transfer" ? "Transfer" : category,
        note: merchant || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-score"] });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/budget") });
      toast({ title: "Transaksi berhasil disimpan!" });
      onSave();
    },
    onError: (err: Error) => {
      toast({ title: "Gagal menyimpan", description: err.message, variant: "destructive" });
    },
  });

  const handleReset = useCallback(() => {
    setStage("upload");
    setImageUrl(null);
    setMerchant("");
    setDate(format(new Date(), "yyyy-MM-dd"));
    setTotal("");
    setCategory("Shopping");
    setScanError(null);
    setTxType("expense");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setStage("scanning");
    setScanError(null);

    try {
      const text = await runOCR(file);
      const isTransfer = detectTransfer(text);

      if (isTransfer) {
        setTxType("transfer");
        const d = parseDate(text);
        const t = parseTotal(text);
        const bankName = detectBankName(text) ?? "";
        const recipient = parseRecipient(text);
        const merchantName = recipient || (bankName ? bankName + " Transfer" : "Transfer");

        setMerchant(merchantName);
        setDate(d);
        setTotal(t);
        setCategory("Transfer");

        // Auto-match account by bank name
        if (bankName && accounts.length > 0) {
          const matched = accounts.find(a =>
            a.name.toLowerCase().includes(bankName.toLowerCase()) ||
            bankName.toLowerCase().includes(a.name.toLowerCase())
          );
          if (matched) setAccountId(String(matched.id));
        }

        setStage("preview");
        if (!t) setScanError("Jumlah tidak ditemukan. Silakan isi manual.");
      } else {
        setTxType("expense");
        const m = parseMerchant(text);
        const d = parseDate(text);
        const t = parseTotal(text);
        const cat = suggestCategory(m, text);

        setMerchant(m);
        setDate(d);
        setTotal(t);
        setCategory(cat);
        setStage("preview");

        if (!t) setScanError("Total tidak ditemukan. Silakan isi manual.");
      }
    } catch {
      setScanError("Gagal memproses gambar. Coba foto yang lebih jelas.");
      setStage("upload");
    }
  }, [accounts]);

  const galleryRef = useRef<HTMLInputElement>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }, [handleFile]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Scan header bar */}
      <div className="shrink-0 flex items-center gap-2 px-6 pb-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <div className="flex-1" />
        <Camera className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold">Scan Struk</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-6 pb-6 space-y-4">
        {stage === "upload" && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                "w-full border-2 border-dashed border-border rounded-2xl p-8",
                "flex flex-col items-center gap-3 transition-colors",
                "hover:border-violet-400/50 hover:bg-violet-500/5 group"
              )}
            >
              <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/15 transition-colors">
                <Camera className="w-7 h-7 text-violet-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Ambil Foto Struk</p>
                <p className="text-xs text-muted-foreground mt-0.5">Kamera akan terbuka secara otomatis</p>
              </div>
            </button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">atau</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => galleryRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Pilih dari Galeri
            </Button>
          </>
        )}

        {stage === "scanning" && (
          <div className="space-y-4">
            {imageUrl && (
              <div className="rounded-xl overflow-hidden max-h-40 flex items-center justify-center bg-muted">
                <img src={imageUrl} alt="Receipt" className="max-h-40 object-contain" />
              </div>
            )}
            <div className="flex flex-col items-center gap-3 py-6">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm text-muted-foreground">Memindai struk...</p>
              <div className="space-y-2 w-full">
                <Skeleton className="h-4 w-3/4 mx-auto" />
                <Skeleton className="h-4 w-1/2 mx-auto" />
              </div>
            </div>
          </div>
        )}

        {stage === "preview" && (
          <div className="space-y-4">
            {imageUrl && (
              <div className="rounded-xl overflow-hidden max-h-28 flex items-center justify-center bg-muted relative">
                <img src={imageUrl} alt="Receipt" className="max-h-28 object-contain" />
                <button
                  type="button"
                  onClick={handleReset}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {scanError ? (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600 dark:text-amber-400">{scanError}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {txType === "transfer"
                    ? "Transaksi transfer terdeteksi. Periksa data sebelum menyimpan."
                    : "Struk berhasil dipindai. Periksa data sebelum menyimpan."}
                </p>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {txType === "transfer" ? "Transfer ke" : "Merchant / Toko"}
              </label>
              <Input value={merchant} onChange={e => setMerchant(e.target.value)} placeholder={txType === "transfer" ? "Nama penerima" : "Nama merchant"} className="mt-1.5" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {txType === "transfer" ? "Jumlah" : "Total"}
              </label>
              <div className="flex gap-2 items-center mt-1.5">
                <CurrencyInput value={total} onChange={setTotal} placeholder="0" className="flex-1" />
                <button
                  type="button"
                  onClick={() => setCalcOpen(true)}
                  className="shrink-0 flex items-center justify-center w-10 h-10 rounded-md border border-input bg-background hover:bg-muted transition-colors"
                >
                  <Calculator className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <CalculatorSheet open={calcOpen} onClose={() => setCalcOpen(false)} onConfirm={(val) => setTotal(val)} />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tanggal</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1.5 appearance-none [&::-webkit-date-and-time-value]:text-left" />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kategori</label>
              {txType === "transfer" ? (
                <Input value="Transfer" readOnly className="mt-1.5 bg-muted text-muted-foreground cursor-default" />
              ) : (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {EXPENSE_CATEGORY_GROUPS.map(group => (
                      <SelectGroup key={group.groupKey}>
                        <SelectLabel className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {group.groupKey === "needs" ? "Kebutuhan" : "Keinginan"}
                        </SelectLabel>
                        {group.items.map(item => (
                          <SelectItem key={item.value} value={item.value}>
                            <span className="mr-1.5">{item.emoji}</span>{item.value}
                          </SelectItem>
                        ))}
                        {customExpenseCats.filter(c => c.type === group.groupKey).map(c => (
                          <SelectItem key={`custom-${c.id}`} value={c.name}>
                            <span className="mr-1.5">{c.emoji ?? "📌"}</span>{c.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {accounts.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dari Rekening</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Pilih rekening (opsional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Scan Ulang
              </Button>
              <Button
                className="flex-1"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !total || parseFloat(total) <= 0}
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simpan Transaksi"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
