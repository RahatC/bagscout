import { useState } from "react";
import { Search, Filter, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { 
  useListListings, 
  getListListingsQueryKey,
  useSaveListing,
  useUnsaveListing
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ListingCard } from "@/components/listing-card";
import { useDebounce } from "@/hooks/use-debounce";

export default function ListingsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  
  // Minimal filter state for demonstration
  const [brandFilter, setBrandFilter] = useState<string | undefined>(undefined);
  
  const { data: listingsData, isLoading } = useListListings({
    brand: brandFilter || debouncedSearch || undefined, // Simple search maps to brand for now
    limit: 24
  }, {
    query: {
      queryKey: getListListingsQueryKey({ brand: brandFilter || debouncedSearch || undefined, limit: 24 })
    }
  });

  const saveListing = useSaveListing();
  const unsaveListing = useUnsaveListing();
  const queryClient = useQueryClient();

  const handleSaveToggle = (id: number, currentlySaved: boolean) => {
    // In a real app we'd need to know if it's saved. The mock API doesn't return isSaved on the listing object.
    // So this is a stub for the save functionality on the browse page.
    saveListing.mutate({ data: { listingId: id } }, {
      onSuccess: () => {
        // Invalidate saved listings
      }
    });
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border pb-6">
        <div className="w-full md:w-auto">
          <h1 className="text-3xl font-serif font-medium mb-2">Browse the Network</h1>
          <p className="text-muted-foreground">Discover authenticated pieces from our trusted partners.</p>
        </div>
        
        <div className="flex w-full md:w-auto gap-2">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by brand..." 
              className="pl-9 rounded-none h-12 border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="rounded-none h-12 px-4 border-border">
                <SlidersHorizontal className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline uppercase tracking-widest text-xs font-semibold">Filter</span>
              </Button>
            </SheetTrigger>
            <SheetContent className="rounded-none border-l border-border">
              <SheetHeader>
                <SheetTitle className="font-serif">Filters</SheetTitle>
              </SheetHeader>
              <div className="py-6 space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-widest font-semibold mb-3">Brand</h4>
                  <div className="space-y-2">
                    {["Hermès", "Chanel", "Louis Vuitton", "Dior"].map(brand => (
                      <label key={brand} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input 
                          type="radio" 
                          name="brand" 
                          checked={brandFilter === brand}
                          onChange={() => setBrandFilter(brand)}
                          className="accent-primary"
                        />
                        {brand}
                      </label>
                    ))}
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                      <input 
                        type="radio" 
                        name="brand" 
                        checked={!brandFilter}
                        onChange={() => setBrandFilter(undefined)}
                      />
                      All Brands
                    </label>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-[400px] w-full rounded-none" />
          ))}
        </div>
      ) : listingsData?.items && listingsData.items.length > 0 ? (
        <>
          <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">
            Showing {listingsData.total} results
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {listingsData.items.map((listing, index) => (
              <ListingCard 
                key={listing.id} 
                listing={listing} 
                index={index}
                onSaveToggle={handleSaveToggle}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-32 border border-dashed border-border bg-card/50">
          <Search className="w-10 h-10 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-serif text-xl font-medium mb-2">No listings found</h3>
          <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
        </div>
      )}
    </div>
  );
}
