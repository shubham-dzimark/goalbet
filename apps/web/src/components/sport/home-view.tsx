'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type EventSummaryDto, type HomeFeedDto } from '@goalbet/shared';
import { Flag } from '@/components/fx/flag';
import { Reveal, RevealHeading } from '@/components/fx/reveal';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { usePoll, useWatch } from '@/lib/realtime';
import { BoostCard } from './boost-card';
import { LiveSpotlight } from './live-spotlight';
import { MatchBoard } from './match-board';
import { StadiumHero } from './stadium-hero';

function CompetitionTile({ competition: c }: { competition: HomeFeedDto['topCompetitions'][number] }) {
  const t = useTranslations();
  return (
    <Link
      href={`/sport/${c.id}`}
      className="glass group relative flex min-h-32 flex-col rounded-[var(--radius-card)] p-5 transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-float)]"
    >
      <Flag code={c.countryCode} className="h-5 w-7" />
      <p className="mt-auto pt-6 font-display text-lg font-semibold leading-tight tracking-tight">{c.name}</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">{t('home.matchesCount', { count: c.upcoming })}</p>
      <ChevronRight className="absolute right-4 top-5 size-4 text-ink-faint transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden="true" />
    </Link>
  );
}

/** Section title: one size, sentence case, no ornament (the content carries the colour). */
const sectionTitle = 'mb-5 font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]';

/** F1.1 homepage: stadium hero → live spotlight → power boosts → match board → top competitions. */
export function HomeView({ initial, upcoming }: { initial: HomeFeedDto | null; upcoming: EventSummaryDto[] | null }) {
  const t = useTranslations();
  const f = useFormat();
  const poll = usePoll(6_000);
  useWatch({ live: true });
  const { data } = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeFeedDto>('/catalog/home'),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: poll,
  });

  // hero stack: live matches first, then the next kick-offs with prices; the spotlight below
  // already features the top match, so it is left out here
  const spotlightId = data?.topLive[0]?.id ?? data?.topMatches[0]?.id;
  const heroMatches = [...(data?.topLive ?? []), ...(upcoming ?? []).filter((e) => e.status === 'SCHEDULED')]
    .filter((e, i, all) => e.mainMarket && e.id !== spotlightId && all.findIndex((x) => x.id === e.id) === i)
    .slice(0, 3);

  return (
    <div className="space-y-12 lg:space-y-24">
      <StadiumHero
        live={data?.liveCount ?? 0}
        today={(upcoming ?? []).filter((e) => f.dayKey(e.startTime) === f.todayKey()).length}
        competitions={data?.topCompetitions.length ?? 0}
        boosted={data?.boosted.length ?? 0}
        matches={heroMatches}
      />

      {data ? <LiveSpotlight live={data.topLive} upcoming={data.topMatches} /> : null}

      {data && data.boosted.length > 0 ? (
        <section aria-labelledby="boosted">
          <RevealHeading id="boosted" className={sectionTitle}>
            {t('home.boosted')}
          </RevealHeading>
          {/* room inside the scroller for the hover lift and shadow (scroll containers clip overflow) */}
          <Reveal className="no-scrollbar -mx-4 -mb-16 -mt-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-16 pt-4" deps={[data.boosted.length]}>
            {data.boosted.map((b) => (
              <BoostCard key={b.selection.id} boost={b} />
            ))}
          </Reveal>
        </section>
      ) : null}

      <MatchBoard initial={upcoming} />

      {data && data.topCompetitions.length > 0 ? (
        <section aria-labelledby="top-competitions">
          <RevealHeading id="top-competitions" className={sectionTitle}>
            {t('home.topCompetitions')}
          </RevealHeading>
          <Reveal className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {data.topCompetitions.map((c) => (
              <CompetitionTile key={c.id} competition={c} />
            ))}
          </Reveal>
        </section>
      ) : null}
    </div>
  );
}
