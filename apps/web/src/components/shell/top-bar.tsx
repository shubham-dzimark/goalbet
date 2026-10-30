'use client';

import { Clock3, LogOut, Search, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { formatRon } from '@goalbet/shared';
import { Button, LogoMark } from '@goalbet/ui';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { ThemeToggle } from './theme-toggle';
import { useFormat } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { utcOffset } from '@/lib/time-zone';

/** Top bar: brand (mobile), command search trigger, language, balance or log in / register. */
export function TopBar({ onSearch }: { onSearch: () => void }) {
  const t = useTranslations('nav');
  const locale = useLocale() as 'ro' | 'en';
  const { status, user } = useAuth();
  const router = useRouter();
  const f = useFormat();
  const connected = useRealtime((s) => s.connected);
  const zone = f.zone();
  const zoneTitle = t('timeZone', { zone: `${f.tz.replace(/_/g, ' ')} (${utcOffset(f.tz)})` });

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    useAuth.getState().clear();
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-40 -mx-3 mb-4 px-3 pt-3 lg:static lg:mx-0 lg:px-0">
      <div className="glass flex h-14 items-center gap-2 rounded-2xl px-2.5 sm:gap-3 sm:px-3">
        <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="GoalBet">
          <LogoMark className="h-8 w-8" />
        </Link>
        <button
          type="button"
          onClick={onSearch}
          data-testid="search-trigger"
          aria-label={t('search')}
          className="flex h-10 w-10 shrink-0 items-center justify-center gap-2.5 rounded-xl bg-tint/[0.05] text-sm sm:w-auto sm:min-w-0 sm:flex-1 sm:justify-start sm:px-3 text-ink-faint ring-1 ring-line transition-colors hover:bg-tint/[0.08] hover:text-ink-muted sm:max-w-md"
        >
          <Search className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="hidden truncate sm:inline">{t('search')}</span>
          <kbd className="ml-auto hidden rounded-md bg-tint/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-muted sm:block">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span
            title={zoneTitle}
            aria-label={zoneTitle}
            data-testid="tz-chip"
            className="hidden h-10 items-center gap-1.5 rounded-xl bg-tint/[0.04] px-2.5 text-xs font-bold tabular-nums text-ink-muted ring-1 ring-line lg:flex"
          >
            <Clock3 className="size-3.5 text-brand" aria-hidden="true" />
            {zone}
            {/* live-updates indicator: green pulse while pushes arrive over the socket */}
            <span
              className={connected ? 'ml-1 size-2 rounded-full bg-brand shadow-[0_0_0_3px_rgb(var(--brand-rgb)/0.25)]' : 'ml-1 size-2 rounded-full bg-ink-faint'}
              title={t(connected ? 'realtimeOn' : 'realtimeOff')}
              role="status"
              aria-label={t(connected ? 'realtimeOn' : 'realtimeOff')}
              data-testid="realtime-dot"
              data-connected={connected}
            />
          </span>
          <ThemeToggle />
          <Suspense>
            <LanguageSwitcher className="hidden md:inline-flex" />
          </Suspense>
          {status === 'loading' ? (
            <div className="h-10 w-36 animate-pulse rounded-xl bg-tint/5" aria-hidden="true" />
          ) : status === 'authed' && user ? (
            <>
              <Link
                href="/account/wallet"
                data-testid="balance-chip"
                className="flex h-10 items-center gap-2 rounded-xl bg-brand/10 px-3 ring-1 ring-brand/30 transition-colors hover:bg-brand/15"
              >
                <span className="hidden text-[11px] font-semibold uppercase text-ink-muted sm:block">{t('balance')}</span>
                <AnimatedNumber value={user.balanceBani} format={(n) => formatRon(n, locale)} className="font-display tracking-tight text-lg font-semibold tabular-nums text-brand" />
              </Link>
              <Link href="/account" aria-label={t('account')} className="hidden size-10 place-items-center rounded-xl bg-tint/[0.05] ring-1 ring-line hover:bg-tint/10 sm:grid">
                <UserRound className="size-4" />
              </Link>
              <button type="button" onClick={logout} aria-label={t('logout')} className="hidden size-10 place-items-center rounded-xl text-ink-muted hover:bg-tint/10 hover:text-ink md:grid">
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="h-10 px-3">
                <Link href="/login">{t('login')}</Link>
              </Button>
              <Button asChild size="sm" className="h-10 px-4">
                <Link href="/register">{t('register')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
