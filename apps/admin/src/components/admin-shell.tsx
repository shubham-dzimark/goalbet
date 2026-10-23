'use client';

import { BarChart3, Gauge, LogOut, ScrollText, Settings2, Ticket, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { Logo, Skeleton, cn } from '@goalbet/ui';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { adminApi, useSession } from '@/lib/session';
import { LanguageSwitcher } from './language-switcher';

const NAV = [
  { href: '/', key: 'dashboard', icon: Gauge },
  { href: '/users', key: 'users', icon: Users },
  { href: '/wallet', key: 'wallet', icon: Wallet },
  { href: '/bets', key: 'bets', icon: Ticket },
  { href: '/sportsbook', key: 'sportsbook', icon: Settings2 },
  { href: '/reports', key: 'reports', icon: BarChart3 },
  { href: '/audit', key: 'audit', icon: ScrollText },
] as const;

/** Protected admin chrome (F4.5): redirects to login when there is no session or it timed out. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { status, admin } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authed' || !admin) {
    return (
      <div className="p-6">
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }

  const logout = async () => {
    await adminApi('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    useSession.getState().clear();
  };

  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="bg-chrome text-chrome-ink lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo suffix="Admin" />
          <LanguageSwitcher className="lg:hidden" />
        </div>
        <nav aria-label={t('nav.menu')} className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible">
          {NAV.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold text-chrome-muted hover:bg-chrome-soft hover:text-chrome-ink',
                active(href) && 'bg-chrome-soft text-chrome-ink',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b border-line bg-card px-4">
          <span className="truncate text-sm text-ink-muted">
            {t('nav.signedInAs', { email: admin.email })} · <strong className="text-ink">{t(`roles.${admin.role}`)}</strong>
          </span>
          <LanguageSwitcher className="hidden lg:inline-flex" />
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-ink-muted hover:bg-card-alt hover:text-ink"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('nav.logout')}</span>
          </button>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
