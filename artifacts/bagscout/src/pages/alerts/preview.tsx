import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Bookmark,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetAlertPreview,
  getGetAlertPreviewQueryKey,
  useSaveListing,
  getListSavedListingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const fmt = (n: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function AlertPreviewPage() {
  const [, params] = useRoute("/alerts/:id/preview");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: preview, isLoading } = useGetAlertPreview(id, {
    query: { enabled: !!id, queryKey: getGetAlertPreviewQueryKey(id) },
  });

  const saveListing = useSaveListing();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto pb-10 space-y-6">
        <Skeleton className="h-10 w-40 rounded-none" />
        <Skeleton className="h-[600px] w-full rounded-none" />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="max-w-3xl mx-auto pb-10">
        <p>Alert preview not found.</p>
      </div>
    );
  }

  const handleSave = () => {
    saveListing.mutate(
      { data: { listingId: preview.listing.id } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSavedListingsQueryKey() });
          toast({ title: "Saved", description: "Added to your saved items." });
        },
      },
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-10 space-y-6">
      <Link href="/alerts">
        <Button
          variant="ghost"
          className="rounded-none uppercase tracking-widest text-xs font-semibold pl-0 hover:bg-transparent"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to alerts
        </Button>
      </Link>

      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
        Email preview · this is what we would send to your inbox.
      </p>

      <div className="border border-border bg-card shadow-sm">
        {/* Email-style header */}
        <div className="border-b border-border p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">
            Subject
          </div>
          <p className="font-serif text-xl font-medium">{preview.subject}</p>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span>From BagScout</span>
            <span>·</span>
            <span>
              {formatDistanceToNow(new Date(preview.createdAt), { addSuffix: true })}
            </span>
            {preview.preferenceNickname && (
              <>
                <span>·</span>
                <span>Watchlist: {preview.preferenceNickname}</span>
              </>
            )}
          </div>
        </div>

        {/* Email body */}
        <div className="p-8 space-y-6">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-serif text-2xl font-medium">{preview.heading}</h2>
          </div>

          {preview.whyNow && (
            <div className="border-l-2 border-primary pl-4 py-2 bg-primary/5">
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold mb-1">
                Why now
              </p>
              <p className="text-sm">{preview.whyNow}</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-6 border border-border p-4">
            <div className="aspect-square bg-secondary/30 overflow-hidden">
              {preview.listing.imageUrl ? (
                <img
                  src={preview.listing.imageUrl}
                  alt={`${preview.listing.brand} ${preview.listing.model ?? ""}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  No image
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  {preview.listing.brand}
                </p>
                <p className="font-serif text-lg leading-snug">
                  {preview.listing.model ?? preview.listing.title}
                  {preview.listing.style ? ` · ${preview.listing.style}` : ""}
                </p>
              </div>
              <div className="text-3xl font-serif font-semibold">
                {fmt(preview.listing.price, preview.listing.currency)}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {preview.listing.condition && (
                  <Badge
                    variant="outline"
                    className="rounded-none uppercase tracking-wider text-[10px]"
                  >
                    {preview.listing.condition}
                  </Badge>
                )}
                {preview.listing.color && (
                  <Badge
                    variant="outline"
                    className="rounded-none uppercase tracking-wider text-[10px]"
                  >
                    {preview.listing.color}
                  </Badge>
                )}
                {preview.listing.size && (
                  <Badge
                    variant="outline"
                    className="rounded-none uppercase tracking-wider text-[10px]"
                  >
                    {preview.listing.size}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="w-3 h-3" />
                {preview.listing.sourceName}
              </div>
            </div>
          </div>

          <div className="border border-border p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
              Why this matched
            </p>
            <p className="text-sm leading-relaxed">{preview.whyMatched}</p>
            {preview.matchScore != null && (
              <p className="text-[11px] uppercase tracking-widest text-primary font-bold mt-3">
                Match score · {Math.round(preview.matchScore * 100)}%
                {preview.matchType ? ` · ${preview.matchType}` : ""}
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            <Button
              className="rounded-none h-12 uppercase tracking-widest text-xs font-semibold"
              asChild
            >
              <a href={preview.listingUrl} target="_blank" rel="noopener noreferrer">
                View on {preview.listing.sourceName}
                <ExternalLink className="ml-2 w-3 h-3" />
              </a>
            </Button>
            <Button
              variant="outline"
              className="rounded-none h-12 uppercase tracking-widest text-xs font-semibold border-border"
              onClick={handleSave}
              disabled={saveListing.isPending}
            >
              <Bookmark className="mr-2 w-3 h-3" />
              Save for later
            </Button>
          </div>
        </div>

        <div className="border-t border-border p-4 text-[11px] text-muted-foreground text-center">
          You're receiving this because{" "}
          {preview.preferenceNickname ? (
            <>
              your watchlist <strong>{preview.preferenceNickname}</strong> matched.
            </>
          ) : (
            <>a watchlist of yours matched.</>
          )}
        </div>
      </div>
    </div>
  );
}
