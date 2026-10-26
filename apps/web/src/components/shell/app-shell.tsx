'use client';

import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useSlip } from '@/lib/slip-store';
import { useSyncTimeZone } from '@/lib/time-zone';
import { ScrollProgress } from '../fx/scroll-progress';
import { BetSlip } from '../slip/bet-slip';
import { MobileSlip } from '../slip/mobile-slip';
import { CommandSearch } from './command-search';
import { MobileTabbar } from './mobile-tabbar';
import { SideRail } from './side-rail';
import { SiteFooter } from './site-footer';
import { TopBar } from './top-bar';

const AUTH_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * App shell: navigation rail (desktop) · top bar + page · bet-slip dock (xl+).
 * Below xl the slip is a bottom sheet opened from the mobile tab bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authed = useAuth((s) => s.status === 'authed');
  const slipCount = useSlip((s) => s.items.length);
  const openSheet = useSlip((s) => s.setSheetOpen);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    void useSlip.persist.rehydrate();
  }, []);
  useSyncTimeZone();

  const { data: summary } = useQuery({
    queryKey: ['catalog-summary'],
    queryFn: () => api<{ liveCount: number }>('/catalog/summary'),
    refetchInterval: 30_000,
  });
  const { data: counts } = useQuery({
    queryKey: ['ticket-counts'],
    queryFn: () => api<{ active: number }>('/tickets/counts'),
    enabled: authed,
    refetchInterval: 60_000,
  });

  const authPage = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <div className="flex w-full gap-4 px-3 lg:px-4 lg:pt-3">
      <ScrollProgress />
      <SideRail liveCount={summary?.liveCount} betsCount={authed ? counts?.active : undefined} />
      <div className="min-w-0 flex-1 pb-28 lg:pb-6">
        <TopBar onSearch={() => setSearchOpen(true)} />
        <main id="main">{children}</main>
        <SiteFooter />
      </div>
      {!authPage ? (
        <aside className="hidden w-[360px] shrink-0 xl:block">
          <div className="glass sticky top-3 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl">
            <BetSlip />
          </div>
        </aside>
      ) : null}
      {!authPage ? <MobileSlip /> : null}
      <MobileTabbar slipCount={slipCount} liveCount={summary?.liveCount} onOpenSlip={() => openSheet(true)} />
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
