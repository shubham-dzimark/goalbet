'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminPaymentRequestRow } from '@goalbet/shared';
import { Badge, Button, cn } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { useCan, usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi, useSession } from '@/lib/session';
import { type Column, DataTable } from './ui/data-table';
import { ReasonDialog, toast } from './ui/feedback';
import { SearchInput, ViewTabs } from './ui/page';

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CANCELLED: 'neutral' } as const;
const VIEWS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'ALL'] as const;
type View = (typeof VIEWS)[number];

/**
 * Player deposit / withdrawal requests (admin-controlled wallet). Finance checks the money moved,
 * then approves (balance credited / held amount paid out) or rejects with a reason.
 */
export function PaymentRequests() {
  const t = useTranslations('wallet.requests');
  const f = useFmt();
  const can = useCan();
  const me = useSession((s) => s.admin?.id);
  const qc = useQueryClient();
  const [view, setView] = useState<View>('PENDING');
  const [type, setType] = useState<'' | 'DEPOSIT' | 'WITHDRAWAL'>('');
  const [q, setQ] = useState('');
  const [action, setAction] = useState<{ kind: 'approve' | 'reject'; row: AdminPaymentRequestRow } | null>(null);
  const list = usePaged<AdminPaymentRequestRow>(['payment-requests'], '/admin/payment-requests', { status: view === 'ALL' ? undefined : view, type, q }, { refetchInterval: 15_000 });

  const refresh = () => Promise.all(['payment-requests', 'dashboard', 'transactions', 'user', 'users', 'pending-payments'].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  const columns: Column<AdminPaymentRequestRow>[] = [
    {
      key: 'request',
      header: t('cols.request'),
      cell: (r) => (
        <div className="flex items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', r.type === 'DEPOSIT' ? 'bg-brand-soft text-brand' : 'bg-accent-soft text-accent')}>
            {r.type === 'DEPOSIT' ? <ArrowDownLeft className="size-4" aria-hidden="true" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}
          </span>
          <div>
            <p className="font-mono text-sm font-bold">{r.reference}</p>
            <p className="text-[11px] text-ink-faint">{f.dateTime(r.createdAt)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'player',
      header: t('cols.player'),
      cell: (r) => (
        <div className="max-w-[200px]">
          <Link href={`/users/${r.user.id}`} className="block truncate font-semibold text-brand hover:underline">
            {r.user.name}
          </Link>
          <p className="truncate text-[11px] text-ink-faint">{t('balance', { balance: f.ron(r.user.balanceBani), held: f.ron(r.user.heldBani) })}</p>
        </div>
      ),
    },
    {
      key: 'details',
      header: t('cols.details'),
      cell: (r) => (
        <div className="max-w-[260px] text-xs">
          <p className="font-semibold">{t(`methods.${r.method}`)}</p>
          {r.details.iban ? <p className="truncate font-mono text-ink-muted">{r.details.iban}</p> : null}
          {r.details.accountHolder ? <p className="truncate text-ink-muted">{r.details.accountHolder}</p> : null}
          {r.details.payerReference ? <p className="truncate text-ink-muted">{t('payerRef', { ref: r.details.payerReference })}</p> : null}
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'amount',
      header: t('cols.amount'),
      align: 'right',
      cell: (r) => (
        <span className={cn('font-display text-lg font-bold tabular-nums', r.type === 'DEPOSIT' ? 'text-brand' : '')}>
          {r.type === 'DEPOSIT' ? '+' : '−'}
          {f.ron(r.amountBani)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('cols.status'),
      cell: (r) => (
        <div className="space-y-1">
          <Badge tone={STATUS_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
          {r.awaitingSecondApproval ? <p className="text-[11px] text-accent">{t('secondNeeded', { email: r.firstApprovedBy?.email ?? '' })}</p> : null}
          {r.decidedBy ? <p className="text-[11px] text-ink-faint">{r.decidedBy.email}</p> : null}
          {r.decisionNote ? <p className="max-w-[200px] truncate text-[11px] text-ink-faint">“{r.decisionNote}”</p> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('cols.actions')}</span>,
      align: 'right',
      cell: (r) =>
        r.status === 'PENDING' && can('FINANCE') ? (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAction({ kind: 'reject', row: r })} data-testid={`reject-${r.reference}`}>
              <X aria-hidden="true" />
              {t('reject')}
            </Button>
            <Button size="sm" onClick={() => setAction({ kind: 'approve', row: r })} disabled={r.firstApprovedBy?.id === me} title={r.firstApprovedBy?.id === me ? t('ownFirst') : undefined} data-testid={`approve-${r.reference}`}>
              <Check aria-hidden="true" />
              {t(r.type === 'DEPOSIT' ? 'approveDeposit' : 'approveWithdrawal')}
            </Button>
          </div>
        ) : null,
    },
  ];

  const row = action?.row;
  return (
    <>
      <div className="mb-4 space-y-3">
        <ViewTabs label={t('cols.status')} value={view} onChange={setView} options={VIEWS.map((v) => ({ value: v, label: t(`views.${v}`) }))} />
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="min-w-[220px] flex-1" />
          <ViewTabs
            label={t('cols.request')}
            value={type}
            onChange={setType}
            options={[
              { value: '', label: t('types.all') },
              { value: 'DEPOSIT', label: t('types.DEPOSIT') },
              { value: 'WITHDRAWAL', label: t('types.WITHDRAWAL') },
            ]}
          />
        </div>
      </div>
      <DataTable
        testId="payment-requests"
        columns={columns}
        rows={list.items}
        rowKey={(r) => r.id}
        loading={list.isLoading}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={view === 'PENDING' ? t('emptyPending') : t('empty')}
      />
      <ReasonDialog
        open={!!action}
        onOpenChange={(o) => !o && setAction(null)}
        title={row ? t(action.kind === 'approve' ? (row.type === 'DEPOSIT' ? 'confirm.approveDeposit' : 'confirm.approveWithdrawal') : 'confirm.reject', { amount: f.ron(row.amountBani), ref: row.reference }) : ''}
        description={row ? t(action.kind === 'approve' ? (row.type === 'DEPOSIT' ? 'confirm.approveDepositHelp' : 'confirm.approveWithdrawalHelp') : 'confirm.rejectHelp', { name: row.user.name }) : undefined}
        confirmLabel={action?.kind === 'approve' ? t('confirm.approve') : t('reject')}
        tone={action?.kind === 'reject' ? 'danger' : 'primary'}
        onConfirm={async (note) => {
          const a = action!;
          const res = await adminApi<AdminPaymentRequestRow>(`/admin/payment-requests/${a.row.id}/${a.kind}`, { method: 'POST', body: { note } });
          toast.success(a.kind === 'reject' ? t('toast.rejected') : res.status === 'APPROVED' ? t('toast.approved') : t('toast.firstApproval'));
          await refresh();
        }}
      />
    </>
  );
}
