'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, Gauge, LogOut, ScrollText, Settings2, ShieldCheck, Ticket, UserCog, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect } from 'react';
import { LogoMark, Skeleton, cn } from '@goalbet/ui';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { useCan } from '@/lib/data';
import { adminApi, useSession } from '@/lib/session';
import { LanguageSwitcher } from './language-switcher';
import { Toaster } from './ui/feedback';

const GROUPS = [
  { key: 'overview', items: [{ href: '/', key: 'dashboard', icon: Gauge }] },
  {
    key: 'operations',
    items: [
      { href: '/users', key: 'users', icon: Users },
      { href: '/wallet', key: 'wallet', icon: Wallet },
      { href: '/bets', key: 'bets', icon: Ticket },
      { href: '/sportsbook', key: 'sportsbook', icon: Settings2 },
    ],
  },
  {
    key: 'insights',
    items: [
      { href: '/reports', key: 'reports', icon: BarChart3 },
      { href: '/audit', key: 'audit', icon: ScrollText },
    ],
  },
  // only Super admins see this group
  { key: 'system', items: [{ href: '/admins', key: 'admins', icon: UserCog }] },
] as const;

/** Protected admin chrome (F4.5): redirects to login when there is no session or it timed out. */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { status, admin } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const can = useCan();

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  // credits waiting for a second admin (FINANCE): shown as a badge on Wallet
  const { data: approvals } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => adminApi<unknown[]>('/admin/approvals'),
    enabled: status === 'authed' && can('FINANCE'),
    refetchInterval: 30_000,
  });
  // player deposit / withdrawal requests waiting for Finance
  const { data: pendingPayments } = useQuery({
    queryKey: ['pending-payments'],
    queryFn: () => adminApi<{ items: unknown[] }>('/admin/payment-requests?status=PENDING&limit=100').then((p) => p.items.length),
    enabled: status === 'authed' && can('FINANCE'),
    refetchInterval: 30_000,
  });

  if (status !== 'authed' || !admin) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-64 border-r border-line bg-chrome lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const logout = async () => {
    await adminApi('/admin/auth/logout', { method: 'POST' }).catch(() => undefined);
    useSession.getState().clear();
  };
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const walletWaiting = (approvals?.length ?? 0) + (pendingPayments ?? 0);
  const badge = (key: string) => (key === 'wallet' && walletWaiting > 0 ? walletWaiting : null);
  const initials = admin.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="z-30 border-b border-line bg-chrome/95 backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center justify-between gap-2 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="size-9" />
            <span className="leading-none">
              <span className="block font-display text-xl font-bold uppercase italic tracking-wide">GoalBet</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-brand">{t('nav.backOffice')}</span>
            </span>
          </Link>
          <LanguageSwitcher className="lg:hidden" />
        </div>

        <nav aria-label={t('nav.menu')} className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:gap-5 lg:overflow-y-auto lg:pt-2">
          {GROUPS.filter((g) => g.key !== 'system' || can()).map((g) => (
            <div key={g.key} className="flex gap-1 lg:flex-col">
              <p className="hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-faint lg:block">{t(`nav.groups.${g.key}`)}</p>
              {g.items.map(({ href, key, icon: Icon }) => {
                const on = active(href);
                const count = badge(key);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'group relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:bg-tint/[0.05] hover:text-ink',
                      on && 'bg-brand-soft text-ink',
                    )}
                    data-testid={`nav-${key}`}
                  >
                    {on ? <span aria-hidden="true" className="absolute inset-y-2 left-0 hidden w-1 rounded-r-full bg-brand lg:block" /> : null}
                    <Icon className={cn('size-[18px]', on ? 'text-brand' : 'text-ink-faint group-hover:text-ink-muted')} aria-hidden="true" />
                    {t(`nav.${key}`)}
                    {count ? (
                      <span className="ml-auto grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-boost-ink" aria-label={t('nav.pendingApprovals', { count })}>
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-line p-4 lg:block">
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className={cn('-m-1 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-tint/[0.05]', active('/account') && 'bg-brand-soft')}
              title={t('nav.account')}
              data-testid="nav-account"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brand-ink">{initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{admin.name}</span>
                <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                  <ShieldCheck className="size-3 text-brand" aria-hidden="true" />
                  {t(`roles.${admin.role}`)}
                </span>
              </span>
            </Link>
            <button type="button" onClick={logout} aria-label={t('nav.logout')} className="rounded-lg p-2 text-ink-muted hover:bg-tint/10 hover:text-ink" data-testid="logout">
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <LanguageSwitcher />
            <span className="truncate pl-2 text-[11px] text-ink-faint">{admin.email}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-end gap-2 border-b border-line px-4 lg:hidden">
          <Link href="/account" className="truncate text-xs text-ink-muted hover:text-ink">
            {admin.email} · <strong className="text-ink">{t(`roles.${admin.role}`)}</strong>
          </Link>
          <button type="button" onClick={logout} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-ink-muted hover:text-ink">
            <LogOut className="size-3.5" aria-hidden="true" />
            {t('nav.logout')}
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
