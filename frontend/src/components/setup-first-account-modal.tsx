import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContentBottomSheet, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wallet, Landmark, Smartphone, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const setupAccountSchema = z.object({
  name: z.string().min(1, "Account name is required"),
  type: z.enum(["cash", "bank", "ewallet"]),
  balance: z.string().min(1, "Starting balance is required"),
});

type SetupAccountValues = z.infer<typeof setupAccountSchema>;

interface SetupFirstAccountModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const typeOptions = [
  { value: "cash", label: "Cash", icon: Wallet },
  { value: "bank", label: "Bank", icon: Landmark },
  { value: "ewallet", label: "E-Wallet", icon: Smartphone },
];

export function SetupFirstAccountModal({ open, onClose, onSuccess }: SetupFirstAccountModalProps) {
  const { toast } = useToast();

  const form = useForm<SetupAccountValues>({
    resolver: zodResolver(setupAccountSchema),
    defaultValues: { name: "", type: "cash", balance: "0" },
  });

  const mutation = useMutation({
    mutationFn: (data: SetupAccountValues) =>
      apiRequest("POST", "/api/accounts", {
        name: data.name,
        type: data.type,
        balance: data.balance,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Account created! +20 XP",
        description: "Now let's record your first transaction.",
      });
      form.reset();
      onClose();
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { form.reset(); onClose(); } }}>
      <DialogContentBottomSheet className="overflow-auto">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-2 pb-4 md:-mx-6 md:-mt-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/15 mx-auto mb-3">
            <Wallet className="w-6 h-6 text-primary" />
          </div>
          <DialogHeader className="text-center space-y-1">
            <DialogTitle className="text-lg font-serif font-bold">
              Let's Set Up Your First Account
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              An account is needed to record transactions. It only takes a few seconds.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. My Main Bank, Cash Wallet"
                        {...field}
                        data-testid="input-setup-account-name"
                        className="rounded-xl"
                      />
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
                    <FormLabel>Account Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-setup-account-type" className="rounded-xl">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="rounded-xl">
                        {typeOptions.map((opt) => {
                          const Icon = opt.icon;
                          return (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="w-4 h-4 text-muted-foreground" />
                                {opt.label}
                              </div>
                            </SelectItem>
                          );
                        })}
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
                    <FormLabel>Starting Balance</FormLabel>
                    <FormControl>
                      <CurrencyInput
                        placeholder="0"
                        value={field.value}
                        onChange={field.onChange}
                        data-testid="input-setup-account-balance"
                        className="rounded-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-1.5 text-xs text-primary/70 bg-primary/5 rounded-xl px-3 py-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>You'll earn <strong>+20 XP</strong> for setting up your first account!</span>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { form.reset(); onClose(); }}
                  className="flex-1 rounded-2xl h-11"
                  data-testid="button-setup-account-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 rounded-2xl h-11"
                  data-testid="button-setup-account-submit"
                >
                  {mutation.isPending ? "Creating..." : "Create & Continue"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContentBottomSheet>
    </Dialog>
  );
}
