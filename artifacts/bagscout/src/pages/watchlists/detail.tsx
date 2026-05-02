import { useRoute, Link } from "wouter";
import { ArrowLeft, Play, Pause, Trash2, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useGetWatchlist, 
  useGetWatchlistMatches, 
  useUpdateWatchlist, 
  useDeleteWatchlist,
  getGetWatchlistQueryKey,
  getGetWatchlistMatchesQueryKey,
  getListWatchlistsQueryKey,
  getGetDashboardSummaryQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";
import { EmptyState } from "@/components/empty-state";
import { formatDistanceToNow } from "date-fns";

export default function WatchlistDetailPage() {
  const [, params] = useRoute("/watchlists/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: watchlist, isLoading: isWatchlistLoading } = useGetWatchlist(id, {
    query: {
      enabled: !!id,
      queryKey: getGetWatchlistQueryKey(id)
    }
  });

  const { data: matchesData, isLoading: isMatchesLoading } = useGetWatchlistMatches(id, undefined, {
    query: {
      enabled: !!id,
      queryKey: getGetWatchlistMatchesQueryKey(id)
    }
  });

  const updateWatchlist = useUpdateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();

  const handleToggleStatus = () => {
    if (!watchlist) return;
    
    updateWatchlist.mutate(
      { id, data: { isActive: !watchlist.isActive } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetWatchlistQueryKey(id), updated);
          queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
          toast({
            title: updated.isActive ? "Watchlist Resumed" : "Watchlist Paused",
            description: updated.isActive ? "We're scanning for matches again." : "You won't receive alerts for this watchlist.",
          });
        }
      }
    );
  };

  const handleDelete = () => {
    if (!confirm("Are you sure you want to delete this watchlist?")) return;
    
    deleteWatchlist.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListWatchlistsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: "Watchlist Deleted",
            description: "The watchlist has been removed.",
          });
          window.location.href = "/watchlists"; // Using window.location for hard navigation to avoid useLocation hook context issues
        }
      }
    );
  };

  if (isWatchlistLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-none" />
          <Skeleton className="h-10 w-64 rounded-none" />
        </div>
        <Skeleton className="h-32 w-full rounded-none" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-80 w-full rounded-none" />)}
        </div>
      </div>
    );
  }

  if (!watchlist) {
    return <div>Watchlist not found</div>;
  }

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
              <h1 className="text-3xl font-serif font-medium">{watchlist.name}</h1>
              <Badge variant={watchlist.isActive ? "default" : "secondary"} className={`rounded-none uppercase tracking-wider text-[10px] ${watchlist.isActive ? 'bg-primary text-primary-foreground' : ''}`}>
                {watchlist.isActive ? 'Active' : 'Paused'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Created {formatDistanceToNow(new Date(watchlist.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button 
            variant="outline" 
            onClick={handleToggleStatus} 
            disabled={updateWatchlist.isPending}
            className="rounded-none uppercase tracking-widest text-xs font-semibold flex-1 md:flex-none"
          >
            {watchlist.isActive ? <><Pause className="mr-2 h-4 w-4" /> Pause Alerts</> : <><Play className="mr-2 h-4 w-4" /> Resume Alerts</>}
          </Button>
          <Button 
            variant="outline" 
            className="rounded-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            onClick={handleDelete}
            disabled={deleteWatchlist.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Criteria Summary */}
      <div className="bg-card border border-border p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Brand</p>
          <p className="font-serif font-medium">{watchlist.brand}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Model / Style</p>
          <p className="font-serif font-medium">{watchlist.model || 'Any'} {watchlist.style ? `/ ${watchlist.style}` : ''}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Color / Size</p>
          <p className="font-serif font-medium">{watchlist.color || 'Any'} {watchlist.size ? `/ ${watchlist.size}` : ''}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Price Range</p>
          <p className="font-serif font-medium">
            {watchlist.minPrice ? `$${watchlist.minPrice}` : '$0'} - {watchlist.maxPrice ? `$${watchlist.maxPrice}` : 'Any'}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
          <h2 className="text-2xl font-serif font-medium">Matches ({watchlist.matchCount})</h2>
        </div>

        {isMatchesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 w-full rounded-none" />
            ))}
          </div>
        ) : matchesData?.items && matchesData.items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {matchesData.items.map((match, index) => (
              <ListingCard 
                key={match.id} 
                listing={match.listing} 
                matchScore={match.score}
                matchReasons={match.matchReasons}
                index={index}
              />
            ))}
          </div>
        ) : (
          <EmptyState 
            title="No matches yet"
            description="We haven't found any items matching your exact criteria yet. We're constantly scanning, so we'll alert you when one appears."
          />
        )}
      </div>
    </div>
  );
}