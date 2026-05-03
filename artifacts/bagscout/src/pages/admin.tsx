import { useState } from "react";
import {
  Activity,
  RefreshCw,
  ServerCrash,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  useListSources,
  getListSourcesQueryKey,
  useTriggerIngest,
  useUpdateSource,
  useListIngestionLogs,
  getListIngestionLogsQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sources, isLoading } = useListSources({
    query: { queryKey: getListSourcesQueryKey() },
  });

  const { data: logs } = useListIngestionLogs(
    { limit: 20 },
    { query: { queryKey: getListIngestionLogsQueryKey({ limit: 20 }) } },
  );

  const triggerIngest = useTriggerIngest();
  const updateSource = useUpdateSource();
  const [ingestingSource, setIngestingSource] = useState<string | null>(null);
  const [cadenceDraft, setCadenceDraft] = useState<Record<string, string>>({});

  const commitCadence = (slug: string, currentValue: number) => {
    const raw = cadenceDraft[slug];
    if (raw == null) return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 1 || next > 1440) {
      toast({
        variant: "destructive",
        title: "Invalid cadence",
        description: "Cadence must be a whole number between 1 and 1440 minutes.",
      });
      setCadenceDraft((d) => {
        const { [slug]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    if (Math.round(next) === currentValue) {
      setCadenceDraft((d) => {
        const { [slug]: _drop, ...rest } = d;
        return rest;
      });
      return;
    }
    updateSource.mutate(
      { slug, data: { cadenceMinutes: Math.round(next) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          toast({
            title: "Cadence updated",
            description: `${slug} will now poll every ${Math.round(next)} min.`,
          });
        },
        onError: (error: unknown) => {
          toast({
            variant: "destructive",
            title: "Update failed",
            description: error instanceof Error ? error.message : "Could not update cadence.",
          });
        },
        onSettled: () => {
          setCadenceDraft((d) => {
            const { [slug]: _drop, ...rest } = d;
            return rest;
          });
        },
      },
    );
  };

  const handleIngest = (slug: string, name: string) => {
    setIngestingSource(slug);
    triggerIngest.mutate(
      { data: { sourceSlug: slug } },
      {
        onSuccess: (result) => {
          queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListIngestionLogsQueryKey({ limit: 20 }) });
          toast({
            title: "Ingestion Complete",
            description: `Synced ${result.listingsAdded} new + ${result.listingsUpdated} updated from ${name} in ${Math.round(result.durationMs / 1000)}s.`,
          });
        },
        onError: (error: unknown) => {
          toast({
            variant: "destructive",
            title: "Ingestion Failed",
            description: error instanceof Error ? error.message : `Failed to sync with ${name}.`,
          });
        },
        onSettled: () => setIngestingSource(null),
      },
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
      case "success":
        return (
          <Badge
            variant="outline"
            className="rounded-none bg-green-500/10 text-green-600 border-green-500/20"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> {status === "healthy" ? "Healthy" : "Success"}
          </Badge>
        );
      case "degraded":
      case "partial":
        return (
          <Badge
            variant="outline"
            className="rounded-none bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
          >
            <AlertTriangle className="w-3 h-3 mr-1" /> {status === "degraded" ? "Degraded" : "Partial"}
          </Badge>
        );
      case "error":
      case "failed":
        return (
          <Badge
            variant="outline"
            className="rounded-none bg-destructive/10 text-destructive border-destructive/20"
          >
            <ServerCrash className="w-3 h-3 mr-1" /> {status === "failed" ? "Failed" : "Error"}
          </Badge>
        );
      case "running":
        return (
          <Badge variant="outline" className="rounded-none bg-blue-500/10 text-blue-600 border-blue-500/20">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Running
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="rounded-none text-muted-foreground border-border">
            {status || "Unknown"}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-8 pb-10 max-w-5xl mx-auto">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-serif font-medium mb-2">System Status</h1>
        <p className="text-muted-foreground">
          Monitor marketplace integrations and data ingestion health.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="rounded-none shadow-none border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Active Sources
                </p>
                <p className="text-2xl font-serif font-medium mt-1">
                  {sources?.filter((s) => s.active).length || 0}{" "}
                  <span className="text-sm text-muted-foreground font-sans">
                    / {sources?.length || 0}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none shadow-none border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary rounded-full">
                <ShieldCheck className="w-6 h-6 text-foreground" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                  Total Listings
                </p>
                <p className="text-2xl font-serif font-medium mt-1">
                  {sources?.reduce((acc, s) => acc + s.listingCount, 0).toLocaleString() || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-none shadow-none border-border overflow-hidden">
        <CardHeader className="bg-secondary/30 border-b border-border pb-4">
          <CardTitle className="font-serif text-xl">Marketplace Integrations</CardTitle>
          <CardDescription>
            Status of the data pipelines feeding the scouting engine.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-none" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Source
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Type
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Listings
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Cadence
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Last Sync
                  </TableHead>
                  <TableHead className="text-right uppercase tracking-widest text-[10px] font-semibold">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources?.map((source) => (
                  <TableRow key={source.id} className="border-border hover:bg-secondary/20">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {source.name}
                        {!source.active && (
                          <Badge variant="secondary" className="text-[10px] uppercase rounded-none">
                            Disabled
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground uppercase tracking-wider">
                      {source.ingestionMode}
                    </TableCell>
                    <TableCell>{getStatusBadge(source.status)}</TableCell>
                    <TableCell>{source.listingCount.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          value={cadenceDraft[source.slug] ?? source.cadenceMinutes}
                          onChange={(e) =>
                            setCadenceDraft((d) => ({ ...d, [source.slug]: e.target.value }))
                          }
                          onBlur={() => commitCadence(source.slug, source.cadenceMinutes)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            } else if (e.key === "Escape") {
                              setCadenceDraft((d) => {
                                const { [source.slug]: _drop, ...rest } = d;
                                return rest;
                              });
                              e.currentTarget.blur();
                            }
                          }}
                          disabled={updateSource.isPending}
                          className="h-8 w-16 rounded-none text-sm"
                        />
                        <span className="text-xs">min</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.lastIngestAt
                        ? formatDistanceToNow(new Date(source.lastIngestAt), { addSuffix: true })
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!source.active || ingestingSource === source.slug}
                        onClick={() => handleIngest(source.slug, source.name)}
                        className="rounded-none uppercase tracking-widest text-[10px] border-border"
                      >
                        <RefreshCw
                          className={`w-3 h-3 mr-2 ${
                            ingestingSource === source.slug ? "animate-spin" : ""
                          }`}
                        />
                        {ingestingSource === source.slug ? "Syncing..." : "Force Sync"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {logs && logs.length > 0 && (
        <Card className="rounded-none shadow-none border-border overflow-hidden">
          <CardHeader className="bg-secondary/30 border-b border-border pb-4">
            <CardTitle className="font-serif text-xl">Recent Ingestion Activity</CardTitle>
            <CardDescription>Last 20 ingestion runs across all sources.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Source
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Seen / New / Updated
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">
                    Started
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="border-border">
                    <TableCell className="font-medium">
                      {log.sourceName ??
                        (log.jobType === "scheduled_digest"
                          ? "Digest"
                          : log.jobType === "scheduled_run"
                            ? "Scheduled run"
                            : "—")}
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="text-sm">
                      {log.recordsSeen} / {log.recordsCreated} / {log.recordsUpdated}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
