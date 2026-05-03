import { useMemo, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useListAdminListings,
  getListAdminListingsQueryKey,
  useListSources,
  getListSourcesQueryKey,
} from "@workspace/api-client-react";
import { formatDistanceToNow } from "date-fns";

const PAGE_SIZE = 25;

type Filters = {
  q: string;
  source: string;
  brand: string;
  model: string;
  style: string;
  color: string;
  condition: string;
  minPrice: string;
  maxPrice: string;
  availability: "all" | "available" | "sold" | "reserved" | "unknown";
};

const EMPTY_FILTERS: Filters = {
  q: "",
  source: "all",
  brand: "",
  model: "",
  style: "",
  color: "",
  condition: "",
  minPrice: "",
  maxPrice: "",
  availability: "all",
};

export function ListingExplorerSection() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);

  const { data: sources } = useListSources({
    query: { queryKey: getListSourcesQueryKey() },
  });

  const params = useMemo(() => {
    const p: Record<string, string | number> = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      availability: applied.availability,
    };
    if (applied.q.trim()) p.q = applied.q.trim();
    if (applied.source !== "all") p.source = applied.source;
    if (applied.brand.trim()) p.brand = applied.brand.trim();
    if (applied.model.trim()) p.model = applied.model.trim();
    if (applied.style.trim()) p.style = applied.style.trim();
    if (applied.color.trim()) p.color = applied.color.trim();
    if (applied.condition.trim()) p.condition = applied.condition.trim();
    const minP = parseFloat(applied.minPrice);
    if (!Number.isNaN(minP) && minP >= 0) p.minPrice = minP;
    const maxP = parseFloat(applied.maxPrice);
    if (!Number.isNaN(maxP) && maxP >= 0) p.maxPrice = maxP;
    return p;
  }, [applied, page]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, isFetching } = useListAdminListings(params as any, {
    query: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryKey: getListAdminListingsQueryKey(params as any),
    },
  });

  const apply = () => {
    setApplied(draft);
    setPage(0);
  };

  const reset = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <Card className="rounded-none shadow-none border-border" data-testid="listing-explorer-filters">
        <CardHeader className="bg-secondary/30 border-b border-border pb-4">
          <CardTitle className="font-serif text-xl">Listing Explorer</CardTitle>
          <CardDescription>
            Search and filter every listing in the database — including sold or unavailable ones.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search title, brand, model, color…"
                className="pl-8 rounded-none"
                value={draft.q}
                onChange={(e) => setDraft({ ...draft, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                data-testid="listing-explorer-search"
              />
            </div>
            <Select
              value={draft.source}
              onValueChange={(v) => setDraft({ ...draft, source: v })}
            >
              <SelectTrigger className="rounded-none" data-testid="listing-explorer-source">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources?.map((s) => (
                  <SelectItem key={s.id} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={draft.availability}
              onValueChange={(v) =>
                setDraft({ ...draft, availability: v as Filters["availability"] })
              }
            >
              <SelectTrigger className="rounded-none" data-testid="listing-explorer-availability">
                <SelectValue placeholder="Availability" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All availability</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="reserved">Reserved</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Brand"
              className="rounded-none"
              value={draft.brand}
              onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              placeholder="Model"
              className="rounded-none"
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              placeholder="Style"
              className="rounded-none"
              value={draft.style}
              onChange={(e) => setDraft({ ...draft, style: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              placeholder="Color"
              className="rounded-none"
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              placeholder="Condition"
              className="rounded-none"
              value={draft.condition}
              onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              type="number"
              min={0}
              placeholder="Min price"
              className="rounded-none"
              value={draft.minPrice}
              onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <Input
              type="number"
              min={0}
              placeholder="Max price"
              className="rounded-none"
              value={draft.maxPrice}
              onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={apply}
              className="rounded-none uppercase tracking-widest text-[10px]"
              data-testid="listing-explorer-apply"
            >
              Apply Filters
            </Button>
            <Button
              variant="outline"
              onClick={reset}
              className="rounded-none uppercase tracking-widest text-[10px] border-border"
            >
              <X className="w-3 h-3 mr-2" /> Reset
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              {isFetching ? "Loading…" : `${total.toLocaleString()} listings`}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-none shadow-none border-border overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-none" />
              ))}
            </div>
          ) : !data || data.items.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No listings match these filters.
            </p>
          ) : (
            <Table data-testid="listing-explorer-table">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Listing
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Source
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Style / Color / Condition
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Price
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Last Seen
                  </TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((l) => (
                  <TableRow key={l.id} className="border-border hover:bg-secondary/20 align-top">
                    <TableCell className="max-w-[260px]">
                      <p className="font-medium line-clamp-2">{l.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {l.brand}
                        {l.model ? ` · ${l.model}` : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        #{l.id} · {l.sourceListingId}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.sourceName}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground space-y-0.5">
                      <p>{l.style ?? "—"}</p>
                      <p>{l.color ?? "—"}</p>
                      <p>{l.condition ?? "—"}</p>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {l.currency === "USD" ? "$" : ""}
                      {l.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          "rounded-none text-[10px] uppercase " +
                          (l.availabilityStatus === "available"
                            ? "bg-green-500/10 text-green-600 border-green-500/20"
                            : l.availabilityStatus === "sold"
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-muted text-muted-foreground border-border")
                        }
                      >
                        {l.availabilityStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(l.lastSeenAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <a
                        href={l.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        {data && data.items.length > 0 && (
          <div className="border-t border-border px-6 py-3 flex items-center justify-between text-xs">
            <p className="text-muted-foreground">
              Page {page + 1} of {totalPages.toLocaleString()} · {total.toLocaleString()} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="rounded-none uppercase tracking-widest text-[10px] border-border"
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-none uppercase tracking-widest text-[10px] border-border"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
