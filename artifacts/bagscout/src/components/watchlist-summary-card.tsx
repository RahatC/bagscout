import { Link } from "wouter";
import { motion } from "framer-motion";
import { Pencil, Bell, ShieldCheck, Lock, Sliders } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BagPreference } from "@workspace/api-client-react";

interface WatchlistSummaryCardProps {
  preference: BagPreference;
  onToggleActive: (id: number, nextActive: boolean) => void;
  index?: number;
}

const FREQUENCY_LABELS: Record<string, string> = {
  realtime: "Real-time",
  daily: "Daily digest",
  weekly: "Weekly digest",
};

export function WatchlistSummaryCard({
  preference,
  onToggleActive,
  index = 0,
}: WatchlistSummaryCardProps) {
  const frequency = preference.alertFrequency;
  const strict = preference.onlyExactCriteria;
  const formatRange = () => {
    if (preference.minPrice && preference.maxPrice) {
      return `$${preference.minPrice.toLocaleString()} – $${preference.maxPrice.toLocaleString()}`;
    }
    if (preference.maxPrice) return `Under $${preference.maxPrice.toLocaleString()}`;
    if (preference.minPrice) return `Over $${preference.minPrice.toLocaleString()}`;
    return "Any price";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        className={`rounded-none border shadow-none transition-colors h-full ${
          preference.active
            ? "border-border hover:border-primary/40 bg-card"
            : "border-border bg-secondary/30 opacity-90"
        }`}
      >
        <CardContent className="p-6 flex flex-col h-full gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="font-serif font-semibold text-xl leading-tight truncate">
                {preference.nickname}
              </h3>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mt-1.5">
                {preference.brands.slice(0, 3).map((b) => (
                  <span
                    key={b.id}
                    className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary"
                  >
                    {b.name}
                  </span>
                ))}
                {preference.brands.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{preference.brands.length - 3}
                  </span>
                )}
                {preference.modelQuery && (
                  <span className="text-xs text-muted-foreground italic">
                    "{preference.modelQuery}"
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <Switch
                checked={preference.active}
                onCheckedChange={(next) => onToggleActive(preference.id, next)}
                aria-label={preference.active ? "Pause watchlist" : "Activate watchlist"}
              />
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                {preference.active ? "Active" : "Paused"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {preference.styles.slice(0, 3).map((s) => (
              <Badge
                key={`s-${s.id}`}
                variant="outline"
                className="rounded-none font-normal text-[10px] uppercase tracking-wider"
              >
                {s.name}
              </Badge>
            ))}
            {preference.colors.slice(0, 3).map((c) => (
              <Badge
                key={`c-${c.id}`}
                variant="outline"
                className="rounded-none font-normal text-[10px] uppercase tracking-wider"
              >
                {c.name}
              </Badge>
            ))}
            {preference.sizes.slice(0, 2).map((s) => (
              <Badge
                key={`z-${s.id}`}
                variant="outline"
                className="rounded-none font-normal text-[10px] uppercase tracking-wider"
              >
                {s.name}
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs border-y border-border/60 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                Price
              </p>
              <p className="font-serif text-sm">{formatRange()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                Strictness
              </p>
              <p className="font-serif text-sm flex items-center gap-1">
                {strict ? (
                  <>
                    <Lock className="w-3 h-3" /> Strict
                  </>
                ) : (
                  <>
                    <Sliders className="w-3 h-3" /> Flexible
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                Frequency
              </p>
              <p className="font-serif text-sm flex items-center gap-1">
                <Bell className="w-3 h-3" />
                {FREQUENCY_LABELS[frequency]}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-0.5">
                Matches
              </p>
              <p className="font-serif text-sm flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-primary" />
                {preference.matchCount}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto">
            <Button
              asChild
              variant="link"
              className="px-0 text-xs uppercase tracking-widest text-primary hover:text-primary/80 font-semibold"
            >
              <Link href={`/watchlists/${preference.id}`}>View Matches →</Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="rounded-none h-8 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              <Link href={`/watchlists/${preference.id}`}>
                <Pencil className="w-3 h-3 mr-1.5" /> Edit
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
