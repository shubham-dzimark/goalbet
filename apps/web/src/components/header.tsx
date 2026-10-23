'use client';

import { CircleUser, LogOut, Search, Wallet } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Badge, Button, Logo, cn } from '@goalbet/ui';
import { formatRon } from '@goalbet/shared';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { LanguageSwitcher } from './language-switcher';

export interface HeaderCounts {
  live?: number;
  myBets?: number;
}

function NavTab({ href, label, count, active }: { href: string; label: string; count?: number | undefined; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'relative flex h-14 items-center gap-1.5 px-3 text-sm font-semibold text-chrome-muted hover:text-chrome-ink',
        active && 'text-chrome-ink after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand',
      )}
    >
      {label}
      {count !== undefined && count > 0 ? (
        <Badge tone="chrome" className="min-w-5 justify-center px-1.5">
          {count}
        </Badge>
      ) : null}
    </Link>
  );
}

function AccountArea() {
  const t = useTranslations('nav');
  const locale = useLocale() as 'ro' | 'en';
  const { status, user } = useAuth();
  const router = useRouter();

  if (status === 'loading') return <div className="h-9 w-40 animate-pulse rounded-md bg-chrome-soft" aria-hidden="true" />;

  if (status !== 'authed' || !user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="chrome" size="sm" className="border border-chrome-soft">
          <Link href="/login">{t('login')}</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/register">{t('register')}</Link>
        </Button>
      </div>
    );
  }

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    useAuth.getState().clear();
    router.push('/');
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href="/account/wallet"
        className="flex h-9 items-center gap-2 rounded-md bg-chrome-strong px-3 text-sm font-bold text-chrome-ink hover:bg-chrome-soft"
        aria-label={t('balance')}
        data-testid="balance-chip"
      >
        <Wallet className="size-4 text-brand" aria-hidden="true" />
        <span className="tabular-nums">{formatRon(user.balanceBani, locale)}</span>
      </Link>
      <Link
        href="/account"
        className="hidden size-9 items-center justify-center rounded-md text-chrome-ink hover:bg-chrome-soft sm:flex"
        aria-label={t('account')}
      >
        <CircleUser className="size-5" />
      </Link>
      <button
        type="button"
        onClick={logout}
        className="hidden size-9 items-center justify-center rounded-md text-chrome-muted hover:bg-chrome-soft hover:text-chrome-ink md:flex"
        aria-label={t('logout')}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** F1.1 header: logo, Sport, Live (count), My Bets (count), search, RO/EN, login/register or balance. */
export function Header({ counts = {} }: { counts?: HeaderCounts }) {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const isLive = pathname.startsWith('/live');
  const isBets = pathname.startsWith('/my-bets');

  return (
    <header className="sticky top-0 z-40 bg-chrome text-chrome-ink shadow-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-card focus:px-3 focus:py-2 focus:text-ink">
        {t('skipToContent')}
      </a>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4">
        <Link href="/" className="shrink-0 text-chrome-ink" aria-label="GoalBet">
          <Logo />
        </Link>
        <nav className="ml-2 hidden items-center md:flex" aria-label={t('menu')}>
          <NavTab href="/" label={t('sport')} active={!isLive && !isBets} />
          <NavTab href="/live" label={t('live')} count={counts.live} active={isLive} />
          <NavTab href="/my-bets" label={t('myBets')} count={counts.myBets} active={isBets} />
        </nav>
        <form action={`/${locale}/search`} role="search" className="mx-auto hidden w-full max-w-sm lg:block">
          <label className="relative block">
            <span className="sr-only">{t('search')}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-chrome-muted" aria-hidden="true" />
            <input
              name="q"
              type="search"
              placeholder={t('search')}
              className="h-9 w-full rounded-md border border-chrome-soft bg-chrome-strong pl-9 pr-3 text-sm text-chrome-ink placeholder:text-chrome-muted focus:border-brand focus:outline-none"
            />
          </label>
        </form>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Suspense>
            <LanguageSwitcher className="hidden sm:inline-flex" />
          </Suspense>
          <AccountArea />
        </div>
      </div>
    </header>
  );
}
