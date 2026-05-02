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
  ShoppingBag,
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
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";
import { useListAlerts } from "@workspace/api-client-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: alerts } = useListAlerts(
    { unreadOnly: true },
    {
      query: {
        queryKey: ["/api/alerts", { unreadOnly: true }] as const,
        enabled: !!user,
      },
    },
  );

  const unreadCount = alerts?.length ?? 0;

  const navigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Watchlists", href: "/watchlists", icon: List },
    { name: "Browse Listings", href: "/listings", icon: Search },
    { name: "Alerts", href: "/alerts", icon: Bell, badge: unreadCount },
    { name: "Saved", href: "/saved", icon: Bookmark },
  ];

  const adminNavigation = [{ name: "System Status", href: "/admin", icon: Settings }];

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

      <div className="mt-8 pt-6 border-t border-border">
        <p className="px-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground mb-2">
          Admin
        </p>
        {adminNavigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={`flex items-center rounded-none px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
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
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        <div className="h-20 flex items-center px-6 border-b border-border">
          <Link href="/dashboard">
            <span className="font-serif text-2xl font-bold tracking-tight cursor-pointer">
              BagScout
            </span>
          </Link>
        </div>
        <nav className="flex-1 px-4 py-6" aria-label="Main navigation">
          <NavLinks />
        </nav>
        <div className="p-4 border-t border-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left">
                <Avatar className="h-8 w-8 rounded-none">
                  <AvatarImage src={user?.imageUrl} />
                  <AvatarFallback className="rounded-none bg-primary text-primary-foreground text-xs">
                    {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user?.fullName || user?.firstName || "Account"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-none">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 h-16 bg-card border-b border-border flex items-center justify-between px-4">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-none"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 rounded-none">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="h-20 flex items-center px-6 border-b border-border">
              <span className="font-serif text-2xl font-bold tracking-tight">BagScout</span>
            </div>
            <nav className="px-4 py-6" aria-label="Main navigation">
              <NavLinks />
            </nav>
          </SheetContent>
        </Sheet>
        <Link href="/dashboard">
          <span className="font-serif text-xl font-bold">BagScout</span>
        </Link>
        <div className="w-10" />
      </div>

      {/* Main */}
      <main className="flex-1 lg:pt-0 pt-16">
        <div className="container mx-auto px-6 py-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
