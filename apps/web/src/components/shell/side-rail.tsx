'use client';

import { CircleUser, Home, LayoutGrid, Radio, Receipt, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useRef } from 'react';
import { LogoMark, cn } from '@goalbet/ui';
import { Link, usePathname } from '@/i18n/navigation';
import { gsap, prefersReducedMotion } from '@/lib/gsap';

export const NAV_ITEMS = [
  { href: '/', key: 'home', icon: Home },
  { href: '/live', key: 'live', icon: Radio },
  { href: '/sport', key: 'sport', icon: LayoutGrid },
  { href: '/my-bets', key: 'myBets', icon: Receipt },
  { href: '/account/wallet', key: 'wallet', icon: Wallet },
  { href: '/account', key: 'account', icon: CircleUser },
] as const;

export function useActiveNav() {
  const pathname = usePathname();
  const matches = NAV_ITEMS.filter((i) => (i.href === '/' ? pathname === '/' || pathname.startsWith('/match') : pathname.startsWith(i.href)));
  // most specific wins (/account/wallet over /account)
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

/** Desktop navigation rail with a gliding active indicator. */
export function SideRail({ liveCount, betsCount }: { liveCount?: number | undefined; betsCount?: number | undefined }) {
  const t = useTranslations('nav');
  const active = useActiveNav();
  const listRef = useRef<HTMLUListElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-href="${active}"]`);
    if (!el || !markerRef.current) {
      gsap.to(markerRef.current, { opacity: 0, duration: 0.2 });
      return;
    }
    const vars = { y: el.offsetTop, height: el.offsetHeight, opacity: 1 };
    if (prefersReducedMotion()) gsap.set(markerRef.current, vars);
    else gsap.to(markerRef.current, { ...vars, duration: 0.5, ease: 'expo.out' });
  }, [active]);

  return (
    <nav aria-label={t('menu')} className="glass sticky top-3 hidden h-[calc(100dvh-1.5rem)] w-[84px] shrink-0 flex-col items-center rounded-3xl py-4 lg:flex">
      <Link href="/" aria-label="GoalBet" className="mb-6 transition-transform hover:scale-110">
        <LogoMark className="h-10 w-10" />
      </Link>
      <ul ref={listRef} className="relative flex w-full flex-col gap-1 px-2">
        <span
          ref={markerRef}
          aria-hidden="true"
          className="absolute left-2 right-2 top-0 rounded-2xl bg-brand/12 opacity-0 ring-1 ring-brand/40 before:absolute before:-left-2 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand before:shadow-[0_0_12px_rgb(var(--brand-rgb)/0.9)]"
        />
        {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
          const count = key === 'live' ? liveCount : key === 'myBets' ? betsCount : undefined;
          const isActive = active === href;
          return (
            <li key={href} data-href={href}>
              <Link
                href={href}
                className={cn(
                  'group relative flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-brand' : 'text-ink-muted hover:text-ink',
                )}
              >
                <span className="relative">
                  <Icon className="size-5 transition-transform duration-300 group-hover:-translate-y-0.5" aria-hidden="true" />
                  {count ? (
                    <span
                      className={cn(
                        'absolute -right-3 -top-2 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4',
                        key === 'live' ? 'bg-live text-white' : 'bg-brand text-brand-ink',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
