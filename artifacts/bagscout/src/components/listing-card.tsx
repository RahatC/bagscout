import { motion } from "framer-motion";
import { ExternalLink, Bookmark, ShieldCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { Listing, MatchReason } from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

interface ListingCardProps {
  listing: Listing;
  matchScore?: number;
  matchReasons?: MatchReason[];
  isSaved?: boolean;
  onSaveToggle?: (id: number, currentlySaved: boolean) => void;
  index?: number;
}

export function ListingCard({
  listing,
  matchScore,
  matchReasons,
  isSaved = false,
  onSaveToggle,
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Card className="overflow-hidden rounded-none border border-border group hover:border-primary/50 transition-all duration-300 h-full flex flex-col bg-card">
        <div className="relative aspect-square overflow-hidden bg-secondary/30">
          {listing.imageUrl ? (
            <img
              src={listing.imageUrl}
              alt={`${listing.brand} ${listing.model || ""}`}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500 ease-out"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-secondary/20">
              No Image
            </div>
          )}

          <div className="absolute top-3 left-3 flex flex-col gap-2">
            <Badge
              className={`rounded-none font-semibold ${getSourceColor(listing.sourceName)} border-none shadow-sm`}
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              {listing.sourceName}
            </Badge>

            {matchScore !== undefined && (
              <Badge
                variant="outline"
                className="rounded-none bg-background/95 backdrop-blur-sm border-primary/20 text-primary font-bold shadow-sm self-start"
              >
                {Math.round(matchScore * 100)}% Match
              </Badge>
            )}
          </div>

          {onSaveToggle && (
            <button
              onClick={(e) => {
                e.preventDefault();
                onSaveToggle(listing.id, isSaved);
              }}
              className="absolute top-3 right-3 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background text-foreground transition-colors shadow-sm"
            >
              <Bookmark className={`w-4 h-4 ${isSaved ? "fill-primary text-primary" : ""}`} />
            </button>
          )}
        </div>

        <CardContent className="p-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-bold text-sm tracking-widest uppercase text-muted-foreground">
                {listing.brand}
              </h3>
              <p className="font-serif text-lg leading-tight mt-1 line-clamp-2">
                {listing.model} {listing.style ? `- ${listing.style}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-auto pt-4 flex flex-col gap-3">
            {reasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {reasons.slice(0, 3).map((reason, i) => (
                  <span
                    key={i}
                    className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-secondary-foreground"
                  >
                    {reason.field}: {reason.value}
                  </span>
                ))}
                {reasons.length > 3 && (
                  <span className="text-[10px] uppercase tracking-wider bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                    +{reasons.length - 3} more
                  </span>
                )}
              </div>
            )}

            <div className="flex justify-between items-end">
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
              {listing.condition && (
                <Badge
                  variant="outline"
                  className="rounded-none border-border text-xs uppercase tracking-wider font-normal"
                >
                  {listing.condition}
                </Badge>
              )}
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <Clock className="w-3 h-3 mr-1" />
              Listed {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
            </div>
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
