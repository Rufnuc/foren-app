import { QueryClient } from '@tanstack/react-query';

// Single shared React Query client. Defaults tuned for an offline-first vault:
// data is considered fresh for 30s, and we don't refetch on window focus to
// avoid surprising background network activity while the device is observed.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});
