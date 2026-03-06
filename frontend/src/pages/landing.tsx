import { Button } from "@/components/ui/button";
import { Wallet, Landmark, Smartphone, TrendingUp, ArrowRight, ShieldCheck, LineChart, PiggyBank } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import logoImg from "@assets/favicon_1771971850849.png";

export default function Landing() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 h-14">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="Financial Radar" className="w-7 h-7 rounded-md object-cover" />
            <span className="font-semibold text-sm tracking-tight" data-testid="text-brand">{t.brand}</span>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <a href="#pillars" className="text-xs text-muted-foreground transition-colors" data-testid="link-features">{t.nav.features}</a>
            <a href="#how-it-works" className="text-xs text-muted-foreground transition-colors" data-testid="link-how-it-works">{t.nav.howItWorks}</a>
          </div>
          <a href="/api/login">
            <Button size="sm" data-testid="button-login">{t.auth.getStarted}</Button>
          </a>
        </div>
      </nav>

      <section className="pt-28 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold leading-tight text-foreground" data-testid="text-hero-headline">
              {t.landing.headline}
            </h1>
            <p className="text-base text-muted-foreground max-w-md leading-relaxed" data-testid="text-hero-subheadline">
              {t.landing.subheadline}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a href="/api/login">
                <Button size="lg" className="gap-2" data-testid="button-cta-primary">
                  {t.landing.ctaPrimary}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" data-testid="button-cta-secondary">
                  {t.landing.ctaSecondary}
                </Button>
              </a>
            </div>
            <p className="text-xs text-muted-foreground pt-1" data-testid="text-trust-line">{t.landing.trustLine}</p>
          </div>

          <div className="relative hidden lg:block">
            <div className="landing-float rounded-md overflow-hidden text-white p-5 space-y-4" style={{ background: "linear-gradient(145deg, #18442A 0%, #0F2B1A 100%)" }}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-white/50 uppercase tracking-wider" data-testid="text-mockup-total-assets">{t.landing.totalAssets}</p>
                <TrendingUp className="w-4 h-4 text-emerald-400/60" />
              </div>
              <p className="text-2xl font-bold font-mono tracking-tight" data-testid="text-mockup-amount">Rp 45.250.000</p>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md bg-white/[0.06] p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wallet className="w-3 h-3 text-white/40" />
                    <span className="text-[10px] text-white/40">Cash</span>
                  </div>
                  <p className="text-xs font-mono font-semibold">Rp 2.5M</p>
                </div>
                <div className="rounded-md bg-white/[0.06] p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Landmark className="w-3 h-3 text-white/40" />
                    <span className="text-[10px] text-white/40">Bank</span>
                  </div>
                  <p className="text-xs font-mono font-semibold">Rp 35M</p>
                </div>
                <div className="rounded-md bg-white/[0.06] p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Smartphone className="w-3 h-3 text-white/40" />
                    <span className="text-[10px] text-white/40">E-Wallet</span>
                  </div>
                  <p className="text-xs font-mono font-semibold">Rp 7.7M</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-white/40">{t.landing.savingsGoal}</span>
                  <span className="text-xs font-mono font-semibold text-emerald-400/70">72%</span>
                </div>
                <div className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
                  <div className="h-full rounded-full landing-chart-draw" style={{ background: "linear-gradient(90deg, #2D7A4A, #45644A)" }} />
                </div>
              </div>

              <svg className="w-full h-16 mt-2" viewBox="0 0 300 60" fill="none" preserveAspectRatio="none">
                <path
                  d="M0 55 Q30 50 60 42 Q90 34 120 30 Q150 26 180 20 Q210 16 240 12 Q270 8 300 5"
                  stroke="rgba(69,100,74,0.5)"
                  strokeWidth="1.5"
                  fill="none"
                  className="landing-line-draw"
                />
                <path
                  d="M0 55 Q30 50 60 42 Q90 34 120 30 Q150 26 180 20 Q210 16 240 12 Q270 8 300 5 L300 60 L0 60 Z"
                  fill="url(#areaGrad)"
                  className="landing-area-fade"
                />
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(69,100,74,0.15)" />
                    <stop offset="100%" stopColor="rgba(69,100,74,0)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </section>

      <section id="pillars" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-14 text-center" data-testid="text-pillars-title">
            {t.landing.pillarsTitle}
          </h2>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
            {[
              { icon: Wallet, title: t.landing.pillar1Title, desc: t.landing.pillar1Desc },
              { icon: ShieldCheck, title: t.landing.pillar2Title, desc: t.landing.pillar2Desc },
              { icon: LineChart, title: t.landing.pillar3Title, desc: t.landing.pillar3Desc },
            ].map((pillar) => (
              <div key={pillar.title} className="space-y-3">
                <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
                  <pillar.icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">{pillar.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-card/60">
        <div className="max-w-4xl mx-auto text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground" data-testid="text-visual-title">
            {t.landing.visualTitle}
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto leading-relaxed" data-testid="text-visual-desc">
            {t.landing.visualDesc}
          </p>
          <div className="pt-8">
            <div className="rounded-md overflow-hidden p-6 sm:p-8 text-white mx-auto max-w-2xl" style={{ background: "linear-gradient(145deg, #18442A 0%, #0F2B1A 100%)" }}>
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Net Worth</p>
                    <p className="text-xl font-bold font-mono">Rp 38.750.000</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Debt Ratio</p>
                    <p className="text-xl font-bold font-mono text-emerald-400/80">14.4%</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-md bg-white/[0.06] p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Assets</p>
                    <p className="text-sm font-mono font-semibold">Rp 45.2M</p>
                  </div>
                  <div className="rounded-md bg-white/[0.06] p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Liabilities</p>
                    <p className="text-sm font-mono font-semibold">Rp 6.5M</p>
                  </div>
                  <div className="rounded-md bg-white/[0.06] p-3 text-center">
                    <p className="text-[10px] text-white/40 uppercase mb-1">Status</p>
                    <p className="text-sm font-semibold text-emerald-400/80">Healthy</p>
                  </div>
                </div>

                <svg className="w-full h-20" viewBox="0 0 300 70" fill="none" preserveAspectRatio="none">
                  <path
                    d="M0 60 Q50 55 100 45 Q150 35 200 25 Q250 18 300 10"
                    stroke="rgba(69,100,74,0.6)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path
                    d="M0 60 Q50 55 100 45 Q150 35 200 25 Q250 18 300 10 L300 70 L0 70 Z"
                    fill="url(#visualGrad)"
                  />
                  <defs>
                    <linearGradient id="visualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(69,100,74,0.2)" />
                      <stop offset="100%" stopColor="rgba(69,100,74,0)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-14" data-testid="text-how-title">
            {t.landing.howItWorksTitle}
          </h2>
          <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
            {[
              { step: "1", icon: PiggyBank, title: t.landing.step1Title, desc: t.landing.step1Desc },
              { step: "2", icon: LineChart, title: t.landing.step2Title, desc: t.landing.step2Desc },
              { step: "3", icon: ShieldCheck, title: t.landing.step3Title, desc: t.landing.step3Desc },
            ].map((item) => (
              <div key={item.step} className="space-y-3 text-center">
                <div className="w-10 h-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center mx-auto font-bold text-sm">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground text-sm">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 sm:px-6 lg:px-8" style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)" }}>
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-foreground" data-testid="text-cta-title">
            {t.landing.ctaTitle}
          </h2>
          <a href="/api/login">
            <Button size="lg" className="gap-2 mt-2" data-testid="button-cta-bottom">
              {t.landing.ctaButton}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </a>
          <p className="text-xs text-muted-foreground" data-testid="text-cta-trust">{t.landing.ctaTrust}</p>
        </div>
      </section>

      <footer className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs text-muted-foreground">
            {t.landing.footerCredit}{" "}
            <a
              href="https://instagram.com/chittaatoes"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-muted-foreground/30 underline-offset-2 text-muted-foreground"
              data-testid="link-creator"
            >
              @chittaatoes
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
