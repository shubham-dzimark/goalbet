'use client';

import { Zap } from 'lucide-react';
import { useRef } from 'react';
import { type BoostDto } from '@goalbet/shared';
import { Flag } from '@/components/fx/flag';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';
import { useTilt } from '@/lib/use-interactions';
import { OddsButton } from './odds-button';

/** "Power boost" card with an animated gradient border (F1.1 boosted odds). */
export function BoostCard({ boost }: { boost: BoostDto }) {
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const { event, market, selection } = boost;
  const ref = useRef<HTMLElement>(null);
  useTilt(ref, { max: 7, lift: 6 });
  return (
    <article ref={ref} data-reveal data-testid="boost-card" className="ring-animated spotlight-hover w-[300px] shrink-0 snap-start rounded-[var(--radius-card)] bg-card-solid p-4 sm:w-[320px]">
      <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        <span className="flex items-center gap-2">
          <Flag code={event.competition.countryCode} />
          {event.competition.name}
        </span>
        <span>{f.kickoff(event.startTime)}</span>
      </div>
      <Link href={`/match/${event.id}`} className="mb-3 flex items-center gap-2">
        <span className="flex -space-x-2">
          <TeamCrest name={event.homeTeam} logo={event.homeLogo} size={30} />
          <TeamCrest name={event.awayTeam} logo={event.awayLogo} size={30} />
        </span>
        <span className="min-w-0 truncate text-sm font-bold">
          {event.homeTeam} – {event.awayTeam}
        </span>
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs text-ink-muted">{marketTitle(market, event)}</p>
          <p className="flex items-center gap-1.5 truncate font-display text-xl font-bold uppercase italic">
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
