import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

interface MarketRangeProps {
  price: number;
  currency: string;
  marketLow: number | null | undefined;
  marketMedian: number | null | undefined;
  marketHigh: number | null | undefined;
  marketSampleSize: number | null | undefined;
  priceVerdict: string | null | undefined;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function MarketRange({
  price,
  currency,
  marketLow,
  marketMedian,
  marketHigh,
  marketSampleSize,
  priceVerdict,
}: MarketRangeProps) {
  if (
    marketLow == null ||
    marketMedian == null ||
    marketHigh == null ||
    !marketSampleSize ||
    marketSampleSize < 2 ||
    marketLow >= marketHigh
  ) {
    return null;
  }

  const span = marketHigh - marketLow;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const medianPct = clamp(((marketMedian - marketLow) / span) * 100);
  const pricePct = clamp(((price - marketLow) / span) * 100);

  const verdictCopy: Record<string, { label: string; icon: ReactNode; className: string }> = {
    below: {
      label: "This listing is priced below the market range",
      icon: <TrendingDown className="w-4 h-4" />,
      className: "text-emerald-700",
    },
    fair: {
      label: "This listing is priced fairly within the market range",
      icon: <Minus className="w-4 h-4" />,
      className: "text-foreground",
    },
    expensive: {
      label: "This listing is priced above the market range",
      icon: <TrendingUp className="w-4 h-4" />,
      className: "text-rose-700",
    },
  };
  const verdict = priceVerdict ? verdictCopy[priceVerdict] : null;

  return (
    <div className="border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold uppercase tracking-widest">Market Range</h3>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          {marketSampleSize} comparable {marketSampleSize === 1 ? "listing" : "listings"}
        </span>
      </div>
      {verdict && (
        <div className={`flex items-center gap-2 mb-5 text-sm ${verdict.className}`}>
          {verdict.icon}
          <span>{verdict.label}.</span>
        </div>
      )}

      <div className="relative pt-8 pb-12">
        {/* Track */}
        <div className="h-2 bg-secondary relative">
          <div
            className="absolute inset-y-0 bg-primary/30"
            style={{ left: `0%`, width: `100%` }}
          />
          {/* Median tick */}
          <div
            className="absolute -top-1 bottom-[-4px] w-px bg-foreground/60"
            style={{ left: `${medianPct}%` }}
          >
            <span className="absolute -top-6 -translate-x-1/2 text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap">
              Median
            </span>
          </div>
          {/* This listing marker */}
          <div
            className="absolute -top-3 -translate-x-1/2"
            style={{ left: `${pricePct}%` }}
          >
            <div className="w-3 h-3 bg-primary rotate-45 border-2 border-background" />
            <span className="absolute top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold whitespace-nowrap">
              This listing · {fmt(price, currency)}
            </span>
          </div>
        </div>

        <div className="flex justify-between text-[11px] text-muted-foreground mt-3">
          <span>
            Low <strong className="block text-foreground font-semibold">{fmt(marketLow, currency)}</strong>
          </span>
          <span className="text-center">
            Median{" "}
            <strong className="block text-foreground font-semibold">{fmt(marketMedian, currency)}</strong>
          </span>
          <span className="text-right">
            High <strong className="block text-foreground font-semibold">{fmt(marketHigh, currency)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
