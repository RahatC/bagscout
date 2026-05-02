import { createRoot } from "react-dom/client";
import { initSentry, Sentry, isSentryEnabled } from "./lib/sentry";
import App from "./App";
import "./index.css";

initSentry();

const Root = isSentryEnabled() ? (
  <Sentry.ErrorBoundary
    fallback={
      <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center">
        <div>
          <h1 className="font-serif text-2xl font-bold">Something went wrong</h1>
          <p className="mt-2 text-muted-foreground">
            We&apos;ve been notified. Please refresh and try again.
          </p>
        </div>
      </div>
    }
  >
    <App />
  </Sentry.ErrorBoundary>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(Root);
