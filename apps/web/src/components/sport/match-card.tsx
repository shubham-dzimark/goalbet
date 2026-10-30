'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { type EventSummaryDto } from '@goalbet/shared';
import { LiveDot, cn } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Countdown } from '@/components/fx/match-clock';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useFormat, useMatchClock } from '@/lib/format';
import { useTilt } from '@/lib/use-interactions';
import { OddsButton } from './odds-button';

const SOON_MS = 3 * 3_600_000;

function KickoffTag({ event }: { event: EventSummaryDto }) {
  const f = useFormat();
  const clock = useMatchClock()(event);
  if (event.status === 'LIVE') {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold text-live">
        <LiveDot className="size-1.5" />
        {clock}
      </span>
    );
  }
  const soon = new Date(event.startTime).getTime() - Date.now() < SOON_MS;
  return soon ? (
    <Countdown to={event.startTime} className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-bold text-accent" />
  ) : (
    <span className="text-[11px] font-semibold text-ink-muted">{f.kickoff(event.startTime)}</span>
  );
}

function TeamLine({ name, logo, score, live }: { name: string; logo: string | null; score: number; live: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <TeamCrest name={name} logo={logo} size={26} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</span>
      {live ? <span className="font-display text-xl font-bold tabular-nums">{score}</span> : null}
    </div>
  );
}

/** Board card: league, kick-off (countdown when close, minute when live), teams with crests, 1 X 2. */
export function MatchCard({ event }: { event: EventSummaryDto }) {
  const t = useTranslations();
  const live = event.status === 'LIVE';
  const market = event.mainMarket;
  const ref = useRef<HTMLElement>(null);
  useTilt(ref, { max: 5, lift: 5 });
  return (
    <article
      ref={ref}
      data-reveal
      data-testid="event-row"
      className={cn(
        'glass spotlight-hover group flex flex-col gap-3 rounded-[var(--radius-card)] p-4 transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-[var(--shadow-float)]',
        live && 'border-live/25',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          <Flag code={event.competition.countryCode} />
          <span className="truncate">{event.competition.name}</span>
        </span>
        <KickoffTag event={event} />
      </div>
      <Link href={`/match/${event.id}`} className="flex flex-col gap-2">
        <TeamLine name={event.homeTeam} logo={event.homeLogo} score={event.homeScore} live={live} />
        <TeamLine name={event.awayTeam} logo={event.awayLogo} score={event.awayScore} live={live} />
      </Link>
      <div className="mt-auto flex items-center gap-1.5">
        <div className="grid flex-1 grid-cols-3 gap-1.5">
          {market?.selections.map((s) => (
            <OddsButton key={s.id} event={event} market={market} selection={s} label={t(`outcomes.${s.outcome}`)} className="px-2.5" />
          ))}
        </div>
        <Link
          href={`/match/${event.id}`}
          aria-label={t('sport.moreMarkets', { count: event.marketCount })}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint/[0.04] text-[11px] font-bold text-ink-muted ring-1 ring-line transition-colors hover:text-brand hover:ring-brand/40"
        >
          <span className="flex flex-col items-center leading-none">
            +{Math.max(0, event.marketCount - 1)}
            <ChevronRight className="size-3" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </article>
  );
}

/** Dense row for long lists (competition and live pages). */
export function MatchRow({ event, active = false, onSelect }: { event: EventSummaryDto; active?: boolean; onSelect?: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const clock = useMatchClock()(event);
  const live = event.status === 'LIVE';
  const market = event.mainMarket;
  const Teams = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="w-12 shrink-0 text-center">
        {live ? (
          <span className="font-display text-sm font-bold text-live">{clock}</span>
        ) : (
          <span className="flex flex-col text-xs">
            <span className="font-bold">{f.time(event.startTime)}</span>
            <span className="text-[10px] text-ink-faint">{f.day(event.startTime)}</span>
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {[
          [event.homeTeam, event.homeScore, event.homeLogo],
          [event.awayTeam, event.awayScore, event.awayLogo],
        ].map(([n, s, logo]) => (
          <p key={String(n)} className="flex items-center gap-2 text-sm font-semibold">
            <TeamCrest name={String(n)} logo={logo as string | null} size={18} />
            <span className="min-w-0 flex-1 truncate">{n}</span>
            {live ? <span className="font-display text-base font-bold tabular-nums">{s}</span> : null}
          </p>
        ))}
      </div>
    </div>
  );
  return (
    <div
      data-reveal
      data-testid="event-row"
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5 transition-colors sm:grid-cols-[minmax(0,1fr)_minmax(0,260px)_auto]',
        active ? 'bg-brand/[0.07] ring-1 ring-brand/30' : 'hover:bg-tint/[0.035]',
      )}
    >
      {onSelect ? (
        <button type="button" onClick={onSelect} className="col-span-2 text-left sm:col-span-1">
          {Teams}
        </button>
      ) : (
        <Link href={`/match/${event.id}`} className="col-span-2 sm:col-span-1">
          {Teams}
        </Link>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {market?.selections.map((s) => (
          <OddsButton key={s.id} event={event} market={market} selection={s} label={t(`outcomes.${s.outcome}`)} className="h-10 px-2" />
        ))}
      </div>
      <Link href={`/match/${event.id}`} className="flex h-10 items-center rounded-xl px-2 text-xs font-bold text-ink-muted hover:text-brand">
        +{Math.max(0, event.marketCount - 1)}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
