import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Transaction } from "@shared/schema";

function formatCompact(amount: number): string {
  if (amount === 0) return "";
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + "JT";
  }
  if (amount >= 1_000) {
    const val = amount / 1_000;
    return (val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)) + "RB";
  }
  return String(Math.round(amount));
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekdayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

function groupTransactionsByDate(txs: Transaction[], year: number, month: number) {
  const map: Record<number, { income: number; spending: number }> = {};
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  for (const tx of txs) {
    if (!tx.date.startsWith(prefix)) continue;
    const day = parseInt(tx.date.slice(8, 10), 10);
    if (!map[day]) map[day] = { income: 0, spending: 0 };
    const amt = Number(tx.amount);
    if (tx.type === "income") map[day].income += amt;
    else if (tx.type === "expense") map[day].spending += amt;
  }
  return map;
}

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAY_HEADERS = ["SN", "SL", "RB", "KM", "JM", "SB", "MG"];

export function MonthlyActivityCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const { data: rawTransactions } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });
  const transactions = rawTransactions ?? [];

  const dayMap = useMemo(
    () => groupTransactionsByDate(transactions, year, month),
    [transactions, year, month]
  );

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekdayOfMonth(year, month);
  const hasAnyActivity = Object.keys(dayMap).length > 0;

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const totalWeeks = Math.ceil(cells.length / 7);
  const paddedCells = [
    ...cells,
    ...Array(totalWeeks * 7 - cells.length).fill(null),
  ];

  return (
    <Card data-testid="card-monthly-activity">
      <CardContent className="p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">Aktivitas Bulan Ini</h3>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-0.5">
            {MONTH_NAMES_ID[month].toUpperCase()} {year}
          </p>
        </div>

        {!hasAnyActivity && (
          <p className="text-xs text-muted-foreground mb-3">Belum ada aktivitas bulan ini.</p>
        )}

        <div className="grid grid-cols-7 gap-1">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}

          {paddedCells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} />;
            }

            const activity = dayMap[day];
            const hasActivity = !!activity && (activity.income > 0 || activity.spending > 0);
            const isToday = day === today;

            return (
              <div
                key={day}
                className={cn(
                  "rounded-lg flex flex-col items-center justify-start px-0.5 py-1.5 min-h-[52px] text-center transition-colors",
                  hasActivity
                    ? "bg-muted/60 border border-border"
                    : "bg-transparent",
                  isToday && "ring-1 ring-primary ring-offset-1 ring-offset-background"
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-semibold leading-none mb-1",
                    isToday ? "text-primary" : "text-foreground"
                  )}
                >
                  {day}
                </span>

                {hasActivity && (
                  <div className="flex flex-col items-center gap-0.5">
                    {activity.spending > 0 && (
                      <span className="text-[9px] font-medium text-red-500 dark:text-red-400 leading-none">
                        -{formatCompact(activity.spending)}
                      </span>
                    )}
                    {activity.income > 0 && (
                      <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 leading-none">
                        +{formatCompact(activity.income)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
