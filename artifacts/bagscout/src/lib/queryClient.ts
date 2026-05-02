import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { Sentry, isSentryEnabled } from './sentry';

function reportApiError(err: unknown, context: Record<string, unknown>) {
  if (!isSentryEnabled()) return;
  // Don't report expected 4xx auth/validation errors
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return;
  }
  Sentry.captureException(err, { extra: context });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      reportApiError(err, { queryKey: query.queryKey });
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      reportApiError(err, { mutationKey: mutation.options.mutationKey });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});