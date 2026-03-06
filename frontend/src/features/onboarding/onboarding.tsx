import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wallet, Brain, Target, ArrowRight, Check, User, TrendingUp } from "lucide-react";
import logoImg from "@assets/favicon_1771971850849.png";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

const PRIMARY_GOALS = [
  { id: "save_consistently", label: "Save Consistently", labelId: "Menabung Rutin", icon: Wallet },
  { id: "control_spending", label: "Control Spending", labelId: "Kontrol Pengeluaran", icon: Target },
  { id: "reduce_stress", label: "Reduce Financial Stress", labelId: "Kurangi Stres Keuangan", icon: Brain },
  { id: "grow_wealth", label: "Grow Wealth", labelId: "Kembangkan Kekayaan", icon: TrendingUp },
];

const HABIT_TYPES = [
  { id: "disciplined", label: "Disciplined", labelId: "Disiplin" },
  { id: "need_reminder", label: "Need Reminders", labelId: "Butuh Pengingat" },
  { id: "start_strong", label: "Start Strong, Fade Later", labelId: "Awal Semangat, Lama Kendor" },
  { id: "never_consistent", label: "Never Consistent", labelId: "Tidak Pernah Konsisten" },
];

const FOCUS_AREAS = [
  { id: "emergency_fund", label: "Emergency Fund", labelId: "Dana Darurat" },
  { id: "house", label: "House", labelId: "Rumah" },
  { id: "vehicle", label: "Vehicle", labelId: "Kendaraan" },
  { id: "vacation", label: "Vacation", labelId: "Liburan" },
  { id: "investment", label: "Investment", labelId: "Investasi" },
];

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null);
  const [habitType, setHabitType] = useState<string | null>(null);
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleFocus = (id: string) => {
    setFocusAreas(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const canProceed = () => {
    if (step === 1) return !!primaryGoal;
    if (step === 2) return !!habitType;
    if (step === 3) return focusAreas.length > 0;
    return true;
  };

  const handleGoogleLogin = () => {
    const onboardingData = { primaryGoal, habitType, focusAreas };
    localStorage.setItem("fr_onboarding", JSON.stringify(onboardingData));
    window.location.href = "/api/login";
  };

  const handleGuestLogin = async () => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/guest-login", {
        primaryGoal,
        habitType,
        focusAreas,
      });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      onComplete();
    } catch (error) {
      console.error("Guest login failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const slideVariants = {
    enter: { x: 60, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -60, opacity: 0 },
  };

  const cardBase =
    "p-4 cursor-pointer border border-border/60 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary/30";
  const cardSelected =
    "border-primary/60 bg-primary/5 ring-2 ring-primary/20 shadow-md";
  const cardUnselected = "hover:bg-muted/30";

  const BENEFITS = [
    "Personalized insights",
    "Smart savings tracking",
    "Financial clarity",
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">

        {step >= 1 && step <= 3 && (
          <div className="flex items-center justify-center gap-2 mb-10">
            <img src={logoImg} alt="Financial Radar" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-serif font-bold text-base tracking-tight">Financial Radar</span>
          </div>
        )}

        {step >= 1 && (
          <div className="mb-8 space-y-2.5">
            <p className="text-xs text-muted-foreground text-center font-medium tracking-wide">
              Step {step} of 4
            </p>
            <div className="flex items-center justify-center gap-1.5">
              {[1, 2, 3, 4].map(i => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
                    i <= step ? "bg-primary w-10" : "bg-muted w-6"
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">

          {step === 0 && (
            <motion.div
              key="step-welcome"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="flex flex-col items-center text-center pt-2"
            >
              <img
                src={logoImg}
                alt="Financial Radar"
                className="w-16 h-16 rounded-2xl object-cover shadow-md mb-6"
              />
              <div className="space-y-2 mb-12">
                <h1 className="text-2xl font-serif font-bold tracking-tight">Financial Radar</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px] mx-auto">
                  Build better money habits with clarity.
                </p>
              </div>
              <div className="w-full space-y-3">
                <Button
                  size="lg"
                  className="w-full rounded-xl h-12 text-base font-semibold shadow-sm hover:shadow-md transition-all duration-200 gap-2"
                  onClick={() => setStep(1)}
                  data-testid="button-start-setup"
                >
                  Start Setup
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <button
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
                  onClick={() => { window.location.href = "/api/login"; }}
                >
                  Already have an account?{" "}
                  <span className="underline underline-offset-2">Sign in</span>
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-5"
            >
              <div className="text-center space-y-1">
                <h2 className="text-xl font-serif font-bold">What's your primary goal?</h2>
                <p className="text-sm text-muted-foreground">Choose one that matters most to you</p>
                <p className="text-xs text-muted-foreground/60 pt-0.5">
                  This helps us personalize your financial plan.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {PRIMARY_GOALS.map(g => {
                  const Icon = g.icon;
                  const selected = primaryGoal === g.id;
                  return (
                    <Card
                      key={g.id}
                      data-testid={`onboarding-goal-${g.id}`}
                      className={`${cardBase} ${selected ? cardSelected : cardUnselected}`}
                      onClick={() => setPrimaryGoal(g.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-200 ${
                          selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{g.label}</p>
                          <p className="text-xs text-muted-foreground">{g.labelId}</p>
                        </div>
                        <div className={`w-5 h-5 shrink-0 transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`}>
                          <Check className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-5"
            >
              <div className="text-center space-y-1">
                <h2 className="text-xl font-serif font-bold">How's your financial habit?</h2>
                <p className="text-sm text-muted-foreground">Be honest — we'll tailor the experience</p>
                <p className="text-xs text-muted-foreground/60 pt-0.5">
                  We'll tailor reminders and pacing to you.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {HABIT_TYPES.map(h => {
                  const selected = habitType === h.id;
                  return (
                    <Card
                      key={h.id}
                      data-testid={`onboarding-habit-${h.id}`}
                      className={`${cardBase} ${selected ? cardSelected : cardUnselected}`}
                      onClick={() => setHabitType(h.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{h.label}</p>
                          <p className="text-xs text-muted-foreground">{h.labelId}</p>
                        </div>
                        <div className={`w-5 h-5 shrink-0 transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`}>
                          <Check className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-5"
            >
              <div className="text-center space-y-1">
                <h2 className="text-xl font-serif font-bold">What are you saving for?</h2>
                <p className="text-sm text-muted-foreground">Select all that apply</p>
                <p className="text-xs text-muted-foreground/60 pt-0.5">
                  Select all that match your goals.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {FOCUS_AREAS.map(f => {
                  const selected = focusAreas.includes(f.id);
                  return (
                    <Card
                      key={f.id}
                      data-testid={`onboarding-focus-${f.id}`}
                      className={`${cardBase} ${selected ? cardSelected : cardUnselected}`}
                      onClick={() => toggleFocus(f.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm">{f.label}</p>
                          <p className="text-xs text-muted-foreground">{f.labelId}</p>
                        </div>
                        <div className={`w-5 h-5 shrink-0 transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0"}`}>
                          <Check className="w-5 h-5 text-primary" />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="space-y-8"
            >
              <div className="text-center space-y-3">
                <img
                  src={logoImg}
                  alt="Financial Radar"
                  className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-md"
                />
                <div className="space-y-1.5">
                  <h2 className="text-2xl font-serif font-bold">You're all set!</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                    Your personalized dashboard is ready.
                  </p>
                </div>
              </div>

              <div className="space-y-2 px-2">
                {BENEFITS.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full rounded-xl h-12 gap-2 shadow-sm hover:shadow-md transition-all duration-200 font-semibold"
                  onClick={handleGoogleLogin}
                  data-testid="button-google-login"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full rounded-xl h-12 gap-2 transition-all duration-200"
                  onClick={handleGuestLogin}
                  disabled={isSubmitting}
                  data-testid="button-guest-login"
                >
                  <User className="w-5 h-5" />
                  {isSubmitting ? "Signing in…" : "Continue as Guest"}
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground text-center">
                You can secure your progress anytime.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {step >= 1 && step <= 3 && (
          <div className="mt-8">
            <Button
              size="lg"
              className="w-full rounded-xl h-12 gap-2 transition-all duration-300"
              disabled={!canProceed()}
              onClick={() => setStep(s => s + 1)}
              data-testid="button-onboarding-next"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
