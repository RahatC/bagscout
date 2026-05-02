import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { queryClient } from "@/lib/queryClient";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import LandingPage from "@/pages/landing";
import DashboardPage from "@/pages/dashboard";
import WatchlistsPage from "@/pages/watchlists/index";
import WatchlistsNewPage from "@/pages/watchlists/new";
import WatchlistDetailPage from "@/pages/watchlists/detail";
import ListingsPage from "@/pages/listings/index";
import ListingDetailPage from "@/pages/listings/detail";
import AlertsPage from "@/pages/alerts";
import SavedPage from "@/pages/saved";
import AdminPage from "@/pages/admin";
import OnboardingPage from "@/pages/onboarding";
import { AppLayout } from "@/components/layout";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(11 26% 62%)",
    colorForeground: "hsl(220 8% 12%)",
    colorMutedForeground: "hsl(30 10% 40%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(30 30% 98%)",
    colorInput: "hsl(30 15% 85%)",
    colorInputForeground: "hsl(220 8% 12%)",
    colorNeutral: "hsl(30 15% 85%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "0px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(30,30%,98%)] rounded-none w-[440px] max-w-full overflow-hidden border border-border shadow-none",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl font-bold text-[hsl(220,8%,12%)]",
    headerSubtitle: "text-[hsl(30,10%,40%)]",
    socialButtonsBlockButtonText: "text-[hsl(220,8%,12%)] font-medium",
    formFieldLabel: "text-[hsl(220,8%,12%)] font-medium",
    footerActionLink: "text-[hsl(11,26%,62%)] hover:underline",
    footerActionText: "text-[hsl(30,10%,40%)]",
    dividerText: "text-[hsl(30,10%,40%)]",
    identityPreviewEditButton: "text-[hsl(11,26%,62%)]",
    formFieldSuccessText: "text-[hsl(220,8%,12%)]",
    alertText: "text-[hsl(0,84%,60%)]",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <AppLayout>
          <Component />
        </AppLayout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/onboarding" component={() => <ProtectedRoute component={OnboardingPage} />} />
          <Route path="/dashboard" component={() => <ProtectedRoute component={DashboardPage} />} />
          <Route path="/watchlists" component={() => <ProtectedRoute component={WatchlistsPage} />} />
          <Route path="/watchlists/new" component={() => <ProtectedRoute component={WatchlistsNewPage} />} />
          <Route path="/watchlists/:id" component={() => <ProtectedRoute component={WatchlistDetailPage} />} />
          <Route path="/listings" component={() => <ProtectedRoute component={ListingsPage} />} />
          <Route path="/listings/:id" component={() => <ProtectedRoute component={ListingDetailPage} />} />
          <Route path="/alerts" component={() => <ProtectedRoute component={AlertsPage} />} />
          <Route path="/saved" component={() => <ProtectedRoute component={SavedPage} />} />
          <Route path="/admin" component={() => <ProtectedRoute component={AdminPage} />} />

          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <TooltipProvider>
        <ClerkProviderWithRoutes />
        <Toaster />
      </TooltipProvider>
    </WouterRouter>
  );
}

export default App;
