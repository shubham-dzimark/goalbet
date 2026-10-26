'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Hourglass, Radio, ShieldAlert, Ticket, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type AdminDashboard } from '@goalbet/shared';
import { Skeleton } from '@goalbet/ui';
import { AuditCategoryBadge } from '@/components/ui/badges';
import { MoneyTrendChart } from '@/components/ui/charts';
import { PageHeader, Panel, StatCard } from '@/components/ui/page';
import { Link } from '@/i18n/navigation';
import { useFmt } from '@/lib/format';
import { adminApi, useSession } from '@/lib/session';

/** Operator home: live state of the sportsbook, today's money and the latest audited actions. */
export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const ta = useTranslations('audit');
  const f = useFmt();
  const admin = useSession((s) => s.admin);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => adminApi<AdminDashboard>('/admin/dashboard'),
    refetchInterval: 15_000,
  });

  const hour = new Date().getHours();
  const greeting = t(hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening', { name: admin?.name.split(' ')[0] ?? '' });

  return (
    <>
      <PageHeader kicker={t('kicker')} title={greeting} description={t('subtitle')} />

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="dashboard-kpis">
            <StatCard label={t('liveEvents')} value={f.num(data.liveEvents)} icon={Radio} tone="live" hint={t('liveHint')} />
            <StatCard label={t('openTickets')} value={f.num(data.openTickets)} icon={Ticket} tone="info" />
            <StatCard label={t('exposure')} value={f.compactRon(data.exposureBani)} icon={ShieldAlert} tone="gold" hint={t('exposureHint')} />
            <StatCard
              label={t('pendingApprovals')}
              value={f.num(data.pendingApprovals)}
              icon={Hourglass}
              tone={data.pendingApprovals > 0 ? 'gold' : 'neutral'}
              hint={data.pendingApprovals > 0 ? <Link href="/wallet" className="font-semibold text-brand hover:underline">{t('review')}</Link> : t('noneWaiting')}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={t('todayStakes')} value={f.ron(data.today.stakesBani)} icon={Wallet} tone="brand" hint={t('ticketsCount', { count: data.today.tickets })} />
            <StatCard label={t('todayPayouts')} value={f.ron(data.today.payoutsBani)} icon={TrendingUp} />
            <StatCard
              label={t('todayGgr')}
              value={<span className={data.today.stakesBani - data.today.payoutsBani < 0 ? 'text-danger' : 'text-brand'}>{f.ron(data.today.stakesBani - data.today.payoutsBani)}</span>}
              hint={t('ggrHint')}
            />
            <StatCard label={t('newUsers')} value={f.num(data.today.newUsers)} icon={UserPlus} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title={t('last7Days')} actions={<Link href="/reports" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">{t('fullReport')}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>}>
              <MoneyTrendChart data={data.last7Days} />
            </Panel>
            <Panel title={t('recentActivity')} bodyClassName="p-0" actions={<Link href="/audit" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">{t('allActivity')}<ArrowRight className="size-3.5" aria-hidden="true" /></Link>}>
              <ul className="divide-y divide-line">
                {data.recentAudit.length === 0 ? <li className="p-4 text-sm text-ink-muted">{ta('empty')}</li> : null}
                {data.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <AuditCategoryBadge category={a.category} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-semibold">{a.action}</p>
                      <p className="truncate text-[11px] text-ink-faint">{a.actorLabel ?? a.actorType}</p>
                    </div>
                    <time className="shrink-0 text-[11px] text-ink-faint" dateTime={a.createdAt}>
                      {f.ago(a.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
