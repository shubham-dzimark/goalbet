'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Info, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { type Page, WALLET_TX_TYPES, type WalletTransactionDto } from '@goalbet/shared';
import { Alert, Button, Card, CardContent, EmptyState, Input, NativeSelect, Skeleton, cn } from '@goalbet/ui';
import { PageTitle } from '@/components/sport/event-list';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useRequireAuth } from '@/lib/use-require-auth';

interface Filters {
  type: string;
  from: string;
  to: string;
}

/** F1.8 — RON balance and transaction history with type / date filters. */
export default function WalletPage() {
  const t = useTranslations();
  const f = useFormat();
  const authed = useRequireAuth();
  const [draft, setDraft] = useState<Filters>({ type: '', from: '', to: '' });
  const [filters, setFilters] = useState<Filters>(draft);

  const balance = useQuery({ queryKey: ['wallet'], queryFn: () => api<{ balanceBani: number }>('/wallet'), enabled: authed, refetchInterval: 15_000 });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const list = useInfiniteQuery({
    queryKey: ['wallet-tx', qs],
    queryFn: ({ pageParam }) => api<Page<WalletTransactionDto>>(`/wallet/transactions?limit=30${qs ? `&${qs}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (p) => p.nextCursor ?? undefined,
    enabled: authed,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setFilters(draft);
  };

  return (
    <div className="space-y-4">
      <PageTitle>{t('wallet.title')}</PageTitle>
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
              <Wallet className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs uppercase text-ink-muted">{t('wallet.balance')}</p>
              <p className="font-display text-3xl font-bold tabular-nums" data-testid="wallet-balance">
                {balance.data ? f.ron(balance.data.balanceBani) : '—'}
              </p>
            </div>
          </div>
          <Alert tone="info" className="flex max-w-md items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('wallet.adminNote')}
          </Alert>
        </CardContent>
      </Card>

      <Card>
        <div className="border-b border-line px-4 py-3">
          <h2 className="font-display text-lg font-bold uppercase">{t('wallet.history')}</h2>
          <form onSubmit={apply} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <NativeSelect aria-label={t('wallet.type')} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="col-span-2 sm:col-span-1">
              <option value="">{t('wallet.allTypes')}</option>
              {WALLET_TX_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`txType.${ty}`)}
                </option>
              ))}
            </NativeSelect>
            <Input type="date" aria-label={t('wallet.from')} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
            <Input type="date" aria-label={t('wallet.to')} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
            <Button type="submit" variant="secondary">
              {t('wallet.apply')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                const empty = { type: '', from: '', to: '' };
                setDraft(empty);
                setFilters(empty);
              }}
            >
              {t('wallet.reset')}
            </Button>
          </form>
        </div>
        {!authed || list.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : rows.length === 0 ? (
          <EmptyState title={t('wallet.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm" data-testid="wallet-table">
              <thead className="bg-card-alt text-left text-xs uppercase text-ink-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t('wallet.date')}</th>
                  <th className="px-4 py-2 font-semibold">{t('wallet.type')}</th>
                  <th className="px-4 py-2 font-semibold">{t('wallet.reason')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('wallet.amount')}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t('wallet.balanceAfter')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} data-testid="wallet-row" data-type={r.type}>
                    <td className="whitespace-nowrap px-4 py-2 text-ink-muted">{f.dateTime(r.createdAt)}</td>
                    <td className="px-4 py-2 font-semibold">{t(`txType.${r.type}`)}</td>
                    <td className="px-4 py-2 text-ink-muted">
                      {r.ticketId ? (
                        <Link href={`/my-bets/${r.ticketId}`} className="font-mono text-brand hover:underline">
                          {r.ticketCode}
                        </Link>
                      ) : (
                        r.reason
                      )}
                    </td>
                    <td className={cn('whitespace-nowrap px-4 py-2 text-right font-bold tabular-nums', r.amountBani > 0 ? 'text-success' : 'text-ink')}>
                      {r.amountBani > 0 ? '+' : ''}
                      {f.ron(r.amountBani)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{f.ron(r.balanceAfterBani)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.hasNextPage ? (
              <div className="p-3">
                <Button variant="outline" className="w-full" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                  {t('wallet.loadMore')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
