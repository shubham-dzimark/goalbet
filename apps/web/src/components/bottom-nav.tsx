'use client';

import { CircleUser, Home, Radio, Receipt, Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@goalbet/ui';
import { Link, usePathname } from '@/i18n/navigation';

/** Mobile bottom navigation (hidden from md up). */
export function BottomNav({ slotCount = 0, onOpenSlip }: { slotCount?: number; onOpenSlip?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  const active = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-chrome-soft bg-chrome pb-[env(safe-area-inset-bottom)] text-chrome-muted md:hidden"
      aria-label={t('menu')}
    >
      <Link href="/" className={cn(item, active('/') && 'text-chrome-ink')}>
        <Home className="size-5" aria-hidden="true" />
        {t('home')}
      </Link>
      <Link href="/live" className={cn(item, active('/live') && 'text-chrome-ink')}>
        <Radio className="size-5" aria-hidden="true" />
        {t('live')}
      </Link>
      <button type="button" onClick={onOpenSlip} className={cn(item, 'relative')} data-testid="bottom-nav-slip">
        <Ticket className="size-5" aria-hidden="true" />
        {t('betslip')}
        {slotCount > 0 ? (
          <span className="absolute right-[calc(50%-1.25rem)] top-1.5 min-w-4 rounded-full bg-brand px-1 text-[10px] leading-4 text-white">
            {slotCount}
          </span>
        ) : null}
      </button>
      <Link href="/my-bets" className={cn(item, active('/my-bets') && 'text-chrome-ink')}>
        <Receipt className="size-5" aria-hidden="true" />
        {t('myBets')}
      </Link>
      <Link href="/account" className={cn(item, active('/account') && 'text-chrome-ink')}>
        <CircleUser className="size-5" aria-hidden="true" />
        {t('account')}
      </Link>
    </nav>
  );
}
