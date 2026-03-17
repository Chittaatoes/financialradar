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

interface Message { role: "user" | "assistant"; content: string }
interface ChatResponse { reply: string; configured: boolean }

const QUICK_PROMPTS = [
  { label: "Analisis pengeluaranku", prompt: "Tolong analisis pengeluaran saya dan berikan saran konkret untuk berhemat." },
  { label: "Cara nabung lebih cepat", prompt: "Berikan strategi konkret agar saya bisa menabung lebih banyak setiap bulan." },
  { label: "Apakah saya boros?", prompt: "Berdasarkan data keuangan saya, apakah saya boros? Apa yang harus diperbaiki?" },
  { label: "Tips investasi pemula", prompt: "Saya pemula dalam investasi. Apa yang harus saya mulai lakukan sekarang?" },
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
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-emerald-500/25" : "bg-white/10"}`}>
        {isUser ? <User className="w-3 h-3 text-emerald-400" /> : <Bot className="w-3 h-3 text-white/60" />}
      </div>
      <div className={`max-w-[82%] px-3 py-2 text-[13px] leading-relaxed rounded-2xl ${
        isUser ? "bg-emerald-600/35 text-white rounded-tr-sm" : "bg-white/[0.07] text-white/85 rounded-tl-sm"
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
      <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center shrink-0">
        <Bot className="w-3 h-3 text-white/60" />
      </div>
      <div className="bg-white/[0.07] rounded-2xl rounded-tl-sm px-3 py-2.5 flex items-center gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/35 animate-bounce"
            style={{ animationDelay: `${i*150}ms` }} />
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
  const { data: budget } = useQuery<{ monthlyIncome: number; totalSpent: number }>({ queryKey: ["/api/budget/summary"] });

  const send = useMutation({
    mutationFn: async (msg: string) => {
      const r = await apiRequest("POST", "/api/ai/chat", {
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
      return r as ChatResponse;
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

  const hasContext = dashboard && budget;

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)]">

      {/* Header + context summary */}
      <div className="px-4 pt-4 pb-3 shrink-0 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight">AI Advisor</h1>
            <p className="text-[11px] text-muted-foreground">Asisten keuangan pribadi</p>
          </div>
        </div>

        {/* Context card */}
        {hasContext ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total Aset", value: fmtRp(dashboard.totalAssets), color: "text-emerald-400" },
              { label: "Pemasukan", value: fmtRp(budget.monthlyIncome), color: "text-blue-400" },
              { label: "Pengeluaran", value: fmtRp(budget.totalSpent), color: "text-red-400" },
            ].map(c => (
              <div key={c.label} className="rounded-xl bg-white/[0.04] border border-white/8 px-3 py-2">
                <p className="text-[10px] text-white/40 mb-0.5">{c.label}</p>
                <p className={`text-[11px] font-semibold font-mono ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl bg-white/[0.04] border border-white/8 p-2 space-y-1">
                <Skeleton className="h-2.5 w-12 bg-white/8" />
                <Skeleton className="h-3.5 w-16 bg-white/8" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2.5 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-5 py-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              <Bot className="w-7 h-7 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/70">Halo! Ada yang bisa saya bantu?</p>
              <p className="text-xs text-white/35 mt-1">Tanyakan apa saja tentang keuanganmu</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
              {QUICK_PROMPTS.map(q => (
                <button key={q.label} onClick={() => handleSend(q.prompt)}
                  className="text-left rounded-xl bg-white/[0.05] hover:bg-white/[0.09] active:bg-white/[0.12] border border-white/8 px-3 py-2.5 text-[11px] text-white/65 transition-colors leading-snug">
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

      {/* Quick prompt chips (shown when chat active) */}
      {messages.length > 0 && (
        <div className="px-4 py-2 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {QUICK_PROMPTS.map(q => (
              <button key={q.label} onClick={() => handleSend(q.prompt)} disabled={send.isPending}
                className="shrink-0 text-[11px] text-white/55 bg-white/[0.05] hover:bg-white/[0.09] border border-white/8 rounded-full px-3 py-1 transition-colors disabled:opacity-40 whitespace-nowrap">
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-1.5 shrink-0">
        <div className="flex items-end gap-2 bg-white/[0.05] rounded-2xl border border-white/10 px-3 py-2">
          <Textarea
            className="flex-1 border-0 bg-transparent text-[13px] resize-none min-h-[34px] max-h-[100px] focus-visible:ring-0 focus-visible:ring-offset-0 p-0 leading-relaxed placeholder:text-white/20"
            placeholder="Tanya tentang keuanganmu..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            rows={1}
          />
          <Button size="icon"
            className="w-7 h-7 rounded-xl bg-emerald-600 hover:bg-emerald-500 shrink-0 transition-colors"
            onClick={() => handleSend()}
            disabled={!input.trim() || send.isPending}>
            <Send className="w-3 h-3" />
          </Button>
        </div>
      </div>

    </div>
  );
}
