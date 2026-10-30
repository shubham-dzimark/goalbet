'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { type CountryGroupDto, type EventSummaryDto } from '@goalbet/shared';
import { EmptyState, cn } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Reveal, RevealHeading } from '@/components/fx/reveal';
import { Segmented } from '@/components/fx/segmented';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { MatchCard } from './match-card';

/** Upcoming matches: league rail + day tabs + animated card grid. */
export function MatchBoard({ initial }: { initial?: EventSummaryDto[] | null }) {
  const t = useTranslations();
  const f = useFormat();
  const [league, setLeague] = useState<string>('all');
  const { data: events } = useQuery({
    queryKey: ['upcoming-week'],
    queryFn: () => api<EventSummaryDto[]>('/catalog/upcoming?hours=168'),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: 30_000,
  });
  const { data: countries } = useQuery({ queryKey: ['countries'], queryFn: () => api<CountryGroupDto[]>('/catalog/countries'), staleTime: 60_000 });

  const days = useMemo(() => [...new Set((events ?? []).map((e) => f.dayKey(e.startTime)))].slice(0, 7), [events, f]);
  const [dayState, setDay] = useState<string | null>(null);
  const day = dayState && days.includes(dayState) ? dayState : (days[0] ?? '');

  const comps = (countries ?? []).flatMap((c) => c.competitions);
  const filtered = (events ?? []).filter((e) => f.dayKey(e.startTime) === day && (league === 'all' || e.competition.id === league));

  return (
    <section id="board" aria-labelledby="board-title" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <RevealHeading id="board-title" className="font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          {t('home.board')}
        </RevealHeading>
        {days.length > 0 ? (
          <Segmented
            ariaLabel={t('home.board')}
            value={day}
            onChange={setDay}
            options={days.map((d) => ({ value: d, label: f.day(`${d}T12:00:00Z`) }))}
          />
        ) : null}
      </div>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t('home.competitions')}>
        {[{ id: 'all', name: t('home.allLeagues'), countryCode: '' }, ...comps].map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={league === c.id}
            onClick={() => setLeague(c.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-all duration-200',
              league === c.id ? 'bg-ink text-surface ring-ink' : 'bg-tint/[0.04] text-ink-muted ring-line hover:text-ink hover:ring-line-strong',
            )}
          >
            {c.countryCode ? <Flag code={c.countryCode} /> : null}
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-[var(--radius-card)]">
          <EmptyState title={t('sport.noMatches')} />
        </div>
      ) : (
        <Reveal className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" deps={[day, league, filtered.length]}>
          {filtered.map((e) => (
            <MatchCard key={e.id} event={e} />
          ))}
        </Reveal>
      )}
    </section>
  );
}
