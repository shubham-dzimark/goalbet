'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type EventSummaryDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { useMatchClock } from '@/lib/format';

/** Circular match progress (0–90') with the minute in the middle. */
export function MinuteRing({ event, size = 56, className }: { event: Pick<EventSummaryDto, 'status' | 'period' | 'minute'>; size?: number; className?: string }) {
  const clock = useMatchClock()(event);
  const minute = event.period === 'HALF_TIME' ? 45 : Math.min(90, event.minute ?? 0);
  const r = 15.5;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(var(--tint-rgb) / 0.1)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--color-live)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - minute / 90)}
          className="transition-[stroke-dashoffset] duration-1000"
        />
      </svg>
      <span className="font-display tracking-tight text-sm font-semibold leading-none text-live">{clock}</span>
    </div>
  );
}

/** Live countdown to kick-off ("02:14:09"); switches to a label when under a minute. */
export function Countdown({ to, className }: { to: string; className?: string }) {
  const t = useTranslations('fx');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  if (diff <= 0) return <span className={className}>{t('kickoff')}</span>;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    <span className={cn('tabular-nums', className)} suppressHydrationWarning>
      {h > 47 ? t('inDays', { days: Math.floor(h / 24) }) : `${pad(h)}:${pad(m)}:${pad(s)}`}
    </span>
  );
}
