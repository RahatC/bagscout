import { useState } from "react";
import { Link } from "wouter";
import { Bell, Check, CheckCircle2, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { 
  useListAlerts, 
  getListAlertsQueryKey,
  useMarkAlertRead,
  useMarkAllAlertsRead
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { motion } from "framer-motion";

export default function AlertsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useListAlerts(
    { unreadOnly: unreadOnly || undefined }, 
    {
      query: {
        queryKey: getListAlertsQueryKey({ unreadOnly: unreadOnly || undefined })
      }
    }
  );

  const markRead = useMarkAlertRead();
  const markAllRead = useMarkAllAlertsRead();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      }
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
      }
    });
  };

  const getAlertIcon = (type: string) => {
    switch(type) {
      case 'new_match': return <ShieldCheck className="h-5 w-5 text-primary" />;
      case 'price_drop': return <div className="h-5 w-5 text-green-500 font-bold">↓</div>;
      case 'back_in_stock': return <Clock className="h-5 w-5 text-blue-500" />;
      default: return <Bell className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-8 pb-10 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-serif font-medium mb-2">Alerts</h1>
          <p className="text-muted-foreground">Notifications for your active watchlists.</p>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center space-x-2">
            <Switch 
              id="unread-only" 
              checked={unreadOnly} 
              onCheckedChange={setUnreadOnly} 
              className="data-[state=checked]:bg-primary"
            />
            <Label htmlFor="unread-only" className="text-xs uppercase tracking-widest font-semibold cursor-pointer">Unread Only</Label>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending || !alerts?.some(a => !a.isRead)}
            className="rounded-none uppercase tracking-widest text-[10px] font-semibold border-border"
          >
            <CheckCircle2 className="mr-2 h-3 w-3" /> Mark all read
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-none" />
          ))}
        </div>
      ) : alerts && alerts.length > 0 ? (
        <div className="space-y-4">
          {alerts.map((alert, index) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className={`rounded-none shadow-none transition-colors ${!alert.isRead ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'}`}>
                <CardContent className="p-0 flex flex-col sm:flex-row">
                  {/* Alert Content */}
                  <div className="flex-1 p-6 flex items-start gap-4">
                    <div className={`mt-1 p-2 rounded-full ${!alert.isRead ? 'bg-background shadow-sm' : 'bg-secondary'}`}>
                      {getAlertIcon(alert.type)}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                            {alert.type.replace('_', ' ')}
                          </span>
                          {!alert.isRead && <span className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                      
                      <p className="text-sm font-medium mb-3">{alert.message}</p>
                      
                      {alert.watchlistId && (
                        <Link href={`/watchlists/${alert.watchlistId}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors flex items-center">
                          Watchlist: {alert.watchlistName}
                        </Link>
                      )}
                    </div>
                  </div>
                  
                  {/* Listing Preview if available */}
                  {alert.listing && (
                    <div className="sm:w-64 border-t sm:border-t-0 sm:border-l border-border bg-card/50 flex flex-col">
                      <Link href={`/listings/${alert.listing.id}`} className="flex-1 p-4 flex gap-4 hover:bg-secondary/50 transition-colors group cursor-pointer">
                        <div className="w-16 h-16 bg-secondary shrink-0 overflow-hidden border border-border">
                          {alert.listing.imageUrl && (
                            <img src={alert.listing.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">{alert.listing.brand}</p>
                          <p className="text-sm font-serif truncate mb-1">{alert.listing.model}</p>
                          <p className="text-sm font-semibold">
                            ${alert.listing.price.toLocaleString()}
                          </p>
                        </div>
                      </Link>
                    </div>
                  )}
                  
                  {/* Mark Read Action */}
                  {!alert.isRead && (
                    <div className="border-t sm:border-t-0 sm:border-l border-border">
                      <Button 
                        variant="ghost" 
                        className="w-full h-full rounded-none hover:bg-primary/10 text-primary text-xs uppercase tracking-widest px-6"
                        onClick={() => handleMarkRead(alert.id)}
                      >
                        <Check className="h-4 w-4 sm:mr-0 sm:mb-1" />
                        <span className="sm:sr-only">Mark Read</span>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      ) : (
        <EmptyState 
          icon={<Bell className="w-10 h-10 text-muted-foreground" />}
          title="No alerts"
          description={unreadOnly ? "You have no unread alerts at the moment." : "You haven't received any alerts yet. Ensure your watchlists are active."}
        />
      )}
    </div>
  );
}