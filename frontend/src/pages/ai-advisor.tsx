import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { UserProfile } from "@shared/schema";

interface DashboardData { totalAssets: number; netWorth: number }
interface BudgetSummary { monthlyIncome: number; totalSpent: number }
interface Message { role: "user" | "assistant"; content: string }
interface ChatResponse { reply: string; configured: boolean }

const QUICK_PROMPTS = [
  { label: "Analisis pengeluaranku", prompt: "Tolong analisis kondisi pengeluaran saya bulan ini dan berikan saran konkret." },
  { label: "Cara nabung lebih cepat", prompt: "Berikan strategi spesifik agar saya bisa menabung lebih banyak setiap bulan." },
  { label: "Apakah saya boros?", prompt: "Berdasarkan data keuangan saya, apakah saya boros? Apa yang harus diperbaiki?" },
  { label: "Tips investasi pemula", prompt: "Saya pemula dalam investasi. Dengan kondisi keuangan saya, apa yang harus saya lakukan?" },
];

function fmtRp(n: number) {
  if (!n) return "Rp 0";
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}Jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-primary/20" : "bg-muted"}`}>
        {isUser
          ? <User className="w-3 h-3 text-primary" />
          : <Bot className="w-3 h-3 text-muted-foreground" />}
      </div>
      <div className={`max-w-[82%] px-3 py-2 text-[13px] leading-relaxed rounded-2xl ${
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted text-foreground rounded-tl-sm"
      }`}>
        {msg.content.split("\n").map((l, i, arr) => (
          <span key={i}>{l}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Bot className="w-3 h-3 text-muted-foreground" />
      </div>
      <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    </div>
  );
}

export default function AiAdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { data: dashboard } = useQuery<DashboardData>({ queryKey: ["/api/dashboard"] });
  const { data: budget } = useQuery<BudgetSummary>({ queryKey: ["/api/budget/summary"] });

  const send = useMutation({
    mutationFn: async (msg: string) => {
      const res = await apiRequest("POST", "/api/ai/chat", {
        message: msg,
        history: messages.slice(-6),
        context: {
          totalAssets: dashboard?.totalAssets ?? 0,
          monthlyIncome: budget?.monthlyIncome ?? 0,
          monthlyExpense: budget?.totalSpent ?? 0,
          level: profile?.level ?? 1,
          streakCount: profile?.streakCount ?? 0,
        },
      });
      return res.json() as Promise<ChatResponse>;
    },
    onSuccess: (data) => setMessages(p => [...p, { role: "assistant", content: data.reply }]),
    onError: () => setMessages(p => [...p, { role: "assistant", content: "Maaf, terjadi kesalahan. Silakan coba lagi." }]),
  });

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || send.isPending) return;
    setMessages(p => [...p, { role: "user", content: msg }]);
    setInput("");
    send.mutate(msg);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, send.isPending]);

  const hasData = !!(dashboard && budget);
  const savingRate = hasData && budget!.monthlyIncome > 0
    ? Math.round(((budget!.monthlyIncome - budget!.totalSpent) / budget!.monthlyIncome) * 100)
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h1 className="text-[15px] font-semibold text-foreground leading-tight">AI Advisor</h1>
          <p className="text-[11px] text-muted-foreground">Asisten keuangan pribadi</p>
        </div>
      </div>

      {/* Context summary */}
      <div className="grid grid-cols-4 gap-2">
        {hasData ? (
          <>
            {[
              { label: "Total Aset", value: fmtRp(dashboard!.totalAssets), cls: "text-primary" },
              { label: "Pemasukan", value: fmtRp(budget!.monthlyIncome), cls: "text-blue-600 dark:text-blue-400" },
              { label: "Pengeluaran", value: fmtRp(budget!.totalSpent), cls: "text-red-600 dark:text-red-400" },
              { label: "Saving Rate", value: savingRate !== null ? `${savingRate}%` : "—",
                cls: savingRate !== null && savingRate >= 20 ? "text-emerald-600 dark:text-emerald-400" : "text-yellow-600 dark:text-yellow-400" },
            ].map(c => (
              <div key={c.label} className="rounded-xl bg-muted border border-border px-2.5 py-2">
                <p className="text-[9px] text-muted-foreground mb-0.5 leading-tight">{c.label}</p>
                <p className={`text-[10px] font-semibold font-mono leading-snug ${c.cls}`}>{c.value}</p>
              </div>
            ))}
          </>
        ) : (
          [1,2,3,4].map(i => (
            <div key={i} className="rounded-xl bg-muted border border-border p-2 space-y-1">
              <Skeleton className="h-2 w-10" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))
        )}
      </div>

      {/* Chat card */}
      <Card className="rounded-2xl border border-border shadow-sm">
        <CardContent className="p-4 space-y-3">

          {/* Messages */}
          <div className="space-y-2.5 min-h-[200px]">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[180px] gap-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-500/15 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Halo! Ada yang bisa saya bantu?</p>
                  <p className="text-xs text-muted-foreground mt-1">Tanyakan apa saja tentang keuanganmu</p>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full max-w-[300px]">
                  {QUICK_PROMPTS.map(q => (
                    <button key={q.label} onClick={() => handleSend(q.prompt)}
                      className="text-left rounded-xl bg-muted hover:bg-accent border border-border px-3 py-2.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors leading-snug">
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m, i) => <Bubble key={i} msg={m} />)}
                {send.isPending && <Typing />}
                <div ref={bottomRef} />
              </>
            )}
          </div>

          {/* Quick chips (once chat started) */}
          {messages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
              {QUICK_PROMPTS.map(q => (
                <button key={q.label} onClick={() => handleSend(q.prompt)} disabled={send.isPending}
                  className="shrink-0 text-[11px] text-muted-foreground bg-muted hover:bg-accent border border-border rounded-full px-3 py-1 transition-colors disabled:opacity-40 whitespace-nowrap">
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 bg-muted rounded-2xl border border-border px-3 py-2">
            <Textarea
              className="flex-1 border-0 bg-transparent text-[13px] resize-none min-h-[34px] max-h-[100px] focus-visible:ring-0 focus-visible:ring-offset-0 p-0 leading-relaxed placeholder:text-muted-foreground/50 text-foreground"
              placeholder="Tanya tentang keuanganmu..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              rows={1}
            />
            <Button size="icon"
              className="w-7 h-7 rounded-xl bg-primary hover:bg-primary/90 shrink-0"
              onClick={() => handleSend()}
              disabled={!input.trim() || send.isPending}>
              <Send className="w-3 h-3" />
            </Button>
          </div>

        </CardContent>
      </Card>

    </div>
  );
}
