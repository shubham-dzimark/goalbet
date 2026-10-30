'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminUserRow } from '@goalbet/shared';
import { UserStatusBadge } from '@/components/ui/badges';
import { type Column, DataTable } from '@/components/ui/data-table';
import { FilterSelect, PageHeader, SearchInput } from '@/components/ui/page';
import { useRouter } from '@/i18n/navigation';
import { usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';

/** F3.2 — find players by name, email or phone. */
export default function UsersPage() {
  const t = useTranslations('users');
  const f = useFmt();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = usePaged<AdminUserRow>(['users'], '/admin/users', { q, status });

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'player',
      header: t('cols.player'),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-tint/[0.07] text-xs font-bold">
            {u.name
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{u.name}</p>
            <p className="truncate text-xs text-ink-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: t('cols.phone'), cell: (u) => <span className="tabular-nums text-ink-muted">{u.phone}</span>, hideBelow: 'lg' },
    { key: 'status', header: t('cols.status'), cell: (u) => <UserStatusBadge status={u.status} /> },
    { key: 'balance', header: t('cols.balance'), align: 'right', cell: (u) => <span className="font-display tracking-tight text-base font-semibold tabular-nums">{f.ron(u.balanceBani)}</span> },
    { key: 'open', header: t('cols.openTickets'), align: 'right', cell: (u) => <span className="tabular-nums">{u.openTickets}</span>, hideBelow: 'md' },
    { key: 'joined', header: t('cols.joined'), cell: (u) => <span className="text-ink-muted">{f.date(u.createdAt)}</span>, hideBelow: 'md' },
    { key: 'lastLogin', header: t('cols.lastLogin'), cell: (u) => <span className="text-ink-muted">{u.lastLoginAt ? f.ago(u.lastLoginAt) : '—'}</span>, hideBelow: 'xl' },
  ];

  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="min-w-[240px] flex-1" />
        <FilterSelect
          label={t('cols.status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('allStatuses') },
            { value: 'ACTIVE', label: t('status.ACTIVE') },
            { value: 'SUSPENDED', label: t('status.SUSPENDED') },
          ]}
        />
      </div>
      <DataTable
        testId="users-table"
        columns={columns}
        rows={list.items}
        rowKey={(u) => u.id}
        loading={list.isLoading}
        onRowClick={(u) => router.push(`/users/${u.id}`)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={q ? t('noMatch', { q }) : t('empty')}
      />
    </>
  );
}
