'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { use } from 'react';
import { type TicketDto } from '@goalbet/shared';
import { Card, EmptyState, Skeleton } from '@goalbet/ui';
import { useCashOutOffers } from '@/components/bets/cash-out';
import { TicketCard } from '@/components/bets/ticket-card';
import { PageTitle } from '@/components/sport/event-list';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useWatch } from '@/lib/realtime';
import { useRequireAuth } from '@/lib/use-require-auth';

/** F1.7 ticket detail. */
export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('bets');
  const authed = useRequireAuth();
  const { data, isPending, isError } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api<TicketDto>(`/tickets/${id}`),
    enabled: authed,
    refetchInterval: (q) => (q.state.data && ['ACTIVE', 'LIVE', 'PENDING'].includes(q.state.data.status) ? 5_000 : false),
  });
  const open = !!data && ['ACTIVE', 'LIVE', 'PENDING'].includes(data.status);
  const offers = useCashOutOffers(authed && open);
  useWatch({ eventIds: open ? data.legs.map((l) => l.event.id) : [] });
  return (
    <div className="max-w-2xl">
      <Link href="/my-bets" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-brand">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('back')}
      </Link>
      <PageTitle>{t('details')}</PageTitle>
      {isError ? (
        <Card>
          <EmptyState title={t('empty')} />
        </Card>
      ) : !authed || isPending ? (
        <Skeleton className="h-60" />
      ) : (
        <TicketCard ticket={data} link={false} cashOut={offers.data?.get(data.id)} />
      )}
    </div>
  );
}
