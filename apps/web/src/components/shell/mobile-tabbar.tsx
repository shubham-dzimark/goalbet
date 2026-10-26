'use client';

import { Ticket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { cn } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { gsap, prefersReducedMotion } from '@/lib/gsap';
import { NAV_ITEMS, useActiveNav } from './side-rail';

/** Mobile bottom bar: four destinations and a raised bet-slip button in the middle. */
export function MobileTabbar({ slipCount, liveCount, onOpenSlip }: { slipCount: number; liveCount?: number | undefined; onOpenSlip: () => void }) {
  const t = useTranslations('nav');
  const active = useActiveNav();
  const badge = useRef<HTMLSpanElement>(null);
  const prev = useRef(slipCount);

  useEffect(() => {
    if (slipCount > prev.current && badge.current && !prefersReducedMotion()) {
      gsap.fromTo(badge.current, { scale: 0.4 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
    }
    prev.current = slipCount;
  }, [slipCount]);

  const items = NAV_ITEMS.filter((i) => ['/', '/live', '/my-bets', '/account'].includes(i.href));
  const left = items.slice(0, 2);
  const right = items.slice(2);
  const item = (i: (typeof items)[number]) => (
    <Link
      key={i.href}
      href={i.href}
      className={cn('relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold', active === i.href ? 'text-brand' : 'text-ink-muted')}
    >
      <i.icon className="size-5" aria-hidden="true" />
      {t(i.key)}
      {i.key === 'live' && liveCount ? <span className="absolute right-[calc(50%-1.1rem)] top-1 size-2 rounded-full bg-live" /> : null}
    </Link>
  );

  return (
    <nav aria-label={t('menu')} className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
      <div className="glass flex h-16 items-stretch rounded-2xl bg-chrome/80 shadow-[var(--shadow-float)]">
        {left.map(item)}
        <div className="flex w-20 justify-center">
          <button
            type="button"
            onClick={onOpenSlip}
            data-testid="bottom-nav-slip"
            aria-label={t('betslip')}
            className="relative -mt-6 grid size-16 place-items-center rounded-2xl bg-brand text-brand-ink shadow-[0_10px_30px_-6px_rgb(var(--brand-rgb)/0.75)] ring-4 ring-surface transition-transform active:scale-95"
          >
            <Ticket className="size-6" aria-hidden="true" />
            {slipCount > 0 ? (
              <span ref={badge} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-live text-xs font-bold text-white ring-2 ring-surface">
                {slipCount}
              </span>
            ) : null}
          </button>
        </div>
        {right.map(item)}
      </div>
    </nav>
  );
}
