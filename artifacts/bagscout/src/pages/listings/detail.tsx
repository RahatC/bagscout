import { useRoute, Link } from "wouter";
import { ArrowLeft, Bookmark, ExternalLink, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { 
  useGetListing, 
  getGetListingQueryKey,
  useSaveListing,
  useUnsaveListing
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export default function ListingDetailPage() {
  const [, params] = useRoute("/listings/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: listing, isLoading } = useGetListing(id, {
    query: {
      enabled: !!id,
      queryKey: getGetListingQueryKey(id)
    }
  });

  const saveListing = useSaveListing();
  const unsaveListing = useUnsaveListing();

  // Mock saved state since it's not on the listing model
  const isSaved = false;

  const handleSaveToggle = () => {
    if (isSaved) {
      unsaveListing.mutate({ id }, {
        onSuccess: () => {
          toast({
            title: "Listing Removed",
            description: "Listing removed from your saved items.",
          });
        }
      });
    } else {
      saveListing.mutate({ data: { listingId: id } }, {
        onSuccess: () => {
          toast({
            title: "Listing Saved",
            description: "Listing added to your saved items.",
          });
        }
      });
    }
  };

  const getSourceColor = (sourceName: string) => {
    switch (sourceName?.toLowerCase()) {
      case 'fashionphile': return 'bg-gray-900 text-white';
      case 'rebag': return 'bg-rose-900 text-white';
      case 'the realreal': return 'bg-neutral-800 text-white';
      case "yoogi's closet": return 'bg-stone-700 text-white';
      default: return 'bg-primary text-primary-foreground';
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(price);
  };

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-none" />
          <Skeleton className="h-6 w-32 rounded-none" />
        </div>
        <div className="grid md:grid-cols-2 gap-12">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-6">
            <Skeleton className="h-8 w-1/4 rounded-none" />
            <Skeleton className="h-12 w-3/4 rounded-none" />
            <Skeleton className="h-10 w-1/3 rounded-none" />
            <Skeleton className="h-32 w-full rounded-none" />
          </div>
        </div>
      </div>
    );
  }

  if (!listing) return <div>Listing not found</div>;

  return (
    <div className="max-w-5xl mx-auto pb-10 space-y-8">
      <Link href="/listings">
        <Button variant="ghost" className="rounded-none uppercase tracking-widest text-xs font-semibold pl-0 hover:bg-transparent">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to listings
        </Button>
      </Link>

      <div className="grid md:grid-cols-2 gap-12">
        {/* Image Column */}
        <div className="space-y-4">
          <div className="aspect-square bg-secondary/30 relative border border-border">
            {listing.imageUrl ? (
              <img 
                src={listing.imageUrl} 
                alt={`${listing.brand} ${listing.model || ''}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No Image Available
              </div>
            )}
            
            <Badge className={`absolute top-4 left-4 rounded-none font-semibold ${getSourceColor(listing.sourceName)} border-none shadow-sm text-sm py-1.5 px-3`}>
              <ShieldCheck className="w-4 h-4 mr-2" />
              {listing.sourceName}
            </Badge>
          </div>
        </div>

        {/* Details Column */}
        <div className="flex flex-col">
          <div className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
              {listing.brand}
            </h2>
            <h1 className="text-3xl md:text-4xl font-serif font-medium leading-tight mb-4">
              {listing.model} {listing.style ? `- ${listing.style}` : ''}
            </h1>
            
            <div className="flex items-end gap-4 mb-6">
              <span className="text-3xl font-serif font-semibold text-foreground">
                {formatPrice(listing.price, listing.currency)}
              </span>
              {listing.originalPrice && listing.originalPrice > listing.price && (
                <span className="text-lg text-muted-foreground line-through pb-1">
                  {formatPrice(listing.originalPrice, listing.currency)}
                </span>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2 mb-8">
              <Badge variant="outline" className="rounded-none border-border font-normal text-xs uppercase tracking-wider py-1 px-3">
                Condition: {listing.condition}
              </Badge>
              {listing.color && (
                <Badge variant="outline" className="rounded-none border-border font-normal text-xs uppercase tracking-wider py-1 px-3">
                  Color: {listing.color}
                </Badge>
              )}
              {listing.size && (
                <Badge variant="outline" className="rounded-none border-border font-normal text-xs uppercase tracking-wider py-1 px-3">
                  Size: {listing.size}
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <Button 
              className="w-full h-14 rounded-none uppercase tracking-widest text-sm font-semibold"
              asChild
            >
              <a href={listing.listingUrl} target="_blank" rel="noopener noreferrer">
                View on {listing.sourceName}
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
            
            <Button 
              variant="outline"
              className="w-full h-14 rounded-none uppercase tracking-widest text-sm font-semibold border-border"
              onClick={handleSaveToggle}
              disabled={saveListing.isPending || unsaveListing.isPending}
            >
              <Bookmark className={`w-4 h-4 mr-2 ${isSaved ? 'fill-primary text-primary' : ''}`} />
              {isSaved ? 'Saved to collection' : 'Save for later'}
            </Button>
          </div>

          {listing.description && (
            <div className="mt-8 pt-8 border-t border-border">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-4">Description</h3>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>
          )}
          
          <div className="mt-auto pt-8 flex items-center text-xs text-muted-foreground">
            <Clock className="w-3 h-3 mr-2" />
            Listed {formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}
            <span className="mx-2">•</span>
            External ID: {listing.externalId}
          </div>
        </div>
      </div>
    </div>
  );
}