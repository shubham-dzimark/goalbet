'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type EventSummaryDto } from '@goalbet/shared';
import { Badge, LiveDot, cn } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { useFormat, useMatchClock } from '@/lib/format';
import { OddsButton } from './odds-button';

/** One match in a list (F1.5 / F1.6): time or live clock, teams (+score), 1 X 2, "+N markets". */
export function EventRow({ event, showCompetition = false }: { event: EventSummaryDto; showCompetition?: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  const clock = useMatchClock()(event);
  const live = event.status === 'LIVE';
  const market = event.mainMarket;

  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:grid-cols-[1fr_minmax(0,240px)_auto]"
      data-testid="event-row"
    >
      <Link href={`/match/${event.id}`} className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
        <div className="w-12 shrink-0 text-center text-xs">
          {live ? (
            <span className="flex flex-col items-center gap-0.5 font-bold text-live">
              <LiveDot />
              {clock}
            </span>
          ) : (
            <span className="flex flex-col text-ink-muted">
              <span className="font-semibold text-ink">{f.time(event.startTime)}</span>
              <span className="text-[11px]">{f.day(event.startTime)}</span>
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {showCompetition ? (
            <p className="truncate text-[11px] font-semibold uppercase text-ink-faint">{event.competition.name}</p>
          ) : null}
          <p className="flex items-center justify-between gap-2 truncate text-sm font-semibold">
            <span className="truncate">{event.homeTeam}</span>
            {live ? <span className="font-bold tabular-nums">{event.homeScore}</span> : null}
          </p>
          <p className="flex items-center justify-between gap-2 truncate text-sm font-semibold">
            <span className="truncate">{event.awayTeam}</span>
            {live ? <span className="font-bold tabular-nums">{event.awayScore}</span> : null}
          </p>
        </div>
      </Link>
      <div className="grid grid-cols-3 gap-1.5">
        {market
          ? market.selections.map((s) => (
              <OddsButton key={s.id} event={event} market={market} selection={s} label={t(`outcomes.${s.outcome}`)} />
            ))
          : null}
      </div>
      <Link
        href={`/match/${event.id}`}
        className={cn('flex h-10 items-center gap-0.5 rounded-md px-2 text-xs font-bold text-ink-muted hover:bg-card-alt hover:text-ink')}
        aria-label={t('sport.moreMarkets', { count: event.marketCount })}
      >
        {event.suspended ? <Badge tone="warning">{t('sport.suspended')}</Badge> : `+${Math.max(0, event.marketCount - 1)}`}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
