'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, Download, Scale, ShieldAlert, Ticket, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminReport } from '@goalbet/shared';
import { Button, Skeleton } from '@goalbet/ui';
import { EventStatusBadge } from '@/components/ui/badges';
import { CountBars, MoneyTrendChart } from '@/components/ui/charts';
import { type Column, DataTable } from '@/components/ui/data-table';
import { DateInput, PageHeader, Panel, StatCard, ViewTabs } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { downloadCsv } from '@/lib/csv';
import { qs } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';

const PRESETS = ['7', '30', '90', 'custom'] as const;
type Preset = (typeof PRESETS)[number];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'var(--color-info)',
  LIVE: 'var(--color-live)',
  PENDING: 'var(--color-warning)',
  WON: 'var(--color-success)',
  LOST: 'var(--color-danger)',
  VOID: 'var(--color-ink-faint)',
  CASHED_OUT: 'var(--color-accent)',
  REJECTED: 'var(--color-ink-faint)',
};

/** F3.6 reports: users, stakes, payouts, open exposure and transaction logs. */
export default function ReportsPage() {
  const t = useTranslations('reports');
  const ts = useTranslations('ticketStatus');
  const f = useFmt();
  const [preset, setPreset] = useState<Preset>('30');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));

  const range = preset === 'custom' ? { from, to } : { from: iso(new Date(Date.now() - (Number(preset) - 1) * 86_400_000)), to: iso(new Date()) };
  const { data, isLoading } = useQuery({ queryKey: ['report', range], queryFn: () => adminApi<AdminReport>(`/admin/reports${qs(range)}`) });

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(`goalbet-report-${data.range.from}_${data.range.to}.csv`, [
      ['date', 'tickets', 'stakes_ron', 'payouts_ron', 'ggr_ron'],
      ...data.daily.map((d) => [d.date, d.tickets, (d.stakesBani / 100).toFixed(2), (d.payoutsBani / 100).toFixed(2), ((d.stakesBani - d.payoutsBani) / 100).toFixed(2)]),
    ]);
  };

  const exposureCols: Column<AdminReport['topExposure'][number]>[] = [
    {
      key: 'match',
      header: t('exposure.match'),
      cell: (r) => (
        <div>
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-ink-faint">{f.dateTime(r.startTime)}</p>
        </div>
      ),
    },
    { key: 'status', header: t('exposure.status'), cell: (r) => <EventStatusBadge status={r.status} /> },
    { key: 'tickets', header: t('exposure.tickets'), align: 'right', cell: (r) => r.tickets },
    { key: 'payout', header: t('exposure.potential'), align: 'right', cell: (r) => <span className="font-display text-base font-bold text-accent">{f.ron(r.potentialPayoutBani)}</span> },
  ];

  return (
    <>
      <PageHeader
        kicker={t('kicker')}
        title={t('title')}
        description={data ? t('range', { from: f.date(`${data.range.from}T12:00:00Z`), to: f.date(`${data.range.to}T12:00:00Z`) }) : t('description')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data} data-testid="report-export">
            <Download aria-hidden="true" />
            {t('export')}
          </Button>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <ViewTabs label={t('period')} value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p, label: t(`presets.${p}`) }))} />
        {preset === 'custom' ? (
          <>
            <DateInput label={t('from')} value={from} onChange={setFrom} />
            <DateInput label={t('to')} value={to} onChange={setTo} />
          </>
        ) : null}
      </div>

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <div className="space-y-6" data-testid="report">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('kpi.stakes')} value={f.ron(data.betting.stakesBani)} icon={TrendingUp} tone="brand" hint={t('kpi.tickets', { count: data.betting.tickets })} />
            <StatCard label={t('kpi.payouts')} value={f.ron(data.betting.payoutsBani)} icon={TrendingDown} tone="gold" />
            <StatCard
              label={t('kpi.ggr')}
              value={<span className={data.betting.ggrBani < 0 ? 'text-danger' : 'text-brand'}>{f.ron(data.betting.ggrBani)}</span>}
              icon={Scale}
              hint={data.betting.stakesBani ? t('kpi.margin', { pct: ((data.betting.ggrBani / data.betting.stakesBani) * 100).toFixed(1) }) : t('kpi.ggrHint')}
            />
            <StatCard label={t('kpi.avgStake')} value={f.ron(data.betting.avgStakeBani)} icon={Ticket} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('kpi.users')} value={f.num(data.users.total)} icon={Users} hint={t('kpi.usersHint', { new: data.users.new, active: data.users.active, suspended: data.users.suspended })} />
            <StatCard label={t('kpi.exposure')} value={f.ron(data.exposure.potentialPayoutBani)} icon={ShieldAlert} tone="gold" hint={t('kpi.exposureHint', { count: data.exposure.openTickets, stake: f.ron(data.exposure.openStakeBani) })} />
            <StatCard label={t('kpi.deposits')} value={f.ron(data.wallet.depositsBani)} icon={Banknote} tone="brand" hint={t('kpi.creditsHint', { amount: f.ron(data.wallet.creditsBani) })} />
            <StatCard label={t('kpi.withdrawals')} value={f.ron(data.wallet.withdrawalsBani)} icon={Banknote} hint={t('kpi.debitsHint', { amount: f.ron(data.wallet.debitsBani) })} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title={t('trend')}>
              <MoneyTrendChart data={data.daily} height={300} />
            </Panel>
            <Panel title={t('byStatus')}>
              {Object.keys(data.byStatus).length === 0 ? (
                <p className="py-10 text-center text-sm text-ink-muted">{t('noTickets')}</p>
              ) : (
                <CountBars
                  height={300}
                  data={Object.entries(data.byStatus).map(([k, v]) => ({ label: ts(k), value: v ?? 0, color: STATUS_COLORS[k] ?? 'var(--color-ink-faint)' }))}
                />
              )}
            </Panel>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold uppercase italic tracking-wide">{t('exposure.title')}</h2>
              <Link href="/wallet" className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                {t('transactionLog')}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <DataTable testId="exposure-table" columns={exposureCols} rows={data.topExposure} rowKey={(r) => r.eventId} empty={t('exposure.empty')} />
          </section>
        </div>
      )}
    </>
  );
}
