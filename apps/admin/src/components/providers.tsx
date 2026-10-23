'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { refreshSession } from '@/lib/session';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  useEffect(() => {
    void refreshSession();
  }, []);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
