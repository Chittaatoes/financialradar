import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Send, Bot, User, Sparkles, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { UserProfile, DashboardData } from "@shared/schema";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
  configured: boolean;
}

const QUICK_PROMPTS = [
  { label: "Analisis pengeluaranku", prompt: "Tolong analisis pengeluaran saya dan berikan saran untuk berhemat." },
  { label: "Cara menabung lebih cepat?", prompt: "Berikan strategi konkret agar saya bisa menabung lebih banyak setiap bulan." },
  { label: "Apakah saya boros?", prompt: "Berdasarkan data keuangan saya, apakah saya boros? Di mana harus diperbaiki?" },
  { label: "Tips investasi pemula", prompt: "Saya pemula dalam investasi. Apa yang harus saya mulai lakukan sekarang?" },
];

function formatIDR(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? "bg-emerald-500/30" : "bg-white/10"
      }`}>
        {isUser ? <User className="w-3.5 h-3.5 text-emerald-400" /> : <Bot className="w-3.5 h-3.5 text-white/70" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? "bg-emerald-600/40 text-white rounded-tr-sm"
          : "bg-white/8 text-white/85 rounded-tl-sm"
      }`}>
        {message.content.split("\n").map((line, i) => (
          <span key={i}>
            {line}
            {i < message.content.split("\n").length - 1 && <br />}
          </span>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0">
        <Bot className="w-3.5 h-3.5 text-white/70" />
      </div>
      <div className="bg-white/8 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function AiAdvisorPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/profile"] });
  const { data: dashboard } = useQuery<DashboardData>({ queryKey: ["/api/dashboard"] });
  const { data: budgetData } = useQuery<{ monthlyIncome: number; totalSpent: number }>({
    queryKey: ["/api/budget/summary"],
  });

  const sendMutation = useMutation({
    mutationFn: async (userMessage: string) => {
      const res = await apiRequest("POST", "/api/ai/chat", {
        message: userMessage,
        history: messages.slice(-6),
        context: {
          totalAssets: dashboard?.totalAssets ?? 0,
          monthlyIncome: budgetData?.monthlyIncome ?? profile?.monthlyIncome ?? 0,
          monthlyExpense: budgetData?.totalSpent ?? 0,
          level: profile?.level ?? 1,
          streakCount: profile?.streakCount ?? 0,
        },
      });
      return res as ChatResponse;
    },
    onSuccess: (data) => {
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: () => {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
      }]);
    },
  });

  const sendMessage = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || sendMutation.isPending) return;
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    sendMutation.mutate(msg);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sendMutation.isPending]);

  const contextSummary = dashboard && budgetData ? [
    `Aset total: ${formatIDR(dashboard.totalAssets)}`,
    `Pemasukan bulan ini: ${formatIDR(budgetData.monthlyIncome)}`,
    `Pengeluaran bulan ini: ${formatIDR(budgetData.totalSpent)}`,
  ].join(" · ") : null;

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-4rem)]">
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">AI Advisor</h1>
            <p className="text-[11px] text-muted-foreground">Asisten keuangan pribadi</p>
          </div>
        </div>
        {contextSummary && (
          <div className="mt-2 text-[10px] text-white/30 bg-white/5 rounded-lg px-3 py-1.5 line-clamp-1">
            📊 {contextSummary}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-6 py-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Bot className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/70">Halo! Saya AI Advisor kamu.</p>
              <p className="text-xs text-white/40 mt-1">Tanyakan apa saja tentang keuanganmu.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q.label}
                  onClick={() => sendMessage(q.prompt)}
                  className="text-left rounded-xl bg-white/6 hover:bg-white/10 border border-white/8 px-3 py-2.5 text-[11px] text-white/70 transition-colors"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}

        {sendMutation.isPending && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {messages.length > 0 && (
        <div className="px-4 py-2 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {QUICK_PROMPTS.map(q => (
              <button
                key={q.label}
                onClick={() => sendMessage(q.prompt)}
                disabled={sendMutation.isPending}
                className="shrink-0 text-[11px] text-white/60 bg-white/6 hover:bg-white/10 border border-white/8 rounded-full px-3 py-1 transition-colors disabled:opacity-40"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 pb-4 shrink-0 pt-2">
        <div className="flex items-end gap-2 bg-white/6 rounded-2xl border border-white/10 px-3 py-2">
          <Textarea
            ref={textareaRef}
            className="flex-1 border-0 bg-transparent text-sm resize-none min-h-[36px] max-h-[120px] focus-visible:ring-0 focus-visible:ring-offset-0 p-0 leading-relaxed placeholder:text-white/25"
            placeholder="Tanya tentang keuanganmu..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            rows={1}
          />
          <Button
            size="icon"
            className="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 shrink-0"
            onClick={() => sendMessage()}
            disabled={!input.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
