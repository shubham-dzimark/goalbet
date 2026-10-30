'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type EventSummaryDto } from '@goalbet/shared';
import { EmptyState } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Reveal } from '@/components/fx/reveal';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { MatchRow } from './match-card';

/** Big italic page title with an accent kicker. */
export function PageTitle({ children, sub, right }: { children: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {sub ? <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-brand">{sub}</p> : null}
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">{children}</h1>
      </div>
      {right}
    </div>
  );
}

/** Matches grouped by competition (live, search) or by day (competition page), as glass panels. */
export function EventList({
  events,
  groupBy,
  empty,
  selectedId,
  onSelect,
}: {
  events: EventSummaryDto[];
  groupBy: 'day' | 'competition';
  empty?: string;
  selectedId?: string | null;
  onSelect?: (e: EventSummaryDto) => void;
}) {
  const t = useTranslations();
  const f = useFormat();
  if (events.length === 0) {
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState title={empty ?? t('sport.noMatches')} />
      </div>
    );
  }
  const groups = new Map<string, { head: React.ReactNode; href?: string; events: EventSummaryDto[] }>();
  for (const e of events) {
    const key = groupBy === 'day' ? f.dayKey(e.startTime) : e.competition.id;
    const g =
      groups.get(key) ??
      (groupBy === 'day'
        ? { head: <span className="font-display tracking-tight text-lg font-semibold">{f.day(e.startTime)}</span>, events: [] as EventSummaryDto[] }
        : {
            head: (
              <span className="flex items-center gap-2.5">
                <Flag code={e.competition.countryCode} />
                <span className="font-display tracking-tight text-lg font-semibold">{e.competition.name}</span>
                <span className="text-xs text-ink-faint">{t(`countries.${e.competition.countryCode}`)}</span>
              </span>
            ),
            href: `/sport/${e.competition.id}`,
            events: [] as EventSummaryDto[],
          });
    g.events.push(e);
    groups.set(key, g);
  }
  return (
    <Reveal className="space-y-4" deps={[events.length, groupBy]}>
      {[...groups.entries()].map(([key, g]) => (
        <section key={key} className="glass rounded-[var(--radius-card)] p-2">
          <div className="flex items-center justify-between px-3 py-2">
            {g.head}
            {g.href ? (
              <Link href={g.href} className="flex items-center text-xs font-semibold text-ink-muted hover:text-brand">
                {g.events.length}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          <div className="space-y-0.5">
            {g.events.map((e) => (
              <MatchRow key={e.id} event={e} active={selectedId === e.id} {...(onSelect ? { onSelect: () => onSelect(e) } : {})} />
            ))}
          </div>
        </section>
      ))}
    </Reveal>
  );
}
