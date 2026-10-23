'use client';

import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { useSlip } from '@/lib/slip-store';
import { BottomNav } from './bottom-nav';
import { Header } from './header';
import { BetSlip } from './slip/bet-slip';
import { MobileSlip } from './slip/mobile-slip';
import { CompetitionsNav } from './sport/competitions-nav';

const SPORT_ROUTES = ['/', '/sport', '/live', '/match', '/search'];
const NO_SLIP_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password'];

/**
 * Persistent chrome (F1.1): header, competitions sidebar on sport pages, centre content,
 * bet slip on the right (desktop) or as a floating bar + bottom sheet (mobile), bottom nav.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const authed = useAuth((s) => s.status === 'authed');
  const slipCount = useSlip((s) => s.items.length);
  const openSheet = useSlip((s) => s.setSheetOpen);

  useEffect(() => {
    void useSlip.persist.rehydrate();
  }, []);

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

  const sport = SPORT_ROUTES.some((r) => (r === '/' ? pathname === '/' : pathname.startsWith(r)));
  const showSlip = !NO_SLIP_ROUTES.some((r) => pathname.startsWith(r));

  return (
    <>
      <Header counts={{ live: summary?.liveCount, myBets: authed ? counts?.active : undefined }} />
      <div
        id="main"
        className={
          showSlip
            ? `mx-auto grid w-full max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4 ${sport ? 'lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`
            : 'mx-auto w-full max-w-[1440px]'
        }
      >
        {showSlip && sport ? (
          <aside className="hidden lg:block">
            <div className="sticky top-18">
              <CompetitionsNav />
            </div>
          </aside>
        ) : null}
        <div className="min-w-0">{children}</div>
        {showSlip ? (
          <aside className="hidden xl:block">
            <div className="sticky top-18 overflow-hidden rounded-[var(--radius-card)] border border-line bg-card shadow-xs">
              <BetSlip />
            </div>
          </aside>
        ) : null}
      </div>
      {showSlip ? <MobileSlip /> : null}
      <BottomNav slotCount={slipCount} onOpenSlip={() => openSheet(true)} />
    </>
  );
}
