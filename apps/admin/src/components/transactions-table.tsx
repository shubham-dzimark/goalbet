'use client';

import { useTranslations } from 'next-intl';
import { type AdminTransactionRow } from '@goalbet/shared';
import { Link } from '@/i18n/navigation';
import { usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { TxTypeBadge } from './ui/badges';
import { type Column, DataTable } from './ui/data-table';

/** Player wallet rows have no `user`/`admin`; the global log has both. */
type TxRow = Omit<AdminTransactionRow, 'user' | 'admin'> & Partial<Pick<AdminTransactionRow, 'user' | 'admin'>>;

/** F3.3 wallet history: one player's (`userId`) or every wallet (global transaction log). */
export function TransactionsTable({ userId, params = {}, testId }: { userId?: string; params?: Record<string, string | undefined>; testId?: string }) {
  const t = useTranslations('wallet.tx');
  const f = useFmt();
  const path = userId ? `/admin/users/${userId}/wallet/transactions` : '/admin/wallet/transactions';
  const list = usePaged<TxRow>(['transactions', userId ?? 'all'], path, params);

  const columns: Column<TxRow>[] = [
    { key: 'time', header: t('time'), cell: (x) => <span className="whitespace-nowrap text-sm">{f.dateTime(x.createdAt)}</span> },
    ...(userId
      ? []
      : [
          {
            key: 'player',
            header: t('player'),
            cell: (x: TxRow) =>
              x.user ? (
                <Link href={`/users/${x.user.id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[180px] truncate text-brand hover:underline">
                  {x.user.name}
                </Link>
              ) : null,
          },
        ]),
    { key: 'type', header: t('type'), cell: (x) => <TxTypeBadge type={x.type} /> },
    {
      key: 'reason',
      header: t('reason'),
      cell: (x) => (
        <div className="max-w-[280px]">
          <p className="truncate text-sm">{x.reason}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {x.ticketCode ? `${t('ticket')} ${x.ticketCode}` : ''}
            {x.admin ? `${x.ticketCode ? ' · ' : ''}${x.admin.email}` : ''}
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'amount',
      header: t('amount'),
      align: 'right',
      cell: (x) => <span className={`font-display text-base font-bold tabular-nums ${x.amountBani > 0 ? 'text-brand' : ''}`}>{f.signedRon(x.amountBani)}</span>,
    },
    { key: 'after', header: t('balanceAfter'), align: 'right', cell: (x) => <span className="tabular-nums text-ink-muted">{f.ron(x.balanceAfterBani)}</span>, hideBelow: 'sm' },
  ];

  return (
    <DataTable
      testId={testId}
      columns={columns}
      rows={list.items}
      rowKey={(x) => x.id}
      loading={list.isLoading}
      hasMore={list.hasNextPage}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      empty={t('empty')}
    />
  );
}
