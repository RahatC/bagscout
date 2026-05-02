import { useRoute, Link } from "wouter";
import { ArrowLeft, Play, Pause, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetBagPreference,
  useGetPreferenceMatches,
  useUpdateBagPreference,
  useDeleteBagPreference,
  getGetBagPreferenceQueryKey,
  getGetPreferenceMatchesQueryKey,
  getListBagPreferencesQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";
import { EmptyState } from "@/components/empty-state";
import { WatchlistSuggestions } from "@/components/watchlist-suggestions";
import { formatDistanceToNow } from "date-fns";

export default function WatchlistDetailPage() {
  const [, params] = useRoute("/watchlists/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pref, isLoading: isPrefLoading } = useGetBagPreference(id, {
    query: { enabled: !!id, queryKey: getGetBagPreferenceQueryKey(id) },
  });

  const { data: matches, isLoading: isMatchesLoading } = useGetPreferenceMatches(id, {
    query: { enabled: !!id, queryKey: getGetPreferenceMatchesQueryKey(id) },
  });

  const updatePref = useUpdateBagPreference();
  const deletePref = useDeleteBagPreference();

  const handleToggleStatus = () => {
    if (!pref) return;
    updatePref.mutate(
      { id, data: { active: !pref.active } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetBagPreferenceQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getListBagPreferencesQueryKey() });
          toast({
            title: updated.active ? "Watchlist Resumed" : "Watchlist Paused",
            description: updated.active
              ? "We're scanning for matches again."
              : "You won't receive alerts for this watchlist.",
          });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this watchlist?")) return;
    deletePref.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBagPreferencesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Watchlist Deleted", description: "The watchlist has been removed." });
          window.location.href = "/watchlists";
        },
      },
    );
  };

  if (isPrefLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-none" />
          <Skeleton className="h-10 w-64 rounded-none" />
        </div>
        <Skeleton className="h-32 w-full rounded-none" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-80 w-full rounded-none" />
          ))}
        </div>
      </div>
    );
  }

  if (!pref) return <div>Watchlist not found</div>;

  const brandsLabel = pref.brands.map((b) => b.name).join(", ") || "Any";
  const stylesLabel = pref.styles.map((s) => s.name).join(", ") || "Any";
  const colorsLabel = pref.colors.map((c) => c.name).join(", ") || "Any";
  const sizesLabel = pref.sizes.map((s) => s.name).join(", ") || "Any";

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/watchlists">
            <Button variant="ghost" size="icon" className="rounded-none border border-border">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-serif font-medium">{pref.nickname}</h1>
              <Badge
                variant={pref.active ? "default" : "secondary"}
                className={`rounded-none uppercase tracking-wider text-[10px] ${
                  pref.active ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {pref.active ? "Active" : "Paused"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Created {formatDistanceToNow(new Date(pref.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            onClick={handleToggleStatus}
            disabled={updatePref.isPending}
            className="rounded-none uppercase tracking-widest text-xs font-semibold flex-1 md:flex-none"
          >
            {pref.active ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause Alerts
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Resume Alerts
              </>
            )}
          </Button>
          <Button
            variant="outline"
            className="rounded-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={handleDelete}
            disabled={deletePref.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Brands
          </p>
          <p className="font-serif font-medium">{brandsLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Styles
          </p>
          <p className="font-serif font-medium">{stylesLabel}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Colors / Sizes
          </p>
          <p className="font-serif font-medium">
            {colorsLabel} / {sizesLabel}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">
            Price Range
          </p>
          <p className="font-serif font-medium">
            {pref.minPrice ? `$${pref.minPrice.toLocaleString()}` : "$0"} —{" "}
            {pref.maxPrice ? `$${pref.maxPrice.toLocaleString()}` : "Any"}
          </p>
        </div>
      </div>

      <WatchlistSuggestions
        preferenceId={pref.id}
        currentSizeIds={pref.sizes.map((s) => s.id)}
      />

      <div>
        <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
          <h2 className="text-2xl font-serif font-medium">
            Matches ({pref.matchCount})
          </h2>
        </div>

        {isMatchesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 w-full rounded-none" />
            ))}
          </div>
        ) : matches && matches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matches.map((match, index) => (
              <ListingCard
                key={match.id}
                listing={match.listing}
                matchScore={match.matchScore}
                matchReasons={match.matchReasons}
                index={index}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No matches yet"
            description="We haven't found any items matching your criteria yet. We're constantly scanning, so we'll alert you when one appears."
          />
        )}
      </div>
    </div>
  );
}
