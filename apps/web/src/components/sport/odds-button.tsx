'use client';

import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Lock, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type EventSummaryDto, type MarketDto, type SelectionDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';
import { useSlip } from '@/lib/slip-store';

type EventLike = Pick<EventSummaryDto, 'id' | 'homeTeam' | 'awayTeam' | 'startTime' | 'status' | 'suspended'>;

/**
 * Selection price button. Toggles the selection in the bet slip, flashes green/orange when the
 * price moves (F2.2) and shows a lock when the market or event is suspended.
 */
export function OddsButton({
  event,
  market,
  selection,
  label,
  className,
  layout = 'stack',
}: {
  event: EventLike;
  market: MarketDto;
  selection: SelectionDto;
  label?: string;
  className?: string;
  layout?: 'stack' | 'row';
}) {
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const picked = useSlip((s) => s.items.some((i) => i.selectionId === selection.id));
  const toggle = useSlip((s) => s.toggle);

  const prev = useRef(selection.oddsMilli);
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);
  useEffect(() => {
    if (selection.oddsMilli !== prev.current) {
      setFlash((f0) => ({ dir: selection.oddsMilli > prev.current ? 'up' : 'down', n: (f0?.n ?? 0) + 1 }));
      prev.current = selection.oddsMilli;
      const timer = setTimeout(() => setFlash(null), 2500);
      return () => clearTimeout(timer);
    }
  }, [selection.oddsMilli]);

  const locked = !selection.active || market.status !== 'OPEN' || event.suspended;

  const onClick = () => {
    if (locked) return;
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
      type="button"
      onClick={onClick}
      disabled={locked}
      aria-pressed={picked}
      data-testid={`odds-${selection.id}`}
      data-odds={selection.oddsMilli}
      className={cn(
        'group relative flex min-h-10 min-w-0 items-center overflow-hidden rounded-md border text-sm transition-colors',
        layout === 'stack' ? 'flex-col justify-center px-1 py-1' : 'justify-between gap-2 px-2.5',
        picked
          ? 'border-odds-active bg-odds-active text-odds-active-ink'
          : 'border-transparent bg-odds text-ink hover:bg-odds-hover',
        locked && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {flash ? (
        <motion.span
          key={flash.n}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 2.2, ease: 'easeOut' }}
          style={{ backgroundColor: flash.dir === 'up' ? 'var(--color-odds-up)' : 'var(--color-odds-down)' }}
        />
      ) : null}
      {label ? (
        <span className={cn('relative truncate text-xs', picked ? 'text-odds-active-ink/80' : 'text-ink-muted', layout === 'row' && 'text-left')}>
          {label}
        </span>
      ) : null}
      <span className="relative flex items-center gap-0.5 font-bold tabular-nums">
        {locked ? (
          <Lock className="size-3.5" aria-label="locked" />
        ) : (
          <>
            {selection.boosted ? <Zap className="size-3 fill-boost text-boost" aria-hidden="true" /> : null}
            {flash?.dir === 'up' ? <ArrowUp className="size-3 text-odds-up" aria-hidden="true" /> : null}
            {flash?.dir === 'down' ? <ArrowDown className="size-3 text-odds-down" aria-hidden="true" /> : null}
            {f.odds(selection.oddsMilli)}
          </>
        )}
      </span>
    </button>
  );
}
