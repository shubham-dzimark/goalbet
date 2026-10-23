'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type CompetitionDto, type CountryGroupDto, type EventSummaryDto } from '@goalbet/shared';
import { Card, EmptyState } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { EventList, PageTitle } from './event-list';

/** F1.5 — one competition: matches for the next 7 days grouped by date. */
export function CompetitionView({ id, initial }: { id: string; initial: { competition: CompetitionDto; events: EventSummaryDto[] } | null }) {
  const t = useTranslations('sport');
  const { data, isError } = useQuery({
    queryKey: ['competition', id],
    queryFn: () => api<{ competition: CompetitionDto; events: EventSummaryDto[] }>(`/catalog/competitions/${id}`),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: 15_000,
  });
  if (isError || !data) return <EmptyState title={t('noMatches')} />;
  return (
    <>
      <PageTitle sub={`${t('title')} · ${data.competition.country}`}>{data.competition.name}</PageTitle>
      <EventList events={data.events} groupBy="day" />
    </>
  );
}

/** F1.5 — country → competition overview plus everything kicking off in the next 24 h. */
export function SportView({ countries, upcoming }: { countries: CountryGroupDto[] | null; upcoming: EventSummaryDto[] | null }) {
  const t = useTranslations('sport');
  const { data } = useQuery({
    queryKey: ['upcoming-24'],
    queryFn: () => api<EventSummaryDto[]>('/catalog/upcoming?hours=24'),
    ...(upcoming ? { initialData: upcoming } : {}),
    refetchInterval: 30_000,
  });
  return (
    <>
      <PageTitle>{t('title')}</PageTitle>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {(countries ?? []).map((c) => (
          <Card key={c.countryCode} className="p-3">
            <p className="mb-1 text-xs font-bold uppercase text-ink-faint">{c.country}</p>
            <ul className="space-y-1">
              {c.competitions.map((comp) => (
                <li key={comp.id}>
                  <Link href={`/sport/${comp.id}`} className="flex justify-between text-sm font-semibold hover:text-brand">
                    {comp.name}
                    <span className="text-xs font-normal text-ink-faint">
                      {comp.live > 0 ? <span className="mr-2 font-bold text-live">LIVE {comp.live}</span> : null}
                      {comp.upcoming}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <h2 className="mb-2 font-display text-xl font-bold uppercase">{t('next24')}</h2>
      <EventList events={data ?? []} groupBy="competition" />
    </>
  );
}
