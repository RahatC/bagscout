import { Link } from "wouter";
import { ExternalLink, TrendingDown } from "lucide-react";
import {
  useGetSimilarCheaperListings,
  getGetSimilarCheaperListingsQueryKey,
} from "@workspace/api-client-react";

interface SimilarCheaperProps {
  listingId: number;
  basePrice: number;
  currency: string;
}

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n);

export function SimilarCheaper({ listingId, basePrice, currency }: SimilarCheaperProps) {
  const { data, isLoading } = useGetSimilarCheaperListings(
    listingId,
    { limit: 6 },
    {
      query: {
        enabled: !!listingId,
        queryKey: getGetSimilarCheaperListingsQueryKey(listingId, { limit: 6 }),
      },
    },
  );

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <TrendingDown className="w-4 h-4 text-emerald-700" />
        <h3 className="text-sm font-bold uppercase tracking-widest">Similar but cheaper</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        Same brand and style, lower price than this listing.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {data.map((l) => {
          const savings = basePrice - l.price;
          const savingsPct = basePrice > 0 ? Math.round((savings / basePrice) * 100) : 0;
          return (
            <Link
              key={l.id}
              href={`/listings/${l.id}`}
              className="border border-border bg-card hover:border-primary/40 transition-colors group flex flex-col"
            >
              <div className="aspect-square bg-secondary/30 overflow-hidden">
                {l.imageUrl ? (
                  <img
                    src={l.imageUrl}
                    alt={`${l.brand} ${l.model ?? ""}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                    No image
                  </div>
                )}
              </div>
              <div className="p-3 flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold truncate">
                  {l.sourceName}
                </span>
                <span className="font-serif text-sm leading-snug line-clamp-2">
                  {l.model ?? l.title}
                </span>
                <div className="flex items-end justify-between mt-1">
                  <span className="font-serif font-semibold">{fmt(l.price, l.currency)}</span>
                  {savings > 0 && (
                    <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">
                      −{savingsPct}%
                    </span>
                  )}
                </div>
              </div>
              <span className="border-t border-border px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground flex items-center justify-end gap-1">
                View listing
                <span className="sr-only">: {l.brand} {l.model ?? l.title}</span>
                <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
