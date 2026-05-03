import { useMemo, useState } from "react";
import { CheckCircle2, XCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useListAdminPreferences,
  getListAdminPreferencesQueryKey,
  useListAdminListings,
  getListAdminListingsQueryKey,
  useDebugMatch,
} from "@workspace/api-client-react";

type DebugResult = Awaited<ReturnType<ReturnType<typeof useDebugMatch>["mutateAsync"]>>;

export function MatchDebuggerSection() {
  const { toast } = useToast();
  const [preferenceId, setPreferenceId] = useState<string>("");
  const [listingId, setListingId] = useState<string>("");
  const [listingSearch, setListingSearch] = useState<string>("");
  const [result, setResult] = useState<DebugResult | null>(null);

  const { data: prefs, isLoading: prefsLoading } = useListAdminPreferences({
    query: { queryKey: getListAdminPreferencesQueryKey() },
  });

  const listingParams = useMemo(() => {
    const p: Record<string, string | number> = { limit: 25, availability: "all" };
    if (listingSearch.trim()) p.q = listingSearch.trim();
    return p;
  }, [listingSearch]);

  const { data: listings, isFetching: listingsFetching } = useListAdminListings(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listingParams as any,
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query: { queryKey: getListAdminListingsQueryKey(listingParams as any) },
    },
  );

  const debugMatch = useDebugMatch();

  const run = () => {
    const pid = parseInt(preferenceId, 10);
    const lid = parseInt(listingId, 10);
    if (Number.isNaN(pid) || Number.isNaN(lid)) {
      toast({
        variant: "destructive",
        title: "Pick both",
        description: "Choose a preference and a listing first.",
      });
      return;
    }
    debugMatch.mutate(
      { data: { preferenceId: pid, listingId: lid } },
      {
        onSuccess: (r) => setResult(r),
        onError: (err: unknown) => {
          toast({
            variant: "destructive",
            title: "Match debug failed",
            description: err instanceof Error ? err.message : "Could not run match engine.",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-none shadow-none border-border">
        <CardHeader className="bg-secondary/30 border-b border-border pb-4">
          <CardTitle className="font-serif text-xl">Match Debugger</CardTitle>
          <CardDescription>
            Pick any user preference and any listing — see exactly what the match engine
            scores, why it would alert (or wouldn't), and the resolved facts it saw.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
                Preference
              </label>
              <Select value={preferenceId} onValueChange={setPreferenceId}>
                <SelectTrigger
                  className="rounded-none"
                  data-testid="match-debugger-preference"
                >
                  <SelectValue
                    placeholder={prefsLoading ? "Loading…" : "Pick a preference"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {prefs?.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      <span className="truncate">
                        {p.nickname}
                        {p.userEmail ? ` · ${p.userEmail}` : ` · ${p.userId.slice(0, 8)}…`}
                        {!p.active ? " · (inactive)" : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
                Listing
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8 rounded-none mb-2"
                  placeholder="Search by title / brand / model"
                  value={listingSearch}
                  onChange={(e) => setListingSearch(e.target.value)}
                />
              </div>
              <Select value={listingId} onValueChange={setListingId}>
                <SelectTrigger
                  className="rounded-none"
                  data-testid="match-debugger-listing"
                >
                  <SelectValue
                    placeholder={listingsFetching ? "Loading…" : "Pick a listing"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {listings?.items.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      <span className="truncate">
                        #{l.id} · {l.brand} {l.model ?? ""} —{" "}
                        {l.currency === "USD" ? "$" : ""}
                        {l.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={run}
            disabled={debugMatch.isPending || !preferenceId || !listingId}
            className="rounded-none uppercase tracking-widest text-[10px]"
            data-testid="match-debugger-run"
          >
            {debugMatch.isPending ? "Running…" : "Run Match Engine"}
          </Button>
        </CardContent>
      </Card>

      {debugMatch.isPending && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-none" />
          <Skeleton className="h-48 w-full rounded-none" />
        </div>
      )}

      {result && !debugMatch.isPending && (
        <div className="space-y-6" data-testid="match-debugger-result">
          <Card className="rounded-none shadow-none border-border">
            <CardContent className="p-6 grid md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Score
                </p>
                <p className="text-3xl font-serif font-medium mt-1 tabular-nums">
                  {result.matchScore.toFixed(1)}
                  <span className="text-sm text-muted-foreground"> / 100</span>
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Match Type
                </p>
                <Badge
                  variant="outline"
                  className={
                    "rounded-none text-xs uppercase mt-2 " +
                    (result.matchType === "exact" || result.matchType === "strong"
                      ? "bg-green-500/10 text-green-600 border-green-500/20"
                      : result.matchType === "close"
                        ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                        : result.matchType === "weak"
                          ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
                          : "bg-destructive/10 text-destructive border-destructive/20")
                  }
                >
                  {result.matchType}
                </Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Alert Eligible
                </p>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  {result.alertEligible ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="text-green-600 font-medium">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-destructive" />
                      <span className="text-destructive font-medium">No</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Disqualifiers
                </p>
                <p className="text-3xl font-serif font-medium mt-1 tabular-nums">
                  {result.disqualifiers.length}
                </p>
              </div>
            </CardContent>
            <div className="border-t border-border bg-secondary/20 px-6 py-4">
              <p className="text-sm">{result.explanation}</p>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="rounded-none shadow-none border-border">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-sm uppercase tracking-widest font-semibold">
                  Match Reasons
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {result.matchReasons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No positive matches recorded.</p>
                ) : (
                  result.matchReasons.map((r, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm border-l-2 border-green-500/40 pl-3"
                    >
                      <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                      <div className="flex-1">
                        <p>
                          <span className="font-medium uppercase text-[10px] tracking-widest text-muted-foreground">
                            {r.field}
                          </span>{" "}
                          — {r.value}
                          {r.weight > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              (+{r.weight})
                            </span>
                          )}
                        </p>
                        {r.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5">{r.detail}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-none shadow-none border-border">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-sm uppercase tracking-widest font-semibold">
                  Disqualifiers
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {result.disqualifiers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No disqualifiers — every requested criterion matched.
                  </p>
                ) : (
                  result.disqualifiers.map((d, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 text-sm border-l-2 border-destructive/40 pl-3"
                    >
                      <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
                      <div className="flex-1">
                        <p>
                          <span className="font-medium uppercase text-[10px] tracking-widest text-muted-foreground">
                            {d.field}
                          </span>{" "}
                          — {d.value}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{d.reason}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="rounded-none shadow-none border-border">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-sm uppercase tracking-widest font-semibold">
                  Resolved Preference
                </CardTitle>
                <CardDescription className="text-xs">
                  {result.preference.nickname}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 text-xs space-y-1.5 font-mono">
                <KV k="brands" v={result.preference.brands.join(", ") || "—"} />
                <KV k="styles" v={result.preference.styles.join(", ") || "—"} />
                <KV k="colors" v={result.preference.colors.join(", ") || "—"} />
                <KV k="sizes" v={result.preference.sizes.join(", ") || "—"} />
                <KV
                  k="condition_min"
                  v={
                    result.preference.conditionMinName
                      ? `${result.preference.conditionMinName} (rank ${result.preference.conditionMinRank ?? "?"})`
                      : "—"
                  }
                />
                <KV
                  k="price"
                  v={`${result.preference.minPrice ?? "—"} → ${result.preference.maxPrice ?? "—"}`}
                />
                <KV
                  k="model_query"
                  v={
                    result.preference.exactModelEnabled
                      ? (result.preference.modelQuery ?? "(empty)")
                      : "(disabled)"
                  }
                />
                <KV
                  k="strict_mode"
                  v={result.preference.onlyExactCriteria ? "on" : "off"}
                />
                <KV
                  k="close_matches"
                  v={result.preference.allowCloseMatches ? "on" : "off"}
                />
                <KV
                  k="close_color"
                  v={result.preference.allowCloseColorMatch ? "on" : "off"}
                />
              </CardContent>
            </Card>

            <Card className="rounded-none shadow-none border-border">
              <CardHeader className="border-b border-border pb-3">
                <CardTitle className="text-sm uppercase tracking-widest font-semibold">
                  Resolved Listing
                </CardTitle>
                <CardDescription className="text-xs line-clamp-1">
                  {result.listing.title}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 text-xs space-y-1.5 font-mono">
                <KV k="brand" v={`${result.listing.brand} → ${result.listing.normalizedBrand}`} />
                <KV
                  k="model"
                  v={`${result.listing.model ?? "—"} → ${result.listing.normalizedModel ?? "—"}`}
                />
                <KV
                  k="style"
                  v={`${result.listing.style ?? "—"} → ${result.listing.normalizedStyle ?? "—"}`}
                />
                <KV
                  k="color"
                  v={`${result.listing.color ?? "—"} → ${result.listing.normalizedColor ?? "—"}`}
                />
                <KV k="color_family" v={result.listing.colorFamily ?? "—"} />
                <KV
                  k="size"
                  v={`${result.listing.size ?? "—"} → ${result.listing.normalizedSize ?? "—"}`}
                />
                <KV
                  k="condition"
                  v={
                    result.listing.condition
                      ? `${result.listing.condition} (rank ${result.listing.conditionRank ?? "?"})`
                      : "—"
                  }
                />
                <KV
                  k="price"
                  v={`${result.listing.currency} ${result.listing.price.toLocaleString()}`}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="break-words">{v}</span>
    </div>
  );
}
