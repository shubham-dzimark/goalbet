'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type EventSummaryDto } from '@goalbet/shared';
import { LiveDot } from '@goalbet/ui';
import { api } from '@/lib/api';
import { EventList, PageTitle } from './event-list';

/** F1.6 — live list with scores, minute and live odds (polling now; WebSocket in phase 4). */
export function LiveView({ initial }: { initial: EventSummaryDto[] | null }) {
  const t = useTranslations('sport');
  const { data } = useQuery({
    queryKey: ['live'],
    queryFn: () => api<EventSummaryDto[]>('/catalog/live'),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: 4_000,
  });
  return (
    <>
      <PageTitle>
        <span className="flex items-center gap-3">
          <LiveDot className="size-3" />
          {t('liveNow')}
        </span>
      </PageTitle>
      <EventList events={data ?? []} groupBy="competition" empty={t('noLive')} />
    </>
  );
}
