'use client';

import { ArrowDown, ArrowUp, Lock, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type EventSummaryDto, type MarketDto, type SelectionDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { flyToSlip } from '@/lib/fly-to-slip';
import { useFormat } from '@/lib/format';
import { gsap, prefersReducedMotion } from '@/lib/gsap';
import { useMarketText } from '@/lib/markets';
import { useSlip } from '@/lib/slip-store';

type EventLike = Pick<EventSummaryDto, 'id' | 'homeTeam' | 'awayTeam' | 'startTime' | 'status' | 'suspended'>;

/**
 * Selection price. Click toggles the bet slip (with a fly-to-slip chip), price moves flash
 * green/red with an arrow (F2.2), suspended markets show a lock instead of a price.
 */
export function OddsButton({
  event,
  market,
  selection,
  label,
  shortLabel,
  className,
  size = 'md',
}: {
  event: EventLike;
  market: MarketDto;
  selection: SelectionDto;
  label?: string | undefined;
  /** Shown instead of `label` on narrow screens (e.g. "1" instead of a team name). */
  shortLabel?: string | undefined;
  className?: string;
  size?: 'md' | 'lg';
}) {
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const picked = useSlip((s) => s.items.some((i) => i.selectionId === selection.id));
  const toggle = useSlip((s) => s.toggle);
  const btn = useRef<HTMLButtonElement>(null);
  const prev = useRef(selection.oddsMilli);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (selection.oddsMilli === prev.current) return;
    const d = selection.oddsMilli > prev.current ? 'up' : 'down';
    prev.current = selection.oddsMilli;
    setDir(d);
    if (btn.current && !prefersReducedMotion()) {
      const color = d === 'up' ? 'rgb(var(--brand-rgb) / 0.35)' : 'rgb(var(--live-rgb) / 0.35)';
      gsap.fromTo(btn.current, { boxShadow: `inset 0 0 0 999px ${color}` }, { boxShadow: 'inset 0 0 0 999px rgb(0 0 0 / 0)', duration: 2.2, ease: 'power2.out' });
      gsap.fromTo(btn.current.querySelector('[data-price]'), { yPercent: d === 'up' ? 60 : -60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45 });
    }
    const timer = setTimeout(() => setDir(null), 2600);
    return () => clearTimeout(timer);
  }, [selection.oddsMilli]);

  const locked = !selection.active || market.status !== 'OPEN' || event.suspended;

  const onClick = () => {
    if (locked) return;
    if (!picked && btn.current) flyToSlip(btn.current, f.odds(selection.oddsMilli));
    toggle({
      selectionId: selection.id,
      eventId: event.id,
      marketId: market.id,
      oddsMilli: selection.oddsMilli,
      live: event.status === 'LIVE',
      eventName: `${event.homeTeam} – ${event.awayTeam}`,
      marketName: marketTitle(market, event),
      outcomeName: outcomeLong(market, selection, event),
      startTime: event.startTime,
    });
  };

  return (
    <button
      ref={btn}
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={picked}
      data-testid={`odds-${selection.id}`}
      data-odds={selection.oddsMilli}
      className={cn(
        'group relative flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl px-3 text-sm transition-all duration-200',
        size === 'lg' ? 'h-14' : 'h-11',
        picked
          ? 'bg-odds-active text-odds-active-ink shadow-[0_6px_22px_-8px_rgb(var(--brand-rgb)/0.9)]'
          : 'bg-odds text-ink ring-1 ring-inset ring-tint/[0.04] hover:-translate-y-0.5 hover:bg-odds-hover hover:ring-brand/30',
        locked && 'cursor-not-allowed opacity-50 hover:translate-y-0',
        className,
      )}
    >
      {label ? (
        <span className={cn('truncate text-xs font-medium', picked ? 'text-brand-ink/70' : 'text-ink-muted')}>
          {shortLabel ? (
            <>
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{label}</span>
            </>
          ) : (
            label
          )}
        </span>
      ) : (
        <span />
      )}
      <span className="flex items-center gap-1 font-display text-[17px] font-bold tabular-nums leading-none" data-price>
        {locked ? (
          <Lock className="size-3.5" aria-label="locked" />
        ) : (
          <>
            {selection.boosted ? <Zap className={cn('size-3.5', picked ? 'fill-brand-ink' : 'fill-boost text-boost')} aria-hidden="true" /> : null}
            {dir === 'up' ? <ArrowUp className="size-3 text-odds-up" aria-hidden="true" /> : null}
            {dir === 'down' ? <ArrowDown className="size-3 text-odds-down" aria-hidden="true" /> : null}
            {f.odds(selection.oddsMilli)}
          </>
        )}
      </span>
    </button>
  );
}
