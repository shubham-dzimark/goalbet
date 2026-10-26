'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { type CompetitionDto, type CountryGroupDto, type EventSummaryDto } from '@goalbet/shared';
import { EmptyState } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Reveal } from '@/components/fx/reveal';
import { Segmented } from '@/components/fx/segmented';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { EventList, PageTitle } from './event-list';
import { MatchCard } from './match-card';

/** F1.5 — one competition: hero banner, day tabs, match cards. */
export function CompetitionView({ id, initial }: { id: string; initial: { competition: CompetitionDto; events: EventSummaryDto[] } | null }) {
  const t = useTranslations();
  const f = useFormat();
  const { data, isError } = useQuery({
    queryKey: ['competition', id],
    queryFn: () => api<{ competition: CompetitionDto; events: EventSummaryDto[] }>(`/catalog/competitions/${id}`),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: 15_000,
  });
  const days = useMemo(() => [...new Set((data?.events ?? []).map((e) => f.dayKey(e.startTime)))], [data, f]);
  const [dayState, setDay] = useState<string>('all');
  const day = dayState === 'all' || days.includes(dayState) ? dayState : 'all';

  if (isError || !data) return <EmptyState title={t('sport.noMatches')} />;
  const c = data.competition;
  const live = data.events.filter((e) => e.status === 'LIVE');
  const shown = day === 'all' ? data.events : data.events.filter((e) => f.dayKey(e.startTime) === day);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong p-6 sm:p-8">
        <div aria-hidden="true" className="absolute -right-10 -top-10 opacity-20 blur-sm">
          <Flag code={c.countryCode} className="h-56 w-80 rotate-12 rounded-3xl" />
        </div>
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(40rem_20rem_at_0%_0%,rgb(var(--brand-rgb)/0.12),transparent_60%)]" />
        <div className="relative">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand">
            <Flag code={c.countryCode} />
            {t(`countries.${c.countryCode}`)}
          </p>
          <h1 className="font-display text-5xl font-extrabold uppercase italic leading-none sm:text-6xl">{c.name}</h1>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-tint/[0.07] px-3 py-1 font-semibold">{t('home.matchesCount', { count: data.events.length })}</span>
            {live.length > 0 ? (
              <span className="flex items-center gap-1.5 rounded-full bg-live/15 px-3 py-1 font-semibold text-live">
                <Radio className="size-3.5" aria-hidden="true" />
                {t('live.kicker', { count: live.length })}
              </span>
            ) : null}
          </div>
        </div>
      </section>
      {days.length > 1 ? (
        <Segmented
          value={day}
          onChange={setDay}
          options={[{ value: 'all', label: t('common.all') }, ...days.map((d) => ({ value: d, label: f.day(`${d}T12:00:00Z`) }))]}
        />
      ) : null}
      {shown.length === 0 ? (
        <div className="glass rounded-[var(--radius-card)]">
          <EmptyState title={t('sport.noMatches')} />
        </div>
      ) : (
        <Reveal className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" deps={[day, shown.length]}>
          {shown.map((e) => (
            <MatchCard key={e.id} event={e} />
          ))}
        </Reveal>
      )}
    </div>
  );
}

/** F1.5 — Sport A–Z: countries → competitions as tiles, then everything in the next 24 h. */
export function SportView({ countries, upcoming }: { countries: CountryGroupDto[] | null; upcoming: EventSummaryDto[] | null }) {
  const t = useTranslations();
  const { data } = useQuery({
    queryKey: ['upcoming-24'],
    queryFn: () => api<EventSummaryDto[]>('/catalog/upcoming?hours=24'),
    ...(upcoming ? { initialData: upcoming } : {}),
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageTitle sub={t('sport.kicker')}>{t('sport.title')}</PageTitle>
      <Reveal className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(countries ?? []).flatMap((country) =>
          country.competitions.map((comp) => (
            <Link
              key={comp.id}
              href={`/sport/${comp.id}`}
              className="glass group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-card)] p-4 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40"
            >
              <Flag code={country.countryCode} className="h-9 w-12 rounded-md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ink-faint">{t(`countries.${country.countryCode}`)}</span>
                <span className="block truncate font-display text-xl font-bold uppercase italic">{comp.name}</span>
              </span>
              <span className="text-right text-xs">
                {comp.live > 0 ? <span className="block font-bold text-live">LIVE {comp.live}</span> : null}
                <span className="text-ink-muted">{comp.upcoming}</span>
              </span>
              <ArrowUpRight className="size-4 text-ink-faint transition-colors group-hover:text-brand" aria-hidden="true" />
            </Link>
          )),
        )}
      </Reveal>
      <h2 className="mb-3 font-display text-2xl font-bold uppercase italic">{t('sport.next24')}</h2>
      <EventList events={data ?? []} groupBy="competition" />
    </>
  );
}
