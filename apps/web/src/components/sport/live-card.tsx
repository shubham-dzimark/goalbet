'use client';

import { useTranslations } from 'next-intl';
import { type EventSummaryDto } from '@goalbet/shared';
import { LiveDot } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { useMatchClock } from '@/lib/format';
import { OddsButton } from './odds-button';

/** Top Live carousel card (F1.1). */
export function LiveCard({ event }: { event: EventSummaryDto }) {
  const t = useTranslations();
  const clock = useMatchClock()(event);
  const market = event.mainMarket;
  return (
    <article className="flex w-[280px] shrink-0 snap-start flex-col rounded-[var(--radius-card)] border border-line bg-card p-3 shadow-xs" data-testid="live-card">
      <Link href={`/match/${event.id}`} className="mb-2 block">
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase text-ink-faint">
          <span className="truncate">{event.competition.name}</span>
          <span className="flex items-center gap-1.5 text-live">
            <LiveDot />
            {clock}
          </span>
        </div>
        {[
          [event.homeTeam, event.homeScore],
          [event.awayTeam, event.awayScore],
        ].map(([team, score]) => (
          <p key={String(team)} className="flex items-center justify-between text-sm font-bold">
            <span className="truncate">{team}</span>
            <span className="ml-2 rounded bg-chrome px-1.5 text-chrome-ink tabular-nums">{score}</span>
          </p>
        ))}
      </Link>
      <div className="mt-auto grid grid-cols-3 gap-1.5">
        {market
          ? market.selections.map((s) => (
              <OddsButton key={s.id} event={event} market={market} selection={s} label={t(`outcomes.${s.outcome}`)} />
            ))
          : null}
      </div>
    </article>
  );
}
