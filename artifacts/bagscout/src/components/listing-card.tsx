import { motion } from "framer-motion";
import {
  ExternalLink,
  Bookmark,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  Sparkles,
  TrendingDown,
  Flame,
  Gem,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Listing, MatchReason } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Image gallery for a listing card. Shows a single image when only one
 * is available; otherwise renders a fade-cross-faded carousel with chevron
 * arrows on hover and a row of dot indicators along the bottom.
 */
function ListingGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const [idx, setIdx] = useState(0);

  if (images.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/20">
        No Image
      </div>
    );
  }

  const safeIdx = Math.min(idx, images.length - 1);
  const goTo = (next: number) => {
    const len = images.length;
    setIdx(((next % len) + len) % len);
  };

  return (
    <>
      {images.map((src, i) => (
        <img
          key={src + i}
          src={src}
          alt={alt}
          loading={i === 0 ? "eager" : "lazy"}
          aria-hidden={i !== safeIdx}
          className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-300 ${
            i === safeIdx
              ? "opacity-100 group-hover:scale-105 transition-transform duration-500 ease-out"
              : "opacity-0"
          }`}
        />
      ))}

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(safeIdx - 1);
            }}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-border hover:bg-background z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goTo(safeIdx + 1);
            }}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-background/80 backdrop-blur-sm text-foreground opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-border hover:bg-background z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div
            className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/70 backdrop-blur-sm z-10"
            aria-label={`Image ${safeIdx + 1} of ${images.length}`}
          >
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                }}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === safeIdx}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === safeIdx
                    ? "bg-foreground w-3"
                    : "bg-foreground/40 hover:bg-foreground/70"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

interface ListingCardProps {
  listing: Listing;
  matchScore?: number;
  matchType?: string;
  matchExplanation?: string;
  matchReasons?: MatchReason[];
  preferenceNickname?: string;
  isSaved?: boolean;
  onSaveToggle?: (id: number, currentlySaved: boolean) => void;
  onHide?: (id: number) => void;
  index?: number;
}

const MATCH_TYPE_STYLES: Record<
  string,
  { label: string; className: string; icon?: boolean }
> = {
  exact: {
    label: "Exact Match",
    className: "bg-foreground text-background border-foreground",
    icon: true,
  },
  strong: {
    label: "Strong Match",
    className: "bg-primary text-primary-foreground border-primary",
    icon: true,
  },
  close: {
    label: "Close Match",
    className: "bg-background text-primary border-primary/40",
  },
  weak: {
    label: "Possible Match",
    className: "bg-background text-muted-foreground border-border",
  },
};

export function ListingCard({
  listing,
  matchScore,
  matchType,
  matchExplanation,
  matchReasons,
  preferenceNickname,
  isSaved = false,
  onSaveToggle,
  onHide,
  index = 0,
}: ListingCardProps) {
  const getSourceColor = (sourceName: string) => {
    switch (sourceName.toLowerCase()) {
      case "fashionphile":
        return "bg-gray-900 text-white";
      case "rebag":
        return "bg-rose-900 text-white";
      case "the realreal":
        return "bg-neutral-800 text-white";
      case "yoogi's closet":
        return "bg-stone-700 text-white";
      default:
        return "bg-primary text-primary-foreground";
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const reasons = matchReasons?.filter((r) => r.matched) ?? [];
  const matchTypeInfo = matchType ? MATCH_TYPE_STYLES[matchType] : null;

  const firstSeen = new Date(listing.firstSeenAt);
  const lastSeen = new Date(listing.lastSeenAt);
  const wasUpdated = lastSeen.getTime() - firstSeen.getTime() > 60_000;

  // Prefer the multi-image array; fall back to the legacy single image_url
  // for older rows that haven't been re-ingested yet.
  const galleryImages = useMemo(() => {
    const arr = (listing.imageUrls ?? []).filter(
      (u): u is string => typeof u === "string" && u.length > 0,
    );
    if (arr.length > 0) return arr;
    return listing.imageUrl ? [listing.imageUrl] : [];
  }, [listing.imageUrls, listing.imageUrl]);

  // Intelligence badges (only shown when the back-end has computed values).
  const dealBadge =
    listing.dealScore != null && listing.dealScore >= 70 ? (
      <Badge className="rounded-none border-none bg-emerald-700 text-white font-bold uppercase tracking-widest text-[10px] shadow-sm">
        <Flame className="w-3 h-3 mr-1" />
        Deal {Math.round(listing.dealScore)}
      </Badge>
    ) : null;

  const SCARCITY_LABELS: Record<string, { label: string; className: string }> = {
    very_rare: {
      label: "Very rare",
      className: "bg-foreground text-background border-foreground",
    },
    rare: {
      label: "Rare",
      className: "bg-primary text-primary-foreground border-primary",
    },
    uncommon: {
      label: "Uncommon",
      className: "bg-background text-primary border-primary/40",
    },
    common: {
      label: "Common",
      className: "bg-background/95 text-muted-foreground border-border",
    },
  };
  const scarcityInfo = listing.scarcityTier
    ? SCARCITY_LABELS[listing.scarcityTier]
    : null;
  const scarcityBadge =
    scarcityInfo &&
    (listing.scarcityTier === "rare" || listing.scarcityTier === "very_rare") ? (
      <Badge
        variant="outline"
        className={`rounded-none uppercase tracking-widest text-[10px] font-bold shadow-sm ${scarcityInfo.className}`}
      >
        <Gem className="w-3 h-3 mr-1" />
        {scarcityInfo.label}
      </Badge>
    ) : null;

  const VERDICT_LABELS: Record<string, { label: string; className: string }> = {
    below: {
      label: "Below market",
      className: "bg-emerald-50 text-emerald-900 border-emerald-700",
    },
    fair: {
      label: "Fair price",
      className: "bg-background/95 text-foreground border-border",
    },
    expensive: {
      label: "Above market",
      className: "bg-rose-50 text-rose-900 border-rose-300",
    },
  };
  const verdictInfo = listing.priceVerdict
    ? VERDICT_LABELS[listing.priceVerdict]
    : null;
  const verdictBadge = verdictInfo ? (
    <Badge
      variant="outline"
      className={`rounded-none uppercase tracking-widest text-[10px] font-bold shadow-sm ${verdictInfo.className}`}
    >
      {listing.priceVerdict === "below" && <TrendingDown className="w-3 h-3 mr-1" />}
      {verdictInfo.label}
    </Badge>
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Card className="overflow-hidden rounded-none border border-border group hover:border-primary/50 transition-all duration-300 h-full flex flex-col bg-card">
        <div className="relative aspect-square overflow-hidden bg-secondary/30">
          <ListingGallery
            images={galleryImages}
            alt={`${listing.brand} ${listing.model || ""}`}
          />

          <div className="absolute top-3 left-3 flex flex-col gap-2 items-start">
            <Badge
              className={`rounded-none font-semibold ${getSourceColor(listing.sourceName)} border-none shadow-sm`}
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              {listing.sourceName}
            </Badge>

            {matchTypeInfo && (
              <Badge
                variant="outline"
                className={`rounded-none font-bold uppercase tracking-widest text-[10px] shadow-sm ${matchTypeInfo.className}`}
              >
                {matchTypeInfo.icon && <Sparkles className="w-3 h-3 mr-1" />}
                {matchTypeInfo.label}
                {matchScore !== undefined && (
                  <span className="ml-1.5 opacity-70">
                    {Math.round(matchScore * 100)}%
                  </span>
                )}
              </Badge>
            )}

            {!matchTypeInfo && matchScore !== undefined && (
              <Badge
                variant="outline"
                className="rounded-none bg-background/95 backdrop-blur-sm border-primary/20 text-primary font-bold shadow-sm"
              >
                {Math.round(matchScore * 100)}% Match
              </Badge>
            )}

            {dealBadge}
          </div>

          {(scarcityBadge || verdictBadge) && (
            <div className="absolute bottom-3 left-3 flex flex-wrap gap-2 items-end max-w-[80%]">
              {scarcityBadge}
              {verdictBadge}
            </div>
          )}

          <div className="absolute top-3 right-3 flex flex-col gap-2">
            {onSaveToggle && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onSaveToggle(listing.id, isSaved);
                }}
                aria-label={isSaved ? "Remove from saved" : "Save listing"}
                className="p-2 rounded-none bg-background/90 backdrop-blur-sm hover:bg-background text-foreground transition-colors shadow-sm border border-border"
              >
                <Bookmark
                  className={`w-4 h-4 ${isSaved ? "fill-primary text-primary" : ""}`}
                />
              </button>
            )}
            {onHide && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onHide(listing.id);
                }}
                aria-label="Hide listing"
                className="p-2 rounded-none bg-background/90 backdrop-blur-sm hover:bg-background text-muted-foreground hover:text-foreground transition-colors shadow-sm border border-border"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <CardContent className="p-5 flex-1 flex flex-col gap-3">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                {listing.brand}
              </h3>
              {preferenceNickname && (
                <span className="text-[10px] uppercase tracking-widest text-primary font-semibold truncate max-w-[120px]">
                  {preferenceNickname}
                </span>
              )}
            </div>
            <p className="font-serif text-lg leading-snug mt-1 line-clamp-2">
              {listing.model ?? listing.title}
              {listing.style ? ` · ${listing.style}` : ""}
            </p>
          </div>

          {(listing.color || listing.size || listing.condition) && (
            <div className="flex flex-wrap gap-1.5">
              {listing.color && (
                <span className="text-[10px] uppercase tracking-wider bg-secondary/70 px-2 py-0.5 text-secondary-foreground border border-border/40">
                  {listing.color}
                </span>
              )}
              {listing.size && (
                <span className="text-[10px] uppercase tracking-wider bg-secondary/70 px-2 py-0.5 text-secondary-foreground border border-border/40">
                  {listing.size}
                </span>
              )}
              {listing.condition && (
                <span className="text-[10px] uppercase tracking-wider bg-secondary/70 px-2 py-0.5 text-secondary-foreground border border-border/40">
                  {listing.condition}
                </span>
              )}
            </div>
          )}

          {matchExplanation && (
            <div className="border-l-2 border-primary/40 pl-3 py-1 bg-primary/[0.04]">
              <p className="text-[10px] uppercase tracking-widest text-primary/80 font-bold mb-1">
                Why this matched
              </p>
              <p className="text-xs text-foreground/80 leading-relaxed line-clamp-3">
                {matchExplanation}
              </p>
            </div>
          )}

          {!matchExplanation && reasons.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {reasons.slice(0, 4).map((reason, i) => (
                <span
                  key={i}
                  className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-secondary-foreground"
                >
                  {reason.field}: {reason.value}
                </span>
              ))}
            </div>
          )}

          <div className="mt-auto pt-2 flex justify-between items-end">
            <div>
              <span className="text-2xl font-serif font-semibold text-foreground">
                {formatPrice(listing.price, listing.currency)}
              </span>
              {listing.originalPrice && listing.originalPrice > listing.price && (
                <span className="text-sm text-muted-foreground line-through ml-2">
                  {formatPrice(listing.originalPrice, listing.currency)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60 pt-2">
            <span className="flex items-center">
              <Clock className="w-3 h-3 mr-1" />
              First seen {formatDistanceToNow(firstSeen, { addSuffix: true })}
            </span>
            {wasUpdated && (
              <span>
                Updated {formatDistanceToNow(lastSeen, { addSuffix: true })}
              </span>
            )}
          </div>
        </CardContent>

        <CardFooter className="p-0 border-t border-border">
          <Button
            variant="ghost"
            className="w-full rounded-none h-12 text-primary hover:text-primary hover:bg-primary/5 transition-colors uppercase tracking-widest text-xs font-semibold"
            asChild
          >
            <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer">
              View on {listing.sourceName}
              <ExternalLink className="w-3 h-3 ml-2" />
            </a>
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
