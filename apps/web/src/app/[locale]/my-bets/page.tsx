'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type Page, type TicketDto } from '@goalbet/shared';
import { Button, EmptyState, Skeleton } from '@goalbet/ui';
import { TicketCard } from '@/components/bets/ticket-card';
import { Reveal } from '@/components/fx/reveal';
import { Segmented } from '@/components/fx/segmented';
import { PageTitle } from '@/components/sport/event-list';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';

type Tab = 'active' | 'settled' | 'cashout';

/** F1.7 — My Bets: Active, Settled, Cash Out history. */
export default function MyBetsPage() {
  const t = useTranslations('bets');
  const authed = useRequireAuth();
  const [tab, setTab] = useState<Tab>('active');
  const counts = useQuery({ queryKey: ['ticket-counts'], queryFn: () => api<Record<Tab, number>>('/tickets/counts'), enabled: authed });
  const list = useInfiniteQuery({
    queryKey: ['tickets', tab],
    queryFn: ({ pageParam }) => api<Page<TicketDto>>(`/tickets?tab=${tab}&limit=10${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: authed,
    refetchInterval: tab === 'active' ? 10_000 : false,
  });
  const tickets = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div>
      <PageTitle
        sub={t('kicker')}
        right={
          <Segmented
            value={tab}
            onChange={setTab}
            options={(['active', 'settled', 'cashout'] as const).map((k) => ({
              value: k,
              label: t(k),
              badge: counts.data ? counts.data[k] : undefined,
              testId: `bets-tab-${k}`,
            }))}
          />
        }
      >
        {t('title')}
      </PageTitle>
      {!authed || list.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="glass rounded-[var(--radius-card)]">
          <EmptyState icon={<Receipt className="size-10 text-ink-faint" aria-hidden="true" />} title={t('empty')}>
            <Button asChild size="sm" className="mt-2">
              <Link href="/">{t('browse')}</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <>
          <Reveal className="grid items-start gap-4 xl:grid-cols-2" deps={[tab, tickets.length]}>
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </Reveal>
          {list.hasNextPage ? (
            <Button variant="outline" className="mt-4 w-full" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              {t('loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
