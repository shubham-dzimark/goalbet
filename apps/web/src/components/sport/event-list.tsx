'use client';

import { useTranslations } from 'next-intl';
import { type EventSummaryDto } from '@goalbet/shared';
import { Card, EmptyState } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { EventRow } from './event-row';

/** Matches grouped by date (pre-match, F1.5) or by competition (live, F1.6). */
export function EventList({ events, groupBy, empty }: { events: EventSummaryDto[]; groupBy: 'day' | 'competition'; empty?: string }) {
  const t = useTranslations();
  const f = useFormat();
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState title={empty ?? t('sport.noMatches')} />
      </Card>
    );
  }
  const groups = new Map<string, { title: React.ReactNode; events: EventSummaryDto[] }>();
  for (const e of events) {
    const key = groupBy === 'day' ? f.dayKey(e.startTime) : e.competition.id;
    const title =
      groupBy === 'day' ? (
        f.day(e.startTime)
      ) : (
        <Link href={`/sport/${e.competition.id}`} className="hover:underline">
          <span className="text-ink-faint">{e.competition.country} · </span>
          {e.competition.name}
        </Link>
      );
    const g = groups.get(key) ?? { title, events: [] as EventSummaryDto[] };
    g.events.push(e);
    groups.set(key, g);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([key, g]) => (
        <Card key={key} className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-card-alt px-3 py-2">
            <h3 className="text-sm font-bold">{g.title}</h3>
            <div className="hidden w-[240px] grid-cols-3 text-center text-xs font-bold text-ink-muted sm:mr-12 sm:grid">
              <span>1</span>
              <span>X</span>
              <span>2</span>
            </div>
          </div>
          {g.events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </Card>
      ))}
    </div>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      {sub ? <p className="text-xs font-semibold uppercase text-ink-faint">{sub}</p> : null}
      <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{children}</h1>
    </div>
  );
}
