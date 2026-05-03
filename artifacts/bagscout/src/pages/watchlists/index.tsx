import { Link, useLocation } from "wouter";
import { Plus, List as ListIcon, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  useListBagPreferences,
  getListBagPreferencesQueryKey,
} from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

export default function WatchlistsPage() {
  const [, setLocation] = useLocation();
  const { data: preferences, isLoading } = useListBagPreferences({
    query: { queryKey: getListBagPreferencesQueryKey() },
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-serif font-medium mb-2">Watchlists</h1>
          <p className="text-muted-foreground">Manage your scouting criteria and active alerts.</p>
        </div>
        <Button
          onClick={() => setLocation("/watchlists/new")}
          className="rounded-none uppercase tracking-widest text-xs font-semibold px-6"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Watchlist
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48 w-full rounded-none" />
          ))}
        </div>
      ) : preferences && preferences.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {preferences.map((pref, index) => (
            <motion.div
              key={pref.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                href={`/watchlists/${pref.id}`}
                className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open watchlist ${pref.nickname}`}
              >
              <Card className="rounded-none border-border shadow-none hover:border-primary/50 transition-colors h-full">
                <CardContent className="p-6 h-full flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-serif font-bold text-xl mb-1">{pref.nickname}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {pref.brands.slice(0, 3).map((b) => (
                          <span
                            key={b.id}
                            className="uppercase tracking-widest text-[10px] font-bold text-primary"
                          >
                            {b.name}
                          </span>
                        ))}
                        {pref.brands.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{pref.brands.length - 3} more
                          </span>
                        )}
                        {pref.modelQuery && (
                          <span className="text-xs">• "{pref.modelQuery}"</span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={pref.active ? "default" : "secondary"}
                      className={`rounded-none uppercase tracking-wider text-[10px] ${
                        pref.active ? "bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {pref.active ? "Active" : "Paused"}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {pref.colors.slice(0, 3).map((c) => (
                      <Badge
                        key={c.id}
                        variant="outline"
                        className="rounded-none font-normal text-xs"
                      >
                        {c.name}
                      </Badge>
                    ))}
                    {pref.conditionMin && (
                      <Badge variant="outline" className="rounded-none font-normal text-xs">
                        Min {pref.conditionMin.name}
                      </Badge>
                    )}
                    {pref.maxPrice && (
                      <Badge variant="outline" className="rounded-none font-normal text-xs">
                        Under ${pref.maxPrice.toLocaleString()}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-auto pt-6 flex items-center justify-between border-t border-border mt-4">
                    <div className="flex items-center text-sm font-medium">
                      <ShieldCheck className="mr-2 h-4 w-4 text-primary" />
                      {pref.matchCount} Matches
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Updated {formatDistanceToNow(new Date(pref.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ListIcon className="w-10 h-10 text-primary" />}
          title="No watchlists yet"
          description="Create your first watchlist to start monitoring resale marketplaces for your desired items."
          actionLabel="Create Watchlist"
          actionHref="/watchlists/new"
        />
      )}
    </div>
  );
}
