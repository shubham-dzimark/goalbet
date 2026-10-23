'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type Page, type TicketDto } from '@goalbet/shared';
import { Badge, Button, Card, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger } from '@goalbet/ui';
import { TicketCard } from '@/components/bets/ticket-card';
import { PageTitle } from '@/components/sport/event-list';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/use-require-auth';

type Tab = 'active' | 'settled' | 'cashout';

/** F1.7 — My Bets: Active, Settled, Cash Out history. */
export default function MyBetsPage() {
  const t = useTranslations('bets');
  const authed = useRequireAuth();
  const [tab, setTab] = useState<Tab>('active');
  const counts = useQuery({
    queryKey: ['ticket-counts'],
    queryFn: () => api<Record<Tab, number>>('/tickets/counts'),
    enabled: authed,
  });
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
      <PageTitle>{t('title')}</PageTitle>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="mb-4">
          {(['active', 'settled', 'cashout'] as const).map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`bets-tab-${k}`}>
              {t(k)}
              {counts.data ? <Badge className="ml-1.5">{counts.data[k]}</Badge> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {!authed || list.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <EmptyState title={t('empty')} />
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
          {list.hasNextPage ? (
            <Button variant="outline" className="w-full" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              {t('loadMore')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
