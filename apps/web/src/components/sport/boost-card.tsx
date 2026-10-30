'use client';

import { Zap } from 'lucide-react';
import { type BoostDto } from '@goalbet/shared';
import { Flag } from '@/components/fx/flag';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';
import { OddsButton } from './odds-button';

/** Boosted price card (F1.1): a quiet gold hairline marks the boost; the price leads. */
export function BoostCard({ boost }: { boost: BoostDto }) {
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const { event, market, selection } = boost;
  return (
    <article data-reveal data-testid="boost-card" className="w-[300px] shrink-0 snap-start rounded-[var(--radius-card)] border border-accent/25 bg-card-solid p-5 sm:w-[320px] transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-float)]">
      <div className="mb-4 flex items-center justify-between gap-2 text-[12px] font-medium text-ink-muted">
        <span className="flex items-center gap-2">
          <Flag code={event.competition.countryCode} />
          {event.competition.name}
        </span>
        <span>{f.kickoff(event.startTime)}</span>
      </div>
      <Link href={`/match/${event.id}`} className="mb-4 flex items-center gap-2.5">
        <span className="flex -space-x-2">
          <TeamCrest name={event.homeTeam} logo={event.homeLogo} size={30} />
          <TeamCrest name={event.awayTeam} logo={event.awayLogo} size={30} />
        </span>
        <span className="min-w-0 truncate text-[15px] font-semibold">
          {event.homeTeam} – {event.awayTeam}
        </span>
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink-muted">{marketTitle(market, event)}</p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate font-display text-lg font-semibold tracking-tight">
            <Zap className="size-4 shrink-0 fill-boost text-boost" aria-hidden="true" />
            {outcomeLong(market, selection, event)}
          </p>
        </div>
        <div className="text-right">
          {selection.baseOddsMilli ? <p className="text-xs text-ink-faint line-through">{f.odds(selection.baseOddsMilli)}</p> : null}
          <OddsButton event={event} market={market} selection={selection} className="w-24 justify-center" />
        </div>
      </div>
    </article>
  );
}
