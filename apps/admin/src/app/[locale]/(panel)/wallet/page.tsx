'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, Hourglass, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminApprovalRow, type AdminTransactionRow, type AdminUserRow, type Page, WALLET_TX_TYPES } from '@goalbet/shared';
import { Button, EmptyState, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@goalbet/ui';
import { PaymentRequests } from '@/components/payment-requests';
import { TransactionsTable } from '@/components/transactions-table';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { DateInput, FilterSelect, PageHeader, Panel, SearchInput } from '@/components/ui/page';
import { WalletAdjustDialog } from '@/components/wallet-adjust-dialog';
import { Link } from '@/i18n/navigation';
import { downloadCsv } from '@/lib/csv';
import { qs, useCan, useErrorText } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi, useSession } from '@/lib/session';

/** F3.3 wallet management: approvals, add/remove RON credit, transaction log. */
export default function WalletPage() {
  const t = useTranslations('wallet');
  const can = useCan();
  const finance = can('FINANCE');
  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <Tabs defaultValue="requests">
        <TabsList className="mb-5">
          <TabsTrigger value="requests" data-testid="tab-requests">{t('tabs.requests')}</TabsTrigger>
          {finance ? <TabsTrigger value="approvals">{t('tabs.approvals')}</TabsTrigger> : null}
          {finance ? <TabsTrigger value="adjust">{t('tabs.adjust')}</TabsTrigger> : null}
          <TabsTrigger value="transactions">{t('tabs.transactions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="requests">
          <PaymentRequests />
        </TabsContent>
        {finance ? (
          <TabsContent value="approvals">
            <Approvals />
          </TabsContent>
        ) : null}
        {finance ? (
          <TabsContent value="adjust">
            <Adjust />
          </TabsContent>
        ) : null}
        <TabsContent value="transactions">
          <Transactions />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Credits/debits above the threshold, waiting for a second admin (four-eyes). */
function Approvals() {
  const t = useTranslations('wallet.approvals');
  const ttx = useTranslations('txType');
  const f = useFmt();
  const qc = useQueryClient();
  const me = useSession((s) => s.admin?.id);
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState<AdminApprovalRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['approvals'], queryFn: () => adminApi<AdminApprovalRow[]>('/admin/approvals'), refetchInterval: 15_000 });

  const refresh = () => Promise.all(['approvals', 'transactions', 'user', 'users', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const approve = async (a: AdminApprovalRow) => {
    setBusy(a.id);
    try {
      await adminApi(`/admin/approvals/${a.id}/approve`, { method: 'POST' });
      toast.success(t('approved'));
      await refresh();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />;
  if (!data || data.length === 0)
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState icon={<Hourglass className="size-8" />} title={t('emptyTitle')}>
          {t('emptyHelp')}
        </EmptyState>
      </div>
    );

  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="approvals">
      {data.map((a) => {
        const own = a.requestedBy.id === me;
        return (
          <article key={a.id} className="glass rounded-[var(--radius-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-accent">{ttx(a.type)}</p>
                <p className="font-display tracking-tight text-3xl font-semibold tabular-nums">{f.ron(a.amountBani)}</p>
                <Link href={`/users/${a.user.id}`} className="text-sm font-semibold text-brand hover:underline">
                  {a.user.name}
                </Link>
                <span className="text-sm text-ink-muted"> · {a.user.email}</span>
              </div>
              <time className="shrink-0 text-xs text-ink-faint" dateTime={a.createdAt}>
                {f.ago(a.createdAt)}
              </time>
            </div>
            <p className="mt-3 rounded-lg bg-tint/[0.04] px-3 py-2 text-sm">“{a.reason}”</p>
            <p className="mt-2 text-xs text-ink-faint">{t('requestedBy', { email: a.requestedBy.email })}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              {own ? <span className="mr-auto text-xs text-warning">{t('ownRequest')}</span> : null}
              <Button size="sm" variant="ghost" onClick={() => setRejecting(a)}>
                <X aria-hidden="true" />
                {t('reject')}
              </Button>
              <Button size="sm" onClick={() => void approve(a)} disabled={own} loading={busy === a.id}>
                <Check aria-hidden="true" />
                {t('approve')}
              </Button>
            </div>
          </article>
        );
      })}
      <ReasonDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={t('rejectTitle')}
        description={rejecting ? `${f.ron(rejecting.amountBani)} · ${rejecting.user.name}` : undefined}
        confirmLabel={t('reject')}
        tone="danger"
        onConfirm={async (note) => {
          await adminApi(`/admin/approvals/${rejecting!.id}/reject`, { method: 'POST', body: { note } });
          toast.success(t('rejected'));
          await refresh();
        }}
      />
    </div>
  );
}

/** Pick a player, then credit or debit them. */
function Adjust() {
  const t = useTranslations('wallet.adjust');
  const f = useFmt();
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const { data, isFetching } = useQuery({
    queryKey: ['users', 'pick', q],
    queryFn: () => adminApi<Page<AdminUserRow>>(`/admin/users${qs({ q, limit: 8 })}`),
    enabled: q.length >= 2,
  });

  return (
    <Panel title={t('pickTitle')}>
      <SearchInput value={q} onChange={setQ} placeholder={t('pickSearch')} />
      <ul className="mt-3 divide-y divide-line">
        {q.length < 2 ? <li className="py-6 text-center text-sm text-ink-muted">{t('pickHint')}</li> : null}
        {q.length >= 2 && !isFetching && data?.items.length === 0 ? <li className="py-6 text-center text-sm text-ink-muted">{t('noPlayers')}</li> : null}
        {data?.items.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{u.name}</p>
              <p className="truncate text-xs text-ink-muted">{u.email}</p>
            </div>
            <span className="font-display tracking-tight font-semibold tabular-nums">{f.ron(u.balanceBani)}</span>
            <Button size="sm" variant="secondary" onClick={() => setTarget(u)}>
              {t('choose')}
            </Button>
          </li>
        ))}
      </ul>
      {target ? <WalletAdjustDialog open onOpenChange={(o) => !o && setTarget(null)} user={target} /> : null}
    </Panel>
  );
}

/** Global transaction log with filters and CSV export (also F3.6 "transaction logs"). */
function Transactions() {
  const t = useTranslations('wallet.tx');
  const ttx = useTranslations('txType');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const params = { type, from, to };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows: AdminTransactionRow[] = [];
      let cursor: string | undefined;
      // walk the pages (capped) so the export matches the filters
      for (let i = 0; i < 50; i++) {
        const page = await adminApi<Page<AdminTransactionRow>>(`/admin/wallet/transactions${qs({ ...params, cursor, limit: 100 })}`);
        rows.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      downloadCsv(`goalbet-transactions-${new Date().toISOString().slice(0, 10)}.csv`, [
        ['date', 'player', 'email', 'type', 'amount_ron', 'balance_after_ron', 'reason', 'ticket', 'admin'],
        ...rows.map((r) => [r.createdAt, r.user.name, r.user.email, r.type, (r.amountBani / 100).toFixed(2), (r.balanceAfterBani / 100).toFixed(2), r.reason, r.ticketCode ?? '', r.admin?.email ?? '']),
      ]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <FilterSelect label={t('type')} value={type} onChange={setType} options={[{ value: '', label: t('allTypes') }, ...WALLET_TX_TYPES.map((k) => ({ value: k, label: ttx(k) }))]} />
        <DateInput label={t('from')} value={from} onChange={setFrom} />
        <DateInput label={t('to')} value={to} onChange={setTo} />
        <Button variant="outline" className="ml-auto" onClick={() => void exportCsv()} loading={exporting} data-testid="export-csv">
          <Download aria-hidden="true" />
          {t('export')}
        </Button>
      </div>
      <TransactionsTable params={params} testId="transactions-table" />
    </>
  );
}
