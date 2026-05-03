import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Check,
  Eye,
  Gauge,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingDown,
  Layers,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="border-b border-border/60">
        <div className="container mx-auto px-6 h-20 flex items-center justify-between max-w-7xl">
          <Link href="/" className="flex items-center gap-2" data-testid="link-home">
            <span className="font-serif text-2xl font-semibold tracking-tight">
              Bag<span className="italic text-primary">Scout</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-10 text-xs uppercase tracking-[0.2em] font-medium text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">
              How It Works
            </a>
            <a href="#criteria" className="hover:text-foreground transition-colors">
              Criteria
            </a>
            <a href="#intelligence" className="hover:text-foreground transition-colors">
              Intelligence
            </a>
            <a href="#pricing" className="hover:text-foreground transition-colors">
              Pricing
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className="rounded-none uppercase tracking-[0.2em] text-[11px] font-medium hidden sm:inline-flex"
              data-testid="header-sign-in"
            >
              <Link href="/sign-in">Sign In</Link>
            </Button>
            <Button
              asChild
              className="rounded-none uppercase tracking-[0.2em] text-[11px] font-medium px-5"
              data-testid="header-sign-up"
            >
              <Link href="/sign-up">Start Watching</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="relative px-6 pt-20 md:pt-28 pb-24 md:pb-32">
        <div className="container mx-auto max-w-7xl grid md:grid-cols-12 gap-16 items-center">
          <motion.div
            className="md:col-span-7"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="text-[11px] uppercase tracking-[0.3em] text-foreground/70 font-semibold mb-6 flex items-center gap-3">
              <span className="inline-block w-8 h-px bg-primary" aria-hidden="true" />
              Your personal luxury bag scout
            </p>
            <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.02] font-medium tracking-tight">
              Find your dream bag
              <br />
              <span className="italic">before someone else does.</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mt-8 max-w-xl">
              BagScout watches trusted luxury resale sources and alerts you when your
              desired bag appears in your size, color, condition, and price range.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-none h-14 px-8 uppercase tracking-[0.2em] text-xs font-semibold w-full sm:w-auto"
                data-testid="hero-cta-primary"
              >
                <Link href="/sign-up">
                  Start Watching
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-none h-14 px-8 uppercase tracking-[0.2em] text-xs font-semibold w-full sm:w-auto border-foreground/30 hover:bg-foreground/5"
                data-testid="hero-cta-secondary"
              >
                <a href="#how-it-works">See How It Works</a>
              </Button>
            </div>
            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-xs uppercase tracking-[0.2em] text-foreground/70 font-medium">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" /> Trusted Sources
              </span>
              <span className="flex items-center gap-2">
                <Bell className="w-3.5 h-3.5" /> Real-Time Alerts
              </span>
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Match Intelligence
              </span>
            </div>
          </motion.div>

          {/* Hero visual: stacked editorial alert cards */}
          <motion.div
            className="md:col-span-5 relative"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.15 }}
          >
            <div className="relative aspect-[4/5] bg-secondary/40 border border-border">
              <div className="absolute inset-4 border border-border/60 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="relative w-full max-w-[340px] space-y-5">
                  <AlertCard
                    label="New Match"
                    when="Just now"
                    brand="Hermès"
                    name="Birkin 30 · Togo · Étoupe"
                    price="$22,500"
                    score="98"
                    primary
                  />
                  <AlertCard
                    label="Price Drop"
                    when="2h ago"
                    brand="Chanel"
                    name="Classic Flap · Medium · Caviar"
                    price="$8,900"
                    oldPrice="$9,500"
                    score="91"
                    offset
                  />
                  <AlertCard
                    label="Similar Cheaper"
                    when="Today"
                    brand="Louis Vuitton"
                    name="Speedy 25 · Monogram"
                    price="$1,180"
                    score="84"
                    muted
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── 1. How It Works ────────────────────────────────── */}
      <section
        id="how-it-works"
        className="px-6 py-24 md:py-32 border-t border-border bg-card"
      >
        <div className="container mx-auto max-w-6xl">
          <SectionLabel index="01" label="How It Works" />
          <motion.h2
            {...fadeUp}
            className="font-serif text-4xl md:text-6xl font-medium tracking-tight max-w-3xl mt-4"
          >
            Three quiet steps between you and the bag.
          </motion.h2>

          <div className="grid md:grid-cols-3 gap-px bg-border mt-16 border border-border">
            <Step
              n="01"
              title="Tell us the bag"
              body="Brand, model, size, color, condition, price — as exact or as open as you like."
              icon={<Search className="w-5 h-5" />}
            />
            <Step
              n="02"
              title="We watch trusted resale sources"
              body="Our scouts continuously monitor reputable luxury resellers around the clock, so you don't have to."
              icon={<Eye className="w-5 h-5" />}
            />
            <Step
              n="03"
              title="You get alerted when it matches"
              body="An email arrives the moment a listing fits your criteria — with a direct link to the source."
              icon={<Bell className="w-5 h-5" />}
            />
          </div>
        </div>
      </section>

      {/* ─── 2. Criteria-Based Watching ─────────────────────── */}
      <section id="criteria" className="px-6 py-24 md:py-32 border-t border-border">
        <div className="container mx-auto max-w-6xl grid md:grid-cols-12 gap-16">
          <div className="md:col-span-5">
            <SectionLabel index="02" label="Criteria" />
            <motion.h2
              {...fadeUp}
              className="font-serif text-4xl md:text-5xl font-medium tracking-tight mt-4"
            >
              Search the way collectors think.
            </motion.h2>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="text-muted-foreground text-lg leading-relaxed mt-6"
            >
              No keyword guesswork. Watchlists are built around the exact attributes
              that matter — and you choose whether close matches count.
            </motion.p>
          </div>
          <div className="md:col-span-7">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-border border border-border">
              {[
                { label: "Brand", icon: <Tag className="w-4 h-4" /> },
                { label: "Style", icon: <Layers className="w-4 h-4" /> },
                { label: "Exact Model", icon: <Sparkles className="w-4 h-4" /> },
                { label: "Condition", icon: <ShieldCheck className="w-4 h-4" /> },
                { label: "Color", icon: <Eye className="w-4 h-4" /> },
                { label: "Size", icon: <Gauge className="w-4 h-4" /> },
                { label: "Price", icon: <TrendingDown className="w-4 h-4" /> },
                {
                  label: "Exact or close matches",
                  icon: <Zap className="w-4 h-4" />,
                  span: 2,
                },
              ].map((c) => (
                <div
                  key={c.label}
                  className={
                    "bg-background p-6 flex items-center gap-3 hover:bg-secondary/40 transition-colors " +
                    (c.span === 2 ? "col-span-2" : "")
                  }
                  data-testid={`criteria-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <span className="text-primary">{c.icon}</span>
                  <span className="text-sm font-medium tracking-tight">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. Premium Match Intelligence ──────────────────── */}
      <section
        id="intelligence"
        className="px-6 py-24 md:py-32 border-t border-border bg-card"
      >
        <div className="container mx-auto max-w-6xl">
          <SectionLabel index="03" label="Match Intelligence" />
          <motion.h2
            {...fadeUp}
            className="font-serif text-4xl md:text-6xl font-medium tracking-tight max-w-3xl mt-4"
          >
            Every alert, scored and explained.
          </motion.h2>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="text-muted-foreground text-lg max-w-2xl mt-6"
          >
            Go beyond a feed. We score the listing, place it against the market, and
            surface what's worth your attention.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-px bg-border mt-16 border border-border">
            <Intel
              title="Match Score"
              body="A 0-100 score that quantifies how closely the listing fits your criteria — with a plain-English explanation."
            />
            <Intel
              title="Deal Score"
              body="Spot favourable pricing instantly. Each match is benchmarked against comparable listings."
            />
            <Intel
              title="Market Range"
              body="See where this listing falls within the typical price band for the model and condition."
            />
            <Intel
              title="Price Drop Alerts"
              body="Get notified when watched listings get reduced — without re-checking the source."
            />
            <Intel
              title="Source Attribution"
              body="Every alert links back to the original marketplace. We never hide where a listing came from."
            />
            <Intel
              title="Similar But Cheaper"
              body="When a close alternative is priced better, we surface it alongside the primary match."
            />
          </div>
        </div>
      </section>

      {/* ─── 4. Built for Luxury Resale ─────────────────────── */}
      <section className="px-6 py-24 md:py-32 border-t border-border">
        <div className="container mx-auto max-w-6xl">
          <SectionLabel index="04" label="Built for Luxury Resale" />
          <motion.h2
            {...fadeUp}
            className="font-serif text-4xl md:text-6xl font-medium tracking-tight max-w-3xl mt-4"
          >
            Tuned for the bags collectors actually hunt.
          </motion.h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border mt-16 border border-border">
            {[
              { house: "Chanel", model: "Classic Flap" },
              { house: "Hermès", model: "Birkin" },
              { house: "Hermès", model: "Kelly" },
              { house: "Louis Vuitton", model: "Speedy" },
              { house: "Dior", model: "Lady Dior" },
              { house: "Fendi", model: "Baguette" },
              { house: "Prada", model: "Re-Edition" },
              { house: "Celine", model: "Triomphe" },
            ].map((b) => (
              <div
                key={`${b.house}-${b.model}`}
                className="bg-background p-8 hover:bg-secondary/40 transition-colors"
              >
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-2">
                  {b.house}
                </p>
                <p className="font-serif text-xl font-medium leading-tight">
                  {b.model}
                </p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-8 italic">
            …and many more. If a trusted source carries it, we can watch for it.
          </p>
        </div>
      </section>

      {/* ─── 5. Trust ──────────────────────────────────────── */}
      <section className="px-6 py-24 md:py-32 border-t border-border bg-foreground text-background">
        <div className="container mx-auto max-w-6xl grid md:grid-cols-12 gap-16">
          <div className="md:col-span-5">
            <p className="text-[11px] uppercase tracking-[0.3em] text-background/50 font-medium">
              <span className="text-background/40">05 — </span>How We Work
            </p>
            <motion.h2
              {...fadeUp}
              className="font-serif text-4xl md:text-5xl font-medium tracking-tight mt-4"
            >
              A scout, not a storefront.
            </motion.h2>
          </div>
          <div className="md:col-span-7 space-y-6 text-base leading-relaxed">
            <TrustItem text="We always show you the source — every listing links straight back to the marketplace it came from." />
            <TrustItem text="We do not sell the bags. BagScout never holds inventory and never resells." />
            <TrustItem text="We help you discover listings faster — that's it. We'll never inflate, repackage, or obscure prices." />
            <TrustItem text="You verify authenticity, return policy, and seller terms at the source marketplace before any purchase." />
          </div>
        </div>
      </section>

      {/* ─── 6. Pricing ─────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-24 md:py-32 border-t border-border">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <SectionLabel index="06" label="Pricing" centered />
            <motion.h2
              {...fadeUp}
              className="font-serif text-4xl md:text-6xl font-medium tracking-tight mt-4"
            >
              Quietly priced. Generously useful.
            </motion.h2>
            <motion.p
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="text-muted-foreground text-lg max-w-xl mx-auto mt-6"
            >
              Start free, upgrade when one bag's worth of speed pays for itself.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 gap-px bg-border border border-border">
            <PricingCard
              name="Free"
              tag="For the curious collector"
              cta="Start Free"
              ctaTo="/sign-up"
              testid="pricing-free-cta"
              features={["1 watchlist", "Daily digest of matches"]}
            />
            <PricingCard
              name="Premium"
              tag="For the serious hunter"
              priceLabel="Coming soon"
              cta="Join the Waitlist"
              ctaTo="/sign-up"
              testid="pricing-premium-cta"
              accent
              features={[
                "Unlimited watchlists",
                "Instant alerts",
                "Deal score",
                "Price history",
                "Similar listings",
                "Priority matching",
              ]}
            />
          </div>
        </div>
      </section>

      {/* ─── Final CTA Banner ───────────────────────────────── */}
      <section className="px-6 py-24 border-t border-border bg-secondary/50">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="font-serif text-4xl md:text-5xl font-medium tracking-tight">
            The next listing is moments away.
          </h2>
          <p className="text-muted-foreground text-lg mt-6 max-w-xl mx-auto">
            Set your first watchlist in under a minute — and let BagScout do the
            looking.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              asChild
              size="lg"
              className="rounded-none h-14 px-10 uppercase tracking-[0.2em] text-xs font-semibold w-full sm:w-auto"
              data-testid="footer-cta-primary"
            >
              <Link href="/sign-up">
                Start Watching
                <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────── */}
      <footer className="border-t border-border bg-background">
        <div className="container mx-auto px-6 max-w-7xl py-12 grid md:grid-cols-3 gap-8 items-start">
          <div>
            <span className="font-serif text-xl font-semibold tracking-tight">
              Bag<span className="italic text-primary">Scout</span>
            </span>
            <p className="text-sm text-muted-foreground mt-3 max-w-xs">
              Your personal luxury bag scout. Independent, transparent, and never a
              reseller.
            </p>
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">Product</p>
            <div className="flex flex-col gap-2">
              <a href="#how-it-works" className="hover:text-foreground">
                How it works
              </a>
              <a href="#criteria" className="hover:text-foreground">
                Criteria
              </a>
              <a href="#intelligence" className="hover:text-foreground">
                Intelligence
              </a>
              <a href="#pricing" className="hover:text-foreground">
                Pricing
              </a>
            </div>
          </div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground space-y-3">
            <p className="font-medium text-foreground">Account</p>
            <div className="flex flex-col gap-2">
              <Link href="/sign-in" className="hover:text-foreground">
                Sign in
              </Link>
              <Link href="/sign-up" className="hover:text-foreground">
                Create account
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="container mx-auto px-6 max-w-7xl py-6 flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-muted-foreground">
            <p>© {new Date().getFullYear()} BagScout. All rights reserved.</p>
            <p className="italic">Not affiliated with any mentioned brands.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ───────── Subcomponents ───────── */

function SectionLabel({
  index,
  label,
  centered = false,
}: {
  index: string;
  label: string;
  centered?: boolean;
}) {
  return (
    <p
      className={
        "text-[11px] uppercase tracking-[0.3em] text-foreground/75 font-semibold flex items-center gap-3 " +
        (centered ? "justify-center" : "")
      }
    >
      <span className="inline-block w-6 h-px bg-primary" aria-hidden="true" />
      <span>{index}</span>
      <span className="text-foreground/40" aria-hidden="true">—</span>
      <span>{label}</span>
    </p>
  );
}

function Step({
  n,
  title,
  body,
  icon,
}: {
  n: string;
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      {...fadeUp}
      className="bg-card p-10 flex flex-col gap-6 min-h-[280px]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          Step {n}
        </span>
        <span className="text-primary">{icon}</span>
      </div>
      <h3 className="font-serif text-2xl font-medium leading-tight">{title}</h3>
      <p className="text-muted-foreground leading-relaxed text-[15px]">{body}</p>
    </motion.div>
  );
}

function Intel({ title, body }: { title: string; body: string }) {
  return (
    <motion.div
      {...fadeUp}
      className="bg-background p-8 hover:bg-secondary/30 transition-colors min-h-[200px]"
    >
      <h3 className="font-serif text-xl font-medium mb-3">{title}</h3>
      <p className="text-muted-foreground text-[15px] leading-relaxed">{body}</p>
    </motion.div>
  );
}

function TrustItem({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-4 border-b border-background/15 pb-6 last:border-b-0">
      <Check className="w-5 h-5 text-primary mt-0.5 shrink-0" strokeWidth={2.5} />
      <p className="text-background/85">{text}</p>
    </div>
  );
}

function PricingCard({
  name,
  tag,
  priceLabel,
  cta,
  ctaTo,
  features,
  accent = false,
  testid,
}: {
  name: string;
  tag: string;
  priceLabel?: string;
  cta: string;
  ctaTo: string;
  features: string[];
  accent?: boolean;
  testid: string;
}) {
  return (
    <div
      className={
        "p-10 flex flex-col " +
        (accent ? "bg-foreground text-background" : "bg-background")
      }
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-serif text-3xl font-medium">{name}</h3>
        {priceLabel && (
          <span
            className={
              "text-[10px] uppercase tracking-[0.25em] " +
              (accent ? "text-background/60" : "text-muted-foreground")
            }
          >
            {priceLabel}
          </span>
        )}
      </div>
      <p
        className={
          "text-sm mb-8 " + (accent ? "text-background/70" : "text-muted-foreground")
        }
      >
        {tag}
      </p>
      <ul className="space-y-3 mb-10 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-[15px]">
            <Check
              className={
                "w-4 h-4 mt-1 shrink-0 " +
                (accent ? "text-background" : "text-primary")
              }
              strokeWidth={2.5}
            />
            <span className={accent ? "text-background/95" : ""}>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        asChild
        size="lg"
        variant={accent ? "secondary" : "default"}
        className={
          "w-full rounded-none h-12 uppercase tracking-[0.2em] text-xs font-semibold " +
          (accent
            ? "bg-background text-foreground hover:bg-background/90"
            : "")
        }
        data-testid={testid}
      >
        <Link href={ctaTo}>{cta}</Link>
      </Button>
    </div>
  );
}

function AlertCard({
  label,
  when,
  brand,
  name,
  price,
  oldPrice,
  score,
  primary,
  offset,
  muted,
}: {
  label: string;
  when: string;
  brand: string;
  name: string;
  price: string;
  oldPrice?: string;
  score: string;
  primary?: boolean;
  offset?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "bg-card border border-border p-4 shadow-sm " +
        (offset ? "translate-x-6 " : "") +
        (muted ? "opacity-70 -translate-x-3 " : "") +
        (primary ? "shadow-xl" : "")
      }
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-[0.25em] text-foreground/80 font-semibold flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 bg-primary" aria-hidden="true" />
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{when}</span>
      </div>
      <div className="flex gap-3">
        <div className="w-14 h-14 bg-secondary border border-border shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {brand}
          </p>
          <p className="font-serif text-sm font-medium leading-tight truncate">
            {name}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-sm font-semibold tabular-nums">
              {price}
              {oldPrice && (
                <span className="line-through text-muted-foreground text-[10px] font-normal ml-1.5">
                  {oldPrice}
                </span>
              )}
            </p>
            <span className="text-[10px] uppercase tracking-[0.2em] text-foreground/70">
              <span className="font-semibold text-foreground">{score}</span>/100
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
