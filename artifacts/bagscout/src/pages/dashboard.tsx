import { Link } from "wouter";
import { ArrowRight, Bell, Bookmark, Search, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  useGetDashboardSummary, 
  useGetRecentMatches, 
  useGetPriceDrops,
  getGetDashboardSummaryQueryKey,
  getGetRecentMatchesQueryKey
} from "@workspace/api-client-react";
import { ListingCard } from "@/components/listing-card";
import { EmptyState } from "@/components/empty-state";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function DashboardPage() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey()
    }
  });

  const { data: recentMatches, isLoading: isMatchesLoading } = useGetRecentMatches({ limit: 4 }, {
    query: {
      queryKey: getGetRecentMatchesQueryKey({ limit: 4 })
    }
  });

  if (isSummaryLoading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-48 mb-2 rounded-none" />
          <Skeleton className="h-5 w-64 rounded-none" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32 w-full rounded-none" />
          ))}
        </div>
        <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96 w-full rounded-none" />
          <Skeleton className="h-96 w-full rounded-none" />
        </div>
      </div>
    );
  }

  // If no watchlists exist, show welcome state
  if (summary && summary.watchlistCount === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-serif font-medium mb-4">Welcome to BagScout.</h1>
          <p className="text-xl text-muted-foreground">Your premium scouting tool for luxury handbags.</p>
        </div>
        
        <EmptyState 
          icon={<Search className="w-10 h-10 text-primary" />}
          title="Create your first watchlist"
          description="Tell us what you're looking for, and we'll monitor authenticated resale marketplaces to alert you the moment a match appears."
          actionLabel="Create Watchlist"
          actionHref="/onboarding"
        />
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-serif font-medium mb-2">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your scouting activity.</p>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-none border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Active Watchlists</h3>
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-serif font-medium">{summary?.activeWatchlistCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              of {summary?.watchlistCount || 0} total
            </p>
          </CardContent>
        </Card>
        
        <Card className="rounded-none border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Total Matches</h3>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-serif font-medium">{summary?.totalMatchCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1 text-primary font-medium">
              +{summary?.newMatchCount || 0} new this week
            </p>
          </CardContent>
        </Card>
        
        <Card className="rounded-none border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Unread Alerts</h3>
              <Bell className={`h-4 w-4 ${summary?.unreadAlertCount ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div className="text-3xl font-serif font-medium">{summary?.unreadAlertCount || 0}</div>
            {summary && summary.unreadAlertCount > 0 ? (
              <Link href="/alerts" className="text-xs text-primary hover:underline mt-1 inline-block">
                View alerts
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">You're all caught up</p>
            )}
          </CardContent>
        </Card>
        
        <Card className="rounded-none border-border shadow-none">
          <CardContent className="p-6">
            <div className="flex flex-row items-center justify-between space-y-0 pb-2">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Saved Items</h3>
              <Bookmark className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-3xl font-serif font-medium">{summary?.savedCount || 0}</div>
            <Link href="/saved" className="text-xs text-muted-foreground hover:text-foreground mt-1 inline-block transition-colors">
              View saved
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        {/* Recent Matches */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-medium">Recent Matches</h2>
            <Link href="/watchlists">
              <Button variant="link" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                View All <ArrowRight className="ml-1 w-3 h-3" />
              </Button>
            </Link>
          </div>
          
          {isMatchesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-80 w-full rounded-none" />
              <Skeleton className="h-80 w-full rounded-none" />
            </div>
          ) : recentMatches && recentMatches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {recentMatches.map((match, i) => (
                <ListingCard 
                  key={match.id} 
                  listing={match.listing} 
                  matchScore={match.score}
                  matchReasons={match.matchReasons}
                  index={i}
                />
              ))}
            </div>
          ) : (
            <Card className="rounded-none border-dashed bg-card/50 shadow-none">
              <CardContent className="p-12 text-center">
                <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No recent matches found.</p>
                <p className="text-sm text-muted-foreground/80 mb-6">
                  We'll notify you as soon as something matches your watchlists.
                </p>
                <Link href="/watchlists/new">
                  <Button variant="outline" className="rounded-none uppercase tracking-widest text-xs">
                    Create New Watchlist
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar Content */}
        <div className="space-y-8">
          <Card className="rounded-none border-border shadow-none">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Scouted Brands</CardTitle>
            </CardHeader>
            <CardContent>
              {summary?.topBrands && summary.topBrands.length > 0 ? (
                <div className="space-y-4">
                  {summary.topBrands.map((brand, i) => (
                    <motion.div 
                      key={brand.brand}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center justify-between"
                    >
                      <span className="font-serif">{brand.brand}</span>
                      <span className="text-xs font-semibold bg-secondary px-2 py-1">{brand.count}</span>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data available yet.</p>
              )}
            </CardContent>
          </Card>
          
          <Card className="rounded-none border-border shadow-none bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">Pro Tip</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                For the highest chance of securing a highly sought-after piece, ensure your <strong>max price</strong> reflects current market reality. Items priced significantly below market rate are often in poor condition or sell within minutes.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}