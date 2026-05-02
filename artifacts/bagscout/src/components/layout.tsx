import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { 
  Bell, 
  Bookmark, 
  LayoutDashboard, 
  List, 
  Search, 
  Settings,
  LogOut,
  Menu,
  ShoppingBag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useListAlerts } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Use non-throwing query to get unread alert count
  const { data: alerts } = useListAlerts({ unreadOnly: true }, {
    query: {
      queryKey: ["/api/alerts", { unreadOnly: true }] as const,
      enabled: !!user
    }
  });
  
  const unreadCount = alerts?.length || 0;

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Watchlists", href: "/watchlists", icon: List },
    { name: "Browse Listings", href: "/listings", icon: Search },
    { name: "Alerts", href: "/alerts", icon: Bell, badge: unreadCount },
    { name: "Saved", href: "/saved", icon: Bookmark },
  ];

  const adminNavigation = [
    { name: "System Status", href: "/admin", icon: Settings },
  ];

  const NavLinks = () => (
    <>
      <div className="space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={`flex items-center justify-between rounded-none px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <div className="flex items-center">
                  <item.icon
                    className={`mr-3 h-4 w-4 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {item.name}
                </div>
                {item.badge && item.badge > 0 ? (
                  <span className="bg-primary text-primary-foreground px-2 py-0.5 rounded-full text-xs font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
      
      <div className="mt-8">
        <h4 className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Administration
        </h4>
        <div className="space-y-1">
          {adminNavigation.map((item) => {
            const isActive = location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-none transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <item.icon
                    className={`mr-3 h-4 w-4 flex-shrink-0 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
            <span className="font-serif text-2xl font-bold tracking-tight">BagScout</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto py-6 px-3">
          <NavLinks />
        </div>
        
        <div className="border-t border-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="w-full flex items-center justify-start px-2 py-6 hover:bg-muted rounded-none">
                <Avatar className="h-8 w-8 mr-3 rounded-none">
                  <AvatarImage src={user?.imageUrl} />
                  <AvatarFallback className="rounded-none bg-primary/20 text-primary">
                    {user?.firstName?.charAt(0) || user?.username?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-sm font-medium truncate w-full">{user?.fullName || user?.username || "User"}</span>
                  <span className="text-xs text-muted-foreground truncate w-full">{user?.primaryEmailAddress?.emailAddress}</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-none border-border">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="text-destructive cursor-pointer rounded-none focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile header and content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border bg-card">
          <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
            <span className="font-serif text-xl font-bold tracking-tight">BagScout</span>
          </Link>
          
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[80%] p-0 rounded-none border-r border-border">
              <div className="flex flex-col h-full bg-card">
                <div className="flex h-16 items-center px-6 border-b border-border">
                  <span className="font-serif text-2xl font-bold tracking-tight">BagScout</span>
                </div>
                <div className="flex-1 overflow-y-auto py-6 px-3">
                  <NavLinks />
                </div>
                <div className="border-t border-border p-4">
                  <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => signOut()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-6xl p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}