import { useState } from "react";
import { Link } from "wouter";
import { Bookmark, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { 
  useListSavedListings, 
  getListSavedListingsQueryKey,
  useUnsaveListing
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";

export default function SavedPage() {
  const queryClient = useQueryClient();

  const { data: savedListings, isLoading } = useListSavedListings({
    query: {
      queryKey: getListSavedListingsQueryKey()
    }
  });

  const unsaveListing = useUnsaveListing();

  const handleUnsave = (id: number) => {
    unsaveListing.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSavedListingsQueryKey() });
      }
    });
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-serif font-medium mb-2">Saved Collection</h1>
        <p className="text-muted-foreground">Items you've bookmarked for later consideration.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[400px] w-full rounded-none" />
          ))}
        </div>
      ) : savedListings && savedListings.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            {savedListings.length} items saved
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {savedListings.map((saved, index) => (
              <ListingCard 
                key={saved.id} 
                listing={saved.listing} 
                index={index}
                isSaved={true}
                onSaveToggle={(id) => handleUnsave(id)}
              />
            ))}
          </div>
        </>
      ) : (
        <EmptyState 
          icon={<Bookmark className="w-10 h-10 text-muted-foreground" />}
          title="No saved items"
          description="You haven't saved any listings yet. Browse available pieces and bookmark the ones you love."
          actionLabel="Browse Listings"
          actionHref="/listings"
        />
      )}
    </div>
  );
}