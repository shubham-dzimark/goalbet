'use client';

import { useTranslations } from 'next-intl';
import { type CompetitionDto, type EventSummaryDto } from '@goalbet/shared';
import { Card, EmptyState } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { EventList, PageTitle } from './event-list';

export function SearchView({ q, result }: { q: string; result: { competitions: CompetitionDto[]; events: EventSummaryDto[] } | null }) {
  const t = useTranslations('sport');
  return (
    <>
      <PageTitle>{q ? t('searchResults', { q }) : t('searchTitle')}</PageTitle>
      <form role="search" className="mb-4 sm:hidden">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('searchTitle')}
          className="h-10 w-full rounded-md border border-line bg-card px-3 text-sm"
        />
      </form>
      {!result ? (
        <Card>
          <EmptyState title={t('searchHint')} />
        </Card>
      ) : (
        <div className="space-y-4">
          {result.competitions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.competitions.map((c) => (
                <Link key={c.id} href={`/sport/${c.id}`} className="rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold hover:border-brand">
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}
          <EventList events={result.events} groupBy="competition" empty={t('searchEmpty')} />
        </div>
      )}
    </>
  );
}
