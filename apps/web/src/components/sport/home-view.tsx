'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Flame, Radio, Trophy, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type HomeFeedDto } from '@goalbet/shared';
import { Card, EmptyState } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';
import { EventRow } from './event-row';
import { LiveCard } from './live-card';
import { OddsButton } from './odds-button';

function SectionTitle({ icon, children, href, linkLabel }: { icon: React.ReactNode; children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide">
        {icon}
        {children}
      </h2>
      {href ? (
        <Link href={href} className="flex items-center text-sm font-semibold text-brand hover:underline">
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** F1.1 homepage centre feed. Refreshes every few seconds (live updates over WebSocket in phase 4). */
export function HomeView({ initial }: { initial: HomeFeedDto | null }) {
  const t = useTranslations();
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const { data } = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeFeedDto>('/catalog/home'),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: 8_000,
  });

  if (!data) return <EmptyState title={t('sport.noMatches')} />;

  return (
    <div className="space-y-6">
      <section aria-labelledby="top-live">
        <SectionTitle icon={<Radio className="size-5 text-live" aria-hidden="true" />} href="/live" linkLabel={t('home.allLive')}>
          <span id="top-live">{t('home.topLive')}</span>
          <span className="rounded-full bg-live px-2 text-sm text-white">{data.liveCount}</span>
        </SectionTitle>
        {data.topLive.length === 0 ? (
          <Card>
            <EmptyState title={t('sport.noLive')} />
          </Card>
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {data.topLive.map((e) => (
              <LiveCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </section>

      {data.boosted.length > 0 ? (
        <section aria-labelledby="boosted">
          <SectionTitle icon={<Zap className="size-5 fill-boost text-boost" aria-hidden="true" />}>
            <span id="boosted">{t('home.boosted')}</span>
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {data.boosted.map((b) => (
              <article
                key={b.selection.id}
                className="flex min-w-0 items-center gap-3 rounded-[var(--radius-card)] border border-boost/40 bg-gradient-to-r from-amber-50 to-card p-3"
                data-testid="boost-card"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase text-ink-faint">
                    {b.event.competition.name} · {f.kickoff(b.event.startTime)}
                  </p>
                  <Link href={`/match/${b.event.id}`} className="block truncate text-sm font-bold hover:underline">
                    {b.event.homeTeam} – {b.event.awayTeam}
                  </Link>
                  <p className="truncate text-xs text-ink-muted">
                    {marketTitle(b.market, b.event)}: <strong className="text-ink">{outcomeLong(b.market, b.selection, b.event)}</strong>
                  </p>
                </div>
                <div className="text-right">
                  {b.selection.baseOddsMilli ? (
                    <p className="text-xs text-ink-faint line-through">{f.odds(b.selection.baseOddsMilli)}</p>
                  ) : null}
                  <OddsButton event={b.event} market={b.market} selection={b.selection} className="w-20" />
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="top-matches">
        <SectionTitle icon={<Flame className="size-5 text-warning" aria-hidden="true" />} href="/sport" linkLabel={t('sport.allCompetitions')}>
          <span id="top-matches">{t('home.topMatches')}</span>
        </SectionTitle>
        <Card>
          {data.topMatches.length === 0 ? (
            <EmptyState title={t('sport.noMatches')} />
          ) : (
            data.topMatches.map((e) => <EventRow key={e.id} event={e} showCompetition />)
          )}
        </Card>
      </section>

      <section aria-labelledby="top-competitions">
        <SectionTitle icon={<Trophy className="size-5 text-brand" aria-hidden="true" />}>
          <span id="top-competitions">{t('home.topCompetitions')}</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.topCompetitions.map((c) => (
            <Link
              key={c.id}
              href={`/sport/${c.id}`}
              className="flex flex-col rounded-[var(--radius-card)] border border-line bg-card p-3 hover:border-brand"
            >
              <span className="text-[11px] font-semibold uppercase text-ink-faint">{c.country}</span>
              <span className="font-display text-lg font-bold">{c.name}</span>
              <span className="text-xs text-ink-muted">{t('home.matchesCount', { count: c.upcoming })}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
