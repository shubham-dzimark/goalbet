'use client';

import { useTranslations } from 'next-intl';
import { type CompetitionDto, type EventSummaryDto } from '@goalbet/shared';
import { EmptyState } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Link } from '@/i18n/navigation';
import { EventList, PageTitle } from './event-list';

export function SearchView({ q, result }: { q: string; result: { competitions: CompetitionDto[]; events: EventSummaryDto[] } | null }) {
  const t = useTranslations('sport');
  return (
    <>
      <PageTitle sub={t('searchTitle')}>{q ? `“${q}”` : t('searchTitle')}</PageTitle>
      <form role="search" className="mb-5">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder={t('searchHint')}
          className="h-12 w-full rounded-2xl border border-line bg-tint/[0.04] px-4 text-base text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
        />
      </form>
      {!result ? (
        <div className="glass rounded-[var(--radius-card)]">
          <EmptyState title={t('searchHint')} />
        </div>
      ) : (
        <div className="space-y-4">
          {result.competitions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {result.competitions.map((c) => (
                <Link key={c.id} href={`/sport/${c.id}`} className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold hover:border-brand/40">
                  <Flag code={c.countryCode} />
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
