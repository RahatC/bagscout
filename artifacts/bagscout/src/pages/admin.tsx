import { useState } from "react";
import { Activity, RefreshCw, ServerCrash, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { 
  useListSources, 
  getListSourcesQueryKey,
  useTriggerIngest
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

export default function AdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sources, isLoading } = useListSources({
    query: {
      queryKey: getListSourcesQueryKey()
    }
  });

  const triggerIngest = useTriggerIngest();
  const [ingestingSource, setIngestingSource] = useState<string | null>(null);

  const handleIngest = (slug: string, name: string) => {
    setIngestingSource(slug);
    triggerIngest.mutate({ data: { sourceSlug: slug } }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
        toast({
          title: "Ingestion Complete",
          description: `Successfully synced ${result.listingsAdded} new listings from ${name} in ${Math.round(result.durationMs / 1000)}s.`,
        });
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "Ingestion Failed",
          description: error.message || `Failed to sync with ${name}.`,
        });
      },
      onSettled: () => {
        setIngestingSource(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'healthy': 
        return <Badge variant="outline" className="rounded-none bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" /> Healthy</Badge>;
      case 'degraded': 
        return <Badge variant="outline" className="rounded-none bg-yellow-500/10 text-yellow-600 border-yellow-500/20"><AlertTriangle className="w-3 h-3 mr-1" /> Degraded</Badge>;
      case 'error': 
        return <Badge variant="outline" className="rounded-none bg-destructive/10 text-destructive border-destructive/20"><ServerCrash className="w-3 h-3 mr-1" /> Error</Badge>;
      default: 
        return <Badge variant="outline" className="rounded-none text-muted-foreground border-border">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-8 pb-10 max-w-5xl mx-auto">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-serif font-medium mb-2">System Status</h1>
        <p className="text-muted-foreground">Monitor marketplace integrations and data ingestion health.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="rounded-none shadow-none border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Active Sources</p>
                <p className="text-2xl font-serif font-medium mt-1">
                  {sources?.filter(s => s.isActive).length || 0} <span className="text-sm text-muted-foreground font-sans">/ {sources?.length || 0}</span>
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
                <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Total Listings</p>
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
          <CardDescription>Status of the data pipelines feeding the scouting engine.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-none" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">Source</TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">Status</TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">Listings</TableHead>
                  <TableHead className="uppercase tracking-widest text-[10px] font-semibold">Last Sync</TableHead>
                  <TableHead className="text-right uppercase tracking-widest text-[10px] font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources?.map((source) => (
                  <TableRow key={source.id} className="border-border hover:bg-secondary/20">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {source.name}
                        {!source.isActive && <Badge variant="secondary" className="text-[10px] uppercase rounded-none">Disabled</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(source.status)}</TableCell>
                    <TableCell>{source.listingCount.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {source.lastIngestAt ? formatDistanceToNow(new Date(source.lastIngestAt), { addSuffix: true }) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={!source.isActive || ingestingSource === source.slug}
                        onClick={() => handleIngest(source.slug, source.name)}
                        className="rounded-none uppercase tracking-widest text-[10px] border-border"
                      >
                        <RefreshCw className={`w-3 h-3 mr-2 ${ingestingSource === source.slug ? 'animate-spin' : ''}`} />
                        {ingestingSource === source.slug ? 'Syncing...' : 'Force Sync'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}