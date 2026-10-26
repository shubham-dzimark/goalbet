'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Trophy, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { type EventSummaryDto, type HomeFeedDto } from '@goalbet/shared';
import { Flag } from '@/components/fx/flag';
import { Reveal, RevealHeading } from '@/components/fx/reveal';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { usePoll, useWatch } from '@/lib/realtime';
import { useTilt } from '@/lib/use-interactions';
import { BoostCard } from './boost-card';
import { LiveSpotlight } from './live-spotlight';
import { MatchBoard } from './match-board';
import { StadiumHero } from './stadium-hero';

function CompetitionTile({ competition: c }: { competition: HomeFeedDto['topCompetitions'][number] }) {
  const t = useTranslations();
  const ref = useRef<HTMLAnchorElement>(null);
  useTilt(ref, { max: 8, lift: 4 });
  return (
    <Link
      ref={ref}
      href={`/sport/${c.id}`}
      className="glass spotlight-hover group overflow-hidden rounded-[var(--radius-card)] p-4 transition-[border-color] duration-300 hover:border-brand/40"
    >
      <Flag code={c.countryCode} className="h-5 w-7" />
      <p className="mt-3 font-display text-xl font-bold uppercase italic leading-tight">{c.name}</p>
      <p className="text-xs text-ink-muted">{t('home.matchesCount', { count: c.upcoming })}</p>
      <ArrowUpRight className="absolute right-3 top-3 size-4 text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden="true" />
    </Link>
  );
}

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

  return (
    <div className="space-y-10">
      <StadiumHero
        live={data?.liveCount ?? 0}
        today={(upcoming ?? []).filter((e) => f.dayKey(e.startTime) === f.todayKey()).length}
        competitions={data?.topCompetitions.length ?? 0}
        boosted={data?.boosted.length ?? 0}
      />

      {data ? <LiveSpotlight live={data.topLive} upcoming={data.topMatches} /> : null}

      {data && data.boosted.length > 0 ? (
        <section aria-labelledby="boosted">
          <RevealHeading id="boosted" className="mb-3 flex items-center gap-2 font-display text-2xl font-bold uppercase italic">
            <Zap className="size-5 fill-boost text-boost" aria-hidden="true" />
            <span data-split>{t('home.boosted')}</span>
          </RevealHeading>
          <Reveal className="no-scrollbar -mx-2 -my-3 flex snap-x gap-3 overflow-x-auto px-2 py-3" deps={[data.boosted.length]}>
            {data.boosted.map((b) => (
              <BoostCard key={b.selection.id} boost={b} />
            ))}
          </Reveal>
        </section>
      ) : null}

      <MatchBoard initial={upcoming} />

      {data && data.topCompetitions.length > 0 ? (
        <section aria-labelledby="top-competitions">
          <RevealHeading id="top-competitions" className="mb-3 flex items-center gap-2 font-display text-2xl font-bold uppercase italic">
            <Trophy className="size-5 text-accent" aria-hidden="true" />
            <span data-split>{t('home.topCompetitions')}</span>
          </RevealHeading>
          <Reveal className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.topCompetitions.map((c) => (
              <CompetitionTile key={c.id} competition={c} />
            ))}
          </Reveal>
        </section>
      ) : null}
    </div>
  );
}
