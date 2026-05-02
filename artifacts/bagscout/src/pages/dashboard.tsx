import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import {
  ArrowRight,
  Bell,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Bookmark,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetRecentMatches,
  useListBagPreferences,
  useUpdateBagPreference,
  useListSavedListings,
  useSaveListing,
  useUnsaveListing,
  useListAlerts,
  useMarkAlertRead,
  getGetDashboardSummaryQueryKey,
  getGetRecentMatchesQueryKey,
  getListBagPreferencesQueryKey,
  getListSavedListingsQueryKey,
  getListAlertsQueryKey,
} from "@workspace/api-client-react";
import type { BagPreference } from "@workspace/api-client-react";
import { ListingCard } from "@/components/listing-card";
import { WatchlistSummaryCard } from "@/components/watchlist-summary-card";
import { EmptyState } from "@/components/empty-state";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

const HIDDEN_KEY = "bagscout:hidden-listings";

function loadHidden(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as number[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveHidden(ids: Set<number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ids)));
}

export default function DashboardPage() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState<Set<number>>(() => loadHidden());

  useEffect(() => {
    saveHidden(hidden);
  }, [hidden]);

  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey() },
  });

  const { data: preferences, isLoading: isPrefsLoading } = useListBagPreferences({
    query: { queryKey: getListBagPreferencesQueryKey() },
  });

  const { data: recentMatches, isLoading: isMatchesLoading } = useGetRecentMatches(
    { limit: 12 },
    { query: { queryKey: getGetRecentMatchesQueryKey({ limit: 12 }) } },
  );

  const { data: savedListings } = useListSavedListings({
    query: { queryKey: getListSavedListingsQueryKey() },
  });

  const { data: alerts, isLoading: isAlertsLoading } = useListAlerts(
    {},
    { query: { queryKey: getListAlertsQueryKey({}) } },
  );

  const updatePref = useUpdateBagPreference();
  const saveMutation = useSaveListing();
  const unsaveMutation = useUnsaveListing();
  const markRead = useMarkAlertRead();

  const savedIds = useMemo(
    () => new Set(savedListings?.map((s) => s.listing.id) ?? []),
    [savedListings],
  );

  const handleToggleActive = (id: number, active: boolean) => {
    const prefsKey = getListBagPreferencesQueryKey();
    const previous = queryClient.getQueryData<BagPreference[]>(prefsKey);
    if (previous) {
      queryClient.setQueryData<BagPreference[]>(
        prefsKey,
        previous.map((p) => (p.id === id ? { ...p, active } : p)),
      );
    }
    updatePref.mutate(
      { id, data: { active } },
      {
        onError: () => {
          if (previous) queryClient.setQueryData(prefsKey, previous);
        },
        onSettled: () => {
          queryClient.invalidateQueries({ queryKey: getListBagPreferencesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  const handleSaveToggle = (listingId: number, currentlySaved: boolean) => {
    if (currentlySaved) {
      unsaveMutation.mutate(
        { listingId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSavedListingsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          },
        },
      );
    } else {
      saveMutation.mutate(
        { data: { listingId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListSavedListingsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          },
        },
      );
    }
  };

  const handleHide = (listingId: number) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(listingId);
      return next;
    });
  };

  const visibleMatches = useMemo(
    () => (recentMatches ?? []).filter((m) => !hidden.has(m.listing.id)),
    [recentMatches, hidden],
  );

  const recentAlerts = useMemo(
    () => (alerts ?? []).slice(0, 5),
    [alerts],
  );

  const isUnreadAlert = (status: string) =>
    status !== "read" && status !== "dismissed";

  const greeting = user?.firstName
    ? `Welcome back, ${user.firstName}.`
    : "Welcome back.";

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isSummaryLoading) {
    return (
      <div className="space-y-12 pb-10">
        <div>
          <Skeleton className="h-12 w-72 mb-3 rounded-none" />
          <Skeleton className="h-5 w-96 rounded-none" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-none" />
          ))}
        </div>
        <Skeleton className="h-96 w-full rounded-none" />
      </div>
    );
  }

  // ── First-run empty (no watchlists) ────────────────────────────────────
  if (summary && summary.preferenceCount === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-serif font-medium mb-4">{greeting}</h1>
          <p className="text-xl text-muted-foreground">
            Your premium scouting tool for luxury handbags.
          </p>
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

  const watchingCount = summary?.preferenceCount ?? 0;
  const activeCount = summary?.activePreferenceCount ?? 0;
  const matchCount = summary?.totalMatchCount ?? 0;
  const newMatchCount = summary?.newMatchCount ?? 0;
  const unreadCount = summary?.unreadAlertCount ?? 0;

  return (
    <div className="space-y-14 pb-16">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-border pb-8">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-serif font-medium tracking-tight mb-3"
          >
            {greeting}
          </motion.h1>
          <p className="text-base text-muted-foreground">
            <span className="font-semibold text-foreground">
              Watching {watchingCount} bag profile{watchingCount === 1 ? "" : "s"}
            </span>
            {activeCount !== watchingCount && (
              <span className="text-muted-foreground"> · {activeCount} active</span>
            )}
            <span className="mx-2 text-border">·</span>
            <span>
              {matchCount} match{matchCount === 1 ? "" : "es"} found
            </span>
            {newMatchCount > 0 && (
              <span className="text-primary font-semibold"> · {newMatchCount} new this week</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {unreadCount > 0 && (
            <Button
              asChild
              variant="outline"
              className="rounded-none uppercase tracking-widest text-xs font-semibold border-primary/30 text-primary hover:bg-primary/5"
            >
              <Link href="/alerts">
                <Bell className="w-4 h-4 mr-2" />
                {unreadCount} new alert{unreadCount === 1 ? "" : "s"}
              </Link>
            </Button>
          )}
          <Button
            asChild
            className="rounded-none uppercase tracking-widest text-xs font-semibold px-6 h-11"
          >
            <Link href="/watchlists/new">
              <Plus className="w-4 h-4 mr-2" />
              Add Watchlist
            </Link>
          </Button>
        </div>
      </header>

      {/* ── Active Watchlists ─────────────────────────────────────────── */}
      <section className="space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-2">
              Section 01
            </p>
            <h2 className="text-2xl font-serif font-medium">Your watchlists</h2>
          </div>
          <Link href="/watchlists">
            <Button
              variant="link"
              className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground px-0"
            >
              Manage all <ArrowRight className="ml-1 w-3 h-3" />
            </Button>
          </Link>
        </div>

        {isPrefsLoading ? (
          <div className="grid gap-6 md:grid-cols-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-none" />
            ))}
          </div>
        ) : preferences && preferences.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {preferences.slice(0, 4).map((p, i) => (
              <WatchlistSummaryCard
                key={p.id}
                preference={p}
                onToggleActive={handleToggleActive}
                index={i}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Search className="w-8 h-8 text-primary" />}
            title="No watchlists yet"
            description="Create a watchlist to start scouting authenticated resale marketplaces."
            actionLabel="Create Watchlist"
            actionHref="/watchlists/new"
          />
        )}
      </section>

      {/* ── Best Matches + Alert Feed ─────────────────────────────────── */}
      <section className="grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* Best matches */}
        <div className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-2">
                Section 02
              </p>
              <h2 className="text-2xl font-serif font-medium">Best matches for you</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ranked by how closely each listing matches your criteria.
              </p>
            </div>
            <Link href="/listings">
              <Button
                variant="link"
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground px-0"
              >
                Browse all <ArrowRight className="ml-1 w-3 h-3" />
              </Button>
            </Link>
          </div>

          {isMatchesLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-96 w-full rounded-none" />
              ))}
            </div>
          ) : visibleMatches.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {visibleMatches.slice(0, 6).map((match, i) => (
                <ListingCard
                  key={match.id}
                  listing={match.listing}
                  matchScore={match.matchScore}
                  matchType={match.matchType}
                  matchExplanation={match.matchExplanation}
                  matchReasons={match.matchReasons}
                  preferenceNickname={match.preferenceNickname}
                  isSaved={savedIds.has(match.listing.id)}
                  onSaveToggle={handleSaveToggle}
                  onHide={handleHide}
                  index={i}
                />
              ))}
            </div>
          ) : (
            <Card className="rounded-none border-dashed border-border bg-card/50 shadow-none">
              <CardContent className="p-12 text-center">
                <Sparkles className="w-10 h-10 text-muted-foreground/40 mx-auto mb-4" />
                <h3 className="font-serif text-xl mb-2">
                  {hidden.size > 0 && (recentMatches?.length ?? 0) > 0
                    ? "All matches hidden"
                    : "No matches yet"}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
                  {hidden.size > 0 && (recentMatches?.length ?? 0) > 0
                    ? "You've hidden every match in your feed. Try refreshing or broadening your criteria."
                    : "We haven't found anything matching your criteria yet. Try broadening your watchlists — enable close color matches or raise your max price — and we'll keep scouting."}
                </p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-none uppercase tracking-widest text-xs"
                  >
                    <Link href="/watchlists">Adjust watchlists</Link>
                  </Button>
                  {hidden.size > 0 && (
                    <Button
                      onClick={() => setHidden(new Set())}
                      variant="ghost"
                      className="rounded-none uppercase tracking-widest text-xs"
                    >
                      Reset hidden
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Alert feed */}
        <aside className="space-y-6">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-2">
                Section 03
              </p>
              <h2 className="text-2xl font-serif font-medium">Alert feed</h2>
            </div>
            <Link href="/alerts">
              <Button
                variant="link"
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground px-0"
              >
                All <ArrowRight className="ml-1 w-3 h-3" />
              </Button>
            </Link>
          </div>

          {isAlertsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-none" />
              ))}
            </div>
          ) : recentAlerts.length > 0 ? (
            <div className="border border-border bg-card divide-y divide-border">
              {recentAlerts.map((alert, i) => {
                const unread = isUnreadAlert(alert.status);
                return (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`p-4 ${unread ? "bg-primary/[0.03]" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                          unread ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                            {alert.alertType.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(alert.createdAt), {
                              addSuffix: true,
                            })}
                          </span>
                        </div>
                        {alert.listing && (
                          <Link
                            href={`/listings/${alert.listing.id}`}
                            className="block group"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate group-hover:text-foreground transition-colors">
                              {alert.listing.brand}
                            </p>
                            <p className="font-serif text-sm leading-tight truncate group-hover:text-primary transition-colors">
                              {alert.listing.model ?? alert.listing.title}
                            </p>
                            <div className="flex items-center justify-between mt-1.5">
                              <span className="text-sm font-semibold">
                                ${alert.listing.price.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                {alert.listing.sourceName}
                              </span>
                            </div>
                          </Link>
                        )}
                        {!alert.listing && alert.message && (
                          <p className="text-sm text-foreground/80">{alert.message}</p>
                        )}
                        {alert.preferenceNickname && (
                          <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                            via {alert.preferenceNickname}
                          </p>
                        )}
                        {unread && (
                          <button
                            onClick={() =>
                              markRead.mutate(
                                { id: alert.id },
                                {
                                  onSuccess: () => {
                                    queryClient.invalidateQueries({
                                      queryKey: getListAlertsQueryKey(),
                                    });
                                    queryClient.invalidateQueries({
                                      queryKey: getGetDashboardSummaryQueryKey(),
                                    });
                                  },
                                },
                              )
                            }
                            className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-border bg-card/50 p-8 text-center">
              <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                No alerts yet. We'll notify you the moment a strong match arrives.
              </p>
            </div>
          )}

          {/* Quick stats */}
          <Card className="rounded-none border-border shadow-none">
            <CardContent className="p-5 space-y-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold">
                At a glance
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 mr-2 text-primary" /> Total matches
                  </span>
                  <span className="font-serif text-lg">{matchCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center text-muted-foreground">
                    <Bell className="w-3.5 h-3.5 mr-2 text-primary" /> Unread alerts
                  </span>
                  <span className="font-serif text-lg">{unreadCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm flex items-center text-muted-foreground">
                    <Bookmark className="w-3.5 h-3.5 mr-2 text-primary" /> Saved
                  </span>
                  <Link
                    href="/saved"
                    className="font-serif text-lg hover:text-primary transition-colors"
                  >
                    {summary?.savedCount ?? 0}
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {summary?.topBrands && summary.topBrands.length > 0 && (
            <Card className="rounded-none border-border shadow-none">
              <CardContent className="p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground font-bold mb-3">
                  Top scouted brands
                </p>
                <div className="space-y-2">
                  {summary.topBrands.slice(0, 5).map((b) => (
                    <div
                      key={b.brand}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="font-serif">{b.brand}</span>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                        {b.count} watchlist{b.count === 1 ? "" : "s"}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </section>
    </div>
  );
}
