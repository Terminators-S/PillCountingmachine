'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { AppSessionProvider } from '../components/app-session-provider';

export function Providers({ children }: { children: ReactNode }) {
  const isDev = process.env.NODE_ENV !== 'production';

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 10000,
            refetchInterval: isDev ? 3000 : false,
            refetchIntervalInBackground: isDev
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppSessionProvider>{children}</AppSessionProvider>
    </QueryClientProvider>
  );
}
