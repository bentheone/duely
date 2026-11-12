import { QueryClient } from '@tanstack/react-query';

/** One client for the app, so non-UI code (sync hooks) can refresh queries like the community badge. */
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 60_000 } } });
