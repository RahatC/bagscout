import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Search, Bell, ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGetFeaturedListings } from "@workspace/api-client-react";
import { ListingCard } from "@/components/listing-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LandingPage() {
  const { data: featuredListings, isLoading } = useGetFeaturedListings({
    query: {
      queryKey: ["/api/listings/featured"] as const,
    }
  });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="container mx-auto px-6 h-24 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-serif text-2xl font-bold tracking-tight">BagScout</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in">
            <Button variant="ghost" className="rounded-none uppercase tracking-widest text-xs font-semibold">
              Sign In
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="rounded-none uppercase tracking-widest text-xs font-semibold px-6">
              Create Account
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6">
        <div className="container mx-auto max-w-6xl relative z-10">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <h1 className="font-serif text-5xl md:text-7xl leading-[1.1] font-medium tracking-tight text-foreground mb-6">
                Never miss <br />
                <span className="italic text-primary">the one.</span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed mb-10 max-w-lg">
                The Bloomberg terminal for luxury handbags. Set precise alerts across trusted resale marketplaces and secure your holy grail before anyone else.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/sign-up">
                  <Button size="lg" className="rounded-none h-14 px-8 uppercase tracking-widest text-sm font-semibold w-full sm:w-auto">
                    Start Scouting
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
              
              <div className="mt-12 flex items-center gap-6 text-sm text-muted-foreground font-medium tracking-wider uppercase">
                <span className="flex items-center"><ShieldCheck className="w-4 h-4 mr-2" /> Authenticated</span>
                <span className="flex items-center"><Bell className="w-4 h-4 mr-2" /> Real-time</span>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-[4/5] bg-secondary/50 p-8 flex items-center justify-center relative">
                {/* Decorative elements */}
                <div className="absolute inset-0 border border-border m-4 pointer-events-none" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full" />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 blur-3xl rounded-full" />
                
                <div className="relative z-10 w-full max-w-sm space-y-6">
                  {/* Mock UI Elements */}
                  <div className="bg-card p-4 shadow-xl border border-border/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-primary font-bold">New Alert</span>
                      <span className="text-[10px] text-muted-foreground">Just now</span>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-secondary" />
                      <div>
                        <h4 className="font-serif font-semibold">Hermès</h4>
                        <p className="text-sm text-muted-foreground">Birkin 30 Togo Etoupe</p>
                        <p className="text-sm font-semibold mt-1">$22,500</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-card p-4 shadow-lg border border-border/50 opacity-80 translate-x-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Price Drop</span>
                      <span className="text-[10px] text-muted-foreground">2 hrs ago</span>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 bg-secondary" />
                      <div>
                        <h4 className="font-serif font-semibold">Chanel</h4>
                        <p className="text-sm text-muted-foreground">Classic Double Flap Maxi</p>
                        <p className="text-sm font-semibold mt-1">$8,900 <span className="line-through text-muted-foreground text-xs font-normal">$9,500</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      <section className="py-24 bg-card border-y border-border">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="font-serif text-3xl md:text-4xl font-medium mb-4">Just Landed</h2>
              <p className="text-muted-foreground max-w-2xl">
                A curated selection of recent arrivals across our network of authenticated luxury resale partners.
              </p>
            </div>
            <Link href="/sign-up">
              <Button variant="outline" className="hidden md:flex rounded-none uppercase tracking-widest text-xs">
                View All
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-4">
                  <Skeleton className="aspect-square w-full rounded-none" />
                  <Skeleton className="h-4 w-1/3 rounded-none" />
                  <Skeleton className="h-6 w-2/3 rounded-none" />
                  <Skeleton className="h-4 w-1/4 rounded-none" />
                </div>
              ))}
            </div>
          ) : featuredListings && featuredListings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredListings.slice(0, 3).map((listing, index) => (
                <ListingCard key={listing.id} listing={listing} index={index} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-secondary/30">
              <p className="text-muted-foreground font-serif italic">No featured listings at the moment.</p>
            </div>
          )}
          
          <div className="mt-12 text-center md:hidden">
            <Link href="/sign-up">
              <Button variant="outline" className="w-full rounded-none uppercase tracking-widest text-xs">
                View All
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-32 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-20">
            <h2 className="font-serif text-3xl md:text-5xl font-medium mb-6">The elegant way to acquire.</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Stop endlessly scrolling through multiple sites. Tell us what you desire, and we'll alert you the moment it becomes available.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div className="space-y-6">
              <div className="w-16 h-16 mx-auto bg-card border border-border flex items-center justify-center rounded-none rotate-3">
                <Search className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-semibold">1. Set Your Criteria</h3>
              <p className="text-muted-foreground leading-relaxed">
                Define your exact specifications—brand, model, color, leather, hardware, condition, and price range.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="w-16 h-16 mx-auto bg-card border border-border flex items-center justify-center rounded-none -rotate-3">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-semibold">2. We Scan Networks</h3>
              <p className="text-muted-foreground leading-relaxed">
                Our system continuously monitors top authenticated resale marketplaces simultaneously, 24/7.
              </p>
            </div>
            
            <div className="space-y-6">
              <div className="w-16 h-16 mx-auto bg-card border border-border flex items-center justify-center rounded-none rotate-3">
                <Bell className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-serif text-xl font-semibold">3. Instant Alerts</h3>
              <p className="text-muted-foreground leading-relaxed">
                Receive an immediate notification when a match is found, giving you the edge to purchase before anyone else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-16 border-t border-border">
        <div className="container mx-auto px-6 max-w-6xl text-center md:text-left">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="font-serif text-3xl font-bold tracking-tight mb-4 block">BagScout</span>
              <p className="text-background/70 max-w-md mx-auto md:mx-0">
                The premium platform for finding desired luxury handbags across trusted resale marketplaces.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center md:justify-end gap-6">
              <Link href="/sign-in" className="text-sm font-semibold uppercase tracking-widest hover:text-primary transition-colors">
                Sign In
              </Link>
              <Link href="/sign-up" className="text-sm font-semibold uppercase tracking-widest hover:text-primary transition-colors">
                Create Account
              </Link>
            </div>
          </div>
          <div className="mt-16 pt-8 border-t border-background/20 text-sm text-background/50 flex flex-col md:flex-row justify-between items-center">
            <p>© {new Date().getFullYear()} BagScout. All rights reserved.</p>
            <p className="mt-2 md:mt-0">Not affiliated with any mentioned brands.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}