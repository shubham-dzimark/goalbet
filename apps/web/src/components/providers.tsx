'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { refreshSession } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { TimeZoneContext } from '@/lib/time-zone';

/** Restores the session from the refresh cookie and applies the user's saved language (F0.3). */
function SessionBootstrap() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    void refreshSession().then((ok) => {
      const user = useAuth.getState().user;
      if (ok && user && user.locale !== locale && (user.locale === 'ro' || user.locale === 'en')) {
        router.replace(pathname, { locale: user.locale });
      }
    });
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function Providers({ children, timeZone }: { children: ReactNode; timeZone: string }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TimeZoneContext.Provider value={timeZone}>
        <SessionBootstrap />
        {children}
      </TimeZoneContext.Provider>
    </QueryClientProvider>
  );
}
