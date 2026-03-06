import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContentBottomSheet, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContentBottomSheet,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, Wallet, Landmark, Smartphone, Pencil, Trash2,
  CheckCircle2, TrendingUp, Target, Lightbulb,
} from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Account } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLanguage } from "@/lib/i18n";

const accountFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["cash", "bank", "ewallet"]),
  balance: z.string().min(1, "Balance is required"),
});

const typeIcons = {
  cash: Wallet,
  bank: Landmark,
  ewallet: Smartphone,
};

const typeColors = {
  cash: "bg-chart-1/10 text-chart-1",
  bank: "bg-chart-2/10 text-chart-2",
  ewallet: "bg-chart-3/10 text-chart-3",
};

const FEATURES = [
  { icon: TrendingUp, label: "Track income & expenses automatically" },
  { icon: Target, label: "Set savings goals and monitor progress" },
  { icon: Lightbulb, label: "Unlock smart financial insights" },
];

function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const isEdit = !!account;

  const form = useForm({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: account?.name ?? "",
      type: (account?.type ?? "cash") as "cash" | "bank" | "ewallet",
      balance: account ? String(account.balance) : "0",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: z.infer<typeof accountFormSchema>) =>
      apiRequest(isEdit ? "PATCH" : "POST", isEdit ? `/api/accounts/${account!.id}` : "/api/accounts", {
        ...data,
        balance: data.balance,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: isEdit ? "Account updated" : "Account created" });
      onClose();
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.accounts.name}</FormLabel>
              <FormControl>
                <Input placeholder={t.accounts.namePlaceholder} {...field} data-testid="input-account-name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.accounts.type}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-account-type">
                    <SelectValue placeholder={t.accounts.selectType} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="cash">{t.accounts.typeCash}</SelectItem>
                  <SelectItem value="bank">{t.accounts.typeBank}</SelectItem>
                  <SelectItem value="ewallet">{t.accounts.typeEwallet}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="balance"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.accounts.balance}</FormLabel>
              <FormControl>
                <CurrencyInput placeholder="0" value={field.value} onChange={field.onChange} data-testid="input-account-balance" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>{t.accounts.cancel}</Button>
          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-account">
            {mutation.isPending ? "Saving..." : t.accounts.save}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function Accounts() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | undefined>();

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Account deleted" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const hasAccounts = !isLoading && accounts && accounts.length > 0;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-40" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Account create/edit dialog — always rendered so edit works */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditAccount(undefined); }}>
        <DialogContentBottomSheet>
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-2 pb-4 shrink-0 md:-mx-6 md:-mt-6">
            <DialogHeader className="text-center md:text-left space-y-1">
              <DialogTitle className="font-serif">
                {editAccount ? t.accounts.editAccount : t.accounts.newAccount}
              </DialogTitle>
              <DialogDescription>{t.accounts.dialogDesc}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="overflow-y-auto px-6 pt-4 pb-6 md:px-0 md:pt-2 md:pb-0">
            <AccountForm
              account={editAccount}
              onClose={() => { setDialogOpen(false); setEditAccount(undefined); }}
            />
          </div>
        </DialogContentBottomSheet>
      </Dialog>

      {hasAccounts ? (
        /* ── HAS ACCOUNTS: normal page layout ── */
        <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-serif font-bold" data-testid="text-accounts-title">{t.accounts.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t.accounts.subtitle}</p>
            </div>
            <Button
              onClick={() => { setEditAccount(undefined); setDialogOpen(true); }}
              data-testid="button-add-account"
            >
              <Plus className="w-4 h-4 mr-2" /> {t.accounts.addAccount}
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {accounts!.map((account) => {
              const Icon = typeIcons[account.type as keyof typeof typeIcons] || Wallet;
              const colorClass = typeColors[account.type as keyof typeof typeColors] || "bg-muted text-muted-foreground";
              return (
                <Card key={account.id} className="hover-elevate transition-all duration-200" data-testid={`card-account-${account.id}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{account.name}</p>
                          <Badge variant="secondary" className="text-[10px] mt-0.5">{account.type}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditAccount(account); setDialogOpen(true); }}
                          data-testid={`button-edit-account-${account.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-delete-account-${account.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContentBottomSheet>
                            <AlertDialogHeader className="text-center md:text-left mb-4">
                              <AlertDialogTitle>{t.accounts.deleteTitle}</AlertDialogTitle>
                              <AlertDialogDescription>{t.accounts.deleteDesc}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2 sm:space-x-0">
                              <AlertDialogAction
                                className="w-full"
                                onClick={() => deleteMutation.mutate(account.id)}
                              >
                                {t.accounts.delete}
                              </AlertDialogAction>
                              <AlertDialogCancel className="w-full mt-0 border-0 bg-muted/50 hover:bg-muted">
                                {t.accounts.cancel}
                              </AlertDialogCancel>
                            </AlertDialogFooter>
                          </AlertDialogContentBottomSheet>
                        </AlertDialog>
                      </div>
                    </div>
                    <p className="text-lg font-bold font-mono" data-testid={`text-balance-${account.id}`}>
                      {formatCurrency(account.balance)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* ── EMPTY STATE ── */
        <>
          {/* ── MOBILE: full-screen immersive layout ── */}
          <motion.div
            className="md:hidden flex flex-col min-h-[calc(100vh-4rem)]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            {/* Hero section */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 pt-10 pb-6 bg-gradient-to-b from-primary/8 via-primary/4 to-background text-center">
              {/* Icon with glow */}
              <div className="relative mb-6">
                <div
                  className="w-24 h-24 rounded-3xl bg-primary/15 flex items-center justify-center"
                  style={{ boxShadow: "0 0 48px color-mix(in srgb, hsl(var(--primary)) 20%, transparent)" }}
                >
                  <Wallet className="w-12 h-12 text-primary" />
                </div>
              </div>

              {/* Step badge */}
              <span className="inline-flex items-center bg-primary/10 text-primary text-[11px] font-semibold px-3 py-1 rounded-full mb-4">
                Step 1 of 4
              </span>

              {/* Headline */}
              <h1 className="text-2xl font-serif font-bold text-foreground mb-2 leading-tight">
                Start Your Financial Journey
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                Create your first account to start tracking money, hitting goals, and building real financial clarity.
              </p>

              {/* Feature rows */}
              <div className="mt-8 w-full max-w-xs space-y-3 text-left">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <span className="text-sm text-foreground/80">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA section — pinned to bottom */}
            <div className="px-6 pb-8 pt-4 bg-background space-y-3">
              <Button
                className="w-full h-14 rounded-2xl text-base font-semibold shadow-lg"
                onClick={() => { setEditAccount(undefined); setDialogOpen(true); }}
                data-testid="button-empty-create-account"
              >
                <Plus className="w-5 h-5 mr-2" /> Create My First Account
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Takes less than 30 seconds &nbsp;·&nbsp; Your data stays private
              </p>
            </div>
          </motion.div>

          {/* ── DESKTOP: enhanced centered card ── */}
          <motion.div
            className="hidden md:flex items-center justify-center min-h-[80vh] px-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <Card className="w-full max-w-md rounded-2xl shadow-xl border-0 overflow-hidden">
              {/* Hero area */}
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-8 pt-10 pb-7 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/15 mb-5 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
                  <Wallet className="w-10 h-10 text-primary" />
                </div>
                <span className="inline-flex items-center bg-primary/10 text-primary text-[11px] font-semibold px-3 py-1 rounded-full mb-4">
                  Step 1 of 4
                </span>
                <h2 className="text-xl font-serif font-bold text-foreground mb-2">
                  Start Your Financial Journey
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                  Create your first account to track income, expenses, and savings all in one place.
                </p>
              </div>

              {/* Feature list */}
              <CardContent className="px-8 pt-5 pb-2 bg-background space-y-3">
                {FEATURES.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm text-foreground/80">{label}</span>
                  </div>
                ))}
              </CardContent>

              {/* CTA */}
              <CardContent className="px-8 pb-8 pt-4 bg-background space-y-3">
                <Button
                  className="w-full h-12 rounded-2xl text-sm font-semibold shadow-md"
                  onClick={() => { setEditAccount(undefined); setDialogOpen(true); }}
                  data-testid="button-empty-create-account-desktop"
                >
                  <Plus className="w-4 h-4 mr-2" /> Create My First Account
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Takes less than 30 seconds &nbsp;·&nbsp; Your data stays private
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </>
  );
}
