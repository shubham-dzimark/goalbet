'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Pause, Play, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  type AdminCompetitionRow,
  type AdminEventRow,
  type AdminMarketRow,
  type AdminMarketTypeRow,
  type AdminSettings,
  type SettingKey,
} from '@goalbet/shared';
import { Badge, Button, Dialog, Input, SidePanelContent, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@goalbet/ui';
import { EventStatusBadge } from '@/components/ui/badges';
import { type Column, DataTable } from '@/components/ui/data-table';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { FilterSelect, PageHeader, Panel, SearchInput, Toggle } from '@/components/ui/page';
import { useCan, useErrorText, usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';

/** F3.5 sportsbook settings: leagues, markets, events and limits. */
export default function SportsbookPage() {
  const t = useTranslations('sportsbook');
  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <Tabs defaultValue="events">
        <TabsList className="mb-5">
          {(['events', 'leagues', 'markets', 'limits'] as const).map((k) => (
            <TabsTrigger key={k} value={k} data-testid={`sb-tab-${k}`}>
              {t(`tabs.${k}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="events">
          <Events />
        </TabsContent>
        <TabsContent value="leagues">
          <Leagues />
        </TabsContent>
        <TabsContent value="markets">
          <MarketTypes />
        </TabsContent>
        <TabsContent value="limits">
          <Limits />
        </TabsContent>
      </Tabs>
    </>
  );
}

// ── leagues ──
function Leagues() {
  const t = useTranslations('sportsbook.leagues');
  const can = useCan();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const { data, isLoading } = useQuery({ queryKey: ['competitions'], queryFn: () => adminApi<AdminCompetitionRow[]>('/admin/sportsbook/competitions') });

  const update = async (c: AdminCompetitionRow, patch: Partial<Pick<AdminCompetitionRow, 'enabled' | 'isTop'>>) => {
    try {
      const next = await adminApi<AdminCompetitionRow>(`/admin/sportsbook/competitions/${c.id}`, { method: 'PATCH', body: patch });
      qc.setQueryData<AdminCompetitionRow[]>(['competitions'], (rows) => rows?.map((r) => (r.id === c.id ? next : r)));
      toast.success(patch.enabled === undefined ? t(patch.isTop ? 'topOn' : 'topOff', { name: c.name }) : t(patch.enabled ? 'enabled' : 'disabled', { name: c.name }));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const columns: Column<AdminCompetitionRow>[] = [
    {
      key: 'name',
      header: t('cols.league'),
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="grid h-6 w-9 place-items-center rounded bg-tint/[0.07] text-[10px] font-bold">{c.countryCode}</span>
          <div>
            <p className={cn('font-semibold', !c.enabled && 'text-ink-muted line-through')}>{c.name}</p>
            <p className="text-xs text-ink-faint">{c.country}</p>
          </div>
          {!c.active ? <Badge>{t('inactive')}</Badge> : null}
        </div>
      ),
    },
    { key: 'live', header: t('cols.live'), align: 'right', cell: (c) => <span className={c.live ? 'font-bold text-live' : 'text-ink-faint'}>{c.live}</span> },
    { key: 'upcoming', header: t('cols.upcoming'), align: 'right', cell: (c) => <span className="tabular-nums">{c.upcoming}</span> },
    {
      key: 'top',
      header: t('cols.top'),
      align: 'center',
      cell: (c) => (
        <button
          type="button"
          disabled={!can('OPERATOR')}
          onClick={() => void update(c, { isTop: !c.isTop })}
          aria-pressed={c.isTop}
          aria-label={t('cols.top')}
          className="rounded-md p-1 disabled:opacity-40"
        >
          <Star className={cn('size-5', c.isTop ? 'fill-accent text-accent' : 'text-ink-faint')} aria-hidden="true" />
        </button>
      ),
    },
    {
      key: 'enabled',
      header: t('cols.enabled'),
      align: 'center',
      cell: (c) => <Toggle checked={c.enabled} onChange={(v) => void update(c, { enabled: v })} label={t('cols.enabled')} disabled={!can('OPERATOR')} testId={`league-toggle-${c.id}`} />,
    },
  ];

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">{t('help')}</p>
      <DataTable testId="leagues-table" columns={columns} rows={data ?? []} rowKey={(c) => c.id} loading={isLoading} />
    </>
  );
}

// ── market types ──
function MarketTypes() {
  const t = useTranslations('sportsbook.markets');
  const tm = useTranslations('markets');
  const can = useCan();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const { data, isLoading } = useQuery({ queryKey: ['market-types'], queryFn: () => adminApi<AdminMarketTypeRow[]>('/admin/sportsbook/market-types') });

  const set = async (row: AdminMarketTypeRow, enabled: boolean) => {
    try {
      const next = await adminApi<AdminMarketTypeRow[]>('/admin/sportsbook/market-types', { method: 'PUT', body: { type: row.type, enabled } });
      qc.setQueryData(['market-types'], next);
      toast.success(t(enabled ? 'enabled' : 'disabled', { name: tm(row.type) }));
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  if (isLoading) return <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />;
  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">{t('help')}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="market-types">
        {data?.map((m) => (
          <div key={m.type} className={cn('glass flex items-center justify-between gap-3 rounded-[var(--radius-card)] p-4', !m.enabled && 'opacity-70')}>
            <div>
              <p className="font-semibold">{tm(m.type)}</p>
              <p className="text-xs text-ink-faint">{t('open', { count: m.openMarkets })}</p>
            </div>
            <Toggle checked={m.enabled} onChange={(v) => void set(m, v)} label={tm(m.type)} disabled={!can('OPERATOR')} testId={`market-type-${m.type}`} />
          </div>
        ))}
      </div>
    </>
  );
}

// ── events ──
function Events() {
  const t = useTranslations('sportsbook.events');
  const f = useFmt();
  const can = useCan();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [target, setTarget] = useState<AdminEventRow | null>(null);
  const [open, setOpen] = useState<AdminEventRow | null>(null);
  const { data: comps } = useQuery({ queryKey: ['competitions'], queryFn: () => adminApi<AdminCompetitionRow[]>('/admin/sportsbook/competitions') });
  const list = usePaged<AdminEventRow>(['events'], '/admin/sportsbook/events', { q, status, competitionId, suspendedOnly: suspendedOnly ? 'true' : undefined }, { refetchInterval: 15_000 });

  const columns: Column<AdminEventRow>[] = [
    {
      key: 'match',
      header: t('cols.match'),
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {e.homeTeam} – {e.awayTeam}
          </p>
          <p className="truncate text-xs text-ink-faint">{e.competition.name}</p>
        </div>
      ),
    },
    {
      key: 'when',
      header: t('cols.when'),
      cell: (e) =>
        e.status === 'LIVE' ? (
          <span className="font-display text-lg font-bold tabular-nums">
            {e.homeScore}:{e.awayScore} <span className="text-xs font-semibold text-live">{e.minute ?? 0}&apos;</span>
          </span>
        ) : (
          <span className="whitespace-nowrap text-sm">{f.dateTime(e.startTime)}</span>
        ),
    },
    { key: 'status', header: t('cols.status'), cell: (e) => <EventStatusBadge status={e.status} />, hideBelow: 'sm' },
    { key: 'markets', header: t('cols.markets'), align: 'right', cell: (e) => <span className="tabular-nums">{e.markets}</span>, hideBelow: 'md' },
    { key: 'tickets', header: t('cols.tickets'), align: 'right', cell: (e) => <span className="tabular-nums">{e.openTickets}</span>, hideBelow: 'md' },
    {
      key: 'suspended',
      header: t('cols.suspended'),
      align: 'center',
      cell: (e) => (
        <div className="flex items-center justify-center gap-2">
          {e.feedSuspended ? <Badge tone="warning">{t('feed')}</Badge> : null}
          <Toggle checked={e.suspended} onChange={() => setTarget(e)} label={t(e.suspended ? 'resume' : 'suspend')} tone="danger" disabled={!can('OPERATOR')} testId={`event-suspend-${e.id}`} />
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="min-w-[220px] flex-1" />
        <FilterSelect
          label={t('league')}
          value={competitionId}
          onChange={setCompetitionId}
          options={[{ value: '', label: t('allLeagues') }, ...(comps ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))]}
        />
        <FilterSelect
          label={t('cols.status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: t('bettable') },
            { value: 'LIVE', label: t('statuses.LIVE') },
            { value: 'SCHEDULED', label: t('statuses.SCHEDULED') },
            { value: 'FINISHED', label: t('statuses.FINISHED') },
            { value: 'CANCELLED', label: t('statuses.CANCELLED') },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <Toggle checked={suspendedOnly} onChange={setSuspendedOnly} label={t('suspendedOnly')} tone="danger" />
          {t('suspendedOnly')}
        </label>
      </div>
      <DataTable
        testId="events-table"
        columns={columns}
        rows={list.items}
        rowKey={(e) => e.id}
        loading={list.isLoading}
        onRowClick={setOpen}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={t('empty')}
      />
      <ReasonDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? t(target.suspended ? 'resumeTitle' : 'suspendTitle', { match: `${target.homeTeam} – ${target.awayTeam}` }) : ''}
        description={target ? t(target.suspended ? 'resumeHelp' : 'suspendHelp') : undefined}
        confirmLabel={target ? t(target.suspended ? 'resume' : 'suspend') : ''}
        tone={target?.suspended ? 'primary' : 'danger'}
        onConfirm={async (reason) => {
          await adminApi(`/admin/sportsbook/events/${target!.id}/suspend`, { method: 'POST', body: { suspended: !target!.suspended, reason } });
          toast.success(t(target!.suspended ? 'resumed' : 'suspendedToast'));
          await qc.invalidateQueries({ queryKey: ['events'] });
        }}
      />
      <EventMarketsPanel event={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** Markets of one event: suspend/resume (held against the feed) or hide/show. */
function EventMarketsPanel({ event, onClose }: { event: AdminEventRow | null; onClose: () => void }) {
  const t = useTranslations('sportsbook.eventMarkets');
  const tc = useTranslations('common2');
  const tm = useTranslations('markets');
  const to = useTranslations('outcomes');
  const tp = useTranslations('periods');
  const f = useFmt();
  const can = useCan();
  const qc = useQueryClient();
  const [action, setAction] = useState<{ market: AdminMarketRow; patch: { enabled?: boolean; suspended?: boolean } } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['event-markets', event?.id],
    queryFn: () => adminApi<AdminMarketRow[]>(`/admin/sportsbook/events/${event!.id}/markets`),
    enabled: !!event,
  });

  const label = (m: AdminMarketRow) =>
    `${tm(m.type)}${m.lineCenti !== null ? ` ${m.lineCenti / 100}` : ''}${m.playerName ? ` · ${m.playerName}` : ''}${m.period === 'H1' ? ` (${tp('H1')})` : ''}`;

  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <SidePanelContent title={event ? `${event.homeTeam} – ${event.awayTeam}` : ''} description={event ? `${event.competition.name} · ${f.dateTime(event.startTime)}` : undefined} closeLabel={tc('close')}>
        {isLoading || !data ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('none')}</p>
        ) : (
          <ul className="space-y-2" data-testid="event-markets">
            {data.map((m) => (
              <li key={m.id} className={cn('rounded-xl p-3 ring-1 ring-line', m.adminSuspended ? 'bg-danger/[0.06]' : 'bg-tint/[0.03]', !m.enabled && 'opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{label(m)}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {m.status === 'SUSPENDED' ? <Badge tone={m.adminSuspended ? 'danger' : 'warning'}>{t(m.adminSuspended ? 'byOperator' : 'byFeed')}</Badge> : null}
                    {m.status === 'SETTLED' ? <Badge>{t('settled')}</Badge> : null}
                    {!m.enabled ? <Badge>{t('hidden')}</Badge> : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.selections.map((s) => (
                    <span key={s.id} className={cn('rounded-md bg-tint/[0.06] px-2 py-1 text-xs', !s.active && 'line-through opacity-60')}>
                      {s.label ?? (to.has(s.outcome) ? to(s.outcome) : s.outcome)} <strong className="tabular-nums">{f.odds(s.oddsMilli)}</strong>
                    </span>
                  ))}
                </div>
                {can('OPERATOR') && m.status !== 'SETTLED' ? (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant={m.adminSuspended ? 'secondary' : 'outline'} onClick={() => setAction({ market: m, patch: { suspended: !m.adminSuspended } })}>
                      {m.adminSuspended ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                      {t(m.adminSuspended ? 'resume' : 'suspend')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ market: m, patch: { enabled: !m.enabled } })}>
                      <Lock aria-hidden="true" />
                      {t(m.enabled ? 'hide' : 'show')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <ReasonDialog
          open={!!action}
          onOpenChange={(o) => !o && setAction(null)}
          title={action ? label(action.market) : ''}
          description={action ? t(action.patch.suspended !== undefined ? (action.patch.suspended ? 'suspendHelp' : 'resumeHelp') : action.patch.enabled ? 'showHelp' : 'hideHelp') : undefined}
          confirmLabel={tc('confirm')}
          tone={action?.patch.suspended || action?.patch.enabled === false ? 'danger' : 'primary'}
          onConfirm={async (reason) => {
            await adminApi(`/admin/sportsbook/markets/${action!.market.id}`, { method: 'PATCH', body: { ...action!.patch, reason } });
            toast.success(t('updated'));
            await qc.invalidateQueries({ queryKey: ['event-markets', event?.id] });
          }}
        />
      </SidePanelContent>
    </Dialog>
  );
}

// ── limits & settings ──
type Unit = 'ron' | 'percentBps' | 'seconds' | 'secondsMs' | 'count' | 'bool';
const SETTINGS: { group: 'betting' | 'cashout' | 'builder' | 'wallet' | 'payments' | 'feed'; key: SettingKey; unit: Unit }[] = [
  { group: 'betting', key: 'betting.minStakeBani', unit: 'ron' },
  { group: 'betting', key: 'betting.maxStakeBani', unit: 'ron' },
  { group: 'betting', key: 'betting.maxPayoutBani', unit: 'ron' },
  { group: 'betting', key: 'betting.maxAccaLegs', unit: 'count' },
  { group: 'betting', key: 'betting.liveDelayMs', unit: 'secondsMs' },
  { group: 'cashout', key: 'cashout.enabled', unit: 'bool' },
  { group: 'cashout', key: 'cashout.marginBps', unit: 'percentBps' },
  { group: 'builder', key: 'builder.factorBps', unit: 'percentBps' },
  { group: 'wallet', key: 'wallet.approvalThresholdBani', unit: 'ron' },
  { group: 'payments', key: 'payments.bankTransferEnabled', unit: 'bool' },
  { group: 'payments', key: 'payments.cashAtShopEnabled', unit: 'bool' },
  { group: 'payments', key: 'wallet.minDepositBani', unit: 'ron' },
  { group: 'payments', key: 'wallet.maxDepositBani', unit: 'ron' },
  { group: 'payments', key: 'wallet.minWithdrawalBani', unit: 'ron' },
  { group: 'payments', key: 'wallet.maxWithdrawalBani', unit: 'ron' },
  { group: 'feed', key: 'feed.stallSeconds', unit: 'seconds' },
];

const toInput = (unit: Unit, v: number | boolean) =>
  typeof v === 'boolean' ? String(v) : unit === 'ron' ? (v / 100).toFixed(2) : unit === 'percentBps' ? (v / 100).toString() : unit === 'secondsMs' ? (v / 1000).toString() : String(v);
const fromInput = (unit: Unit, s: string): number | null => {
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  if (unit === 'ron') return Math.round(n * 100);
  if (unit === 'percentBps') return Math.round(n * 100);
  if (unit === 'secondsMs') return Math.round(n * 1000);
  return Number.isInteger(n) ? n : null;
};
const SUFFIX: Record<Unit, string> = { ron: 'RON', percentBps: '%', seconds: 's', secondsMs: 's', count: '', bool: '' };

function Limits() {
  const t = useTranslations('sportsbook.limits');
  const can = useCan();
  const f = useFmt();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => adminApi<AdminSettings>('/admin/sportsbook/settings') });
  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />;
  const groups = [...new Set(SETTINGS.map((s) => s.group))];
  return (
    <div className="grid gap-6 xl:grid-cols-2" data-testid="settings">
      {groups.map((g) => (
        <Panel key={g} title={t(`groups.${g}`)} bodyClassName="divide-y divide-line p-0">
          {SETTINGS.filter((s) => s.group === g).map((s) => (
            <SettingRow
              key={s.key}
              setting={s}
              value={data.values[s.key]}
              updatedAt={data.updatedAt[s.key] ? f.dateTime(data.updatedAt[s.key]!) : null}
              canEdit={can(g === 'wallet' || g === 'payments' ? 'FINANCE' : 'OPERATOR')}
            />
          ))}
        </Panel>
      ))}
    </div>
  );
}

function SettingRow({ setting, value, updatedAt, canEdit }: { setting: (typeof SETTINGS)[number]; value: number | boolean; updatedAt: string | null; canEdit: boolean }) {
  const t = useTranslations('sportsbook.limits');
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [text, setText] = useState(toInput(setting.unit, value));
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(toInput(setting.unit, value)), [setting.unit, value]);
  const name = setting.key.replace('.', '_');

  const save = async (next: number | boolean) => {
    setBusy(true);
    try {
      const res = await adminApi<AdminSettings>('/admin/sportsbook/settings', { method: 'PUT', body: { key: setting.key, value: next } });
      qc.setQueryData(['settings'], res);
      toast.success(t('saved', { name: t(`keys.${name}`) }));
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const parsed = setting.unit === 'bool' ? null : fromInput(setting.unit, text);
  const dirty = setting.unit !== 'bool' && parsed !== value;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t(`keys.${name}`)}</p>
        <p className="text-xs text-ink-faint">
          {t(`help.${name}`)}
          {updatedAt ? ` · ${t('updated', { date: updatedAt })}` : ''}
        </p>
      </div>
      {setting.unit === 'bool' ? (
        <Toggle checked={value as boolean} onChange={(v) => void save(v)} label={t(`keys.${name}`)} disabled={!canEdit || busy} />
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed === null) return toast.error(t('invalid'));
            void save(parsed);
          }}
        >
          <div className="relative">
            <Input
              aria-label={t(`keys.${name}`)}
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
              disabled={!canEdit}
              inputMode="decimal"
              className={cn('h-9 pr-10 text-right tabular-nums', setting.unit === 'ron' ? 'w-40' : 'w-28')}
              data-testid={`setting-${name}`}
            />
            {SUFFIX[setting.unit] ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">{SUFFIX[setting.unit]}</span> : null}
          </div>
          {canEdit ? (
            <Button type="submit" size="sm" disabled={!dirty} loading={busy}>
              {t('save')}
            </Button>
          ) : null}
        </form>
      )}
    </div>
  );
}
