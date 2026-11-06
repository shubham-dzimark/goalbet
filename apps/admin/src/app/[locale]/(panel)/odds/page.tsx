'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Bot, EyeOff, Hand, Lock, Minus, Pause, Play, Plus, Search, TrendingUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useEffect, useState } from 'react';
import type { AdminCompetitionRow, AdminEventRow, AdminMarketRow, MarketType, Page } from '@goalbet/shared';
import { Badge, Button, EmptyState, Input, Skeleton, cn } from '@goalbet/ui';
import { EventStatusBadge } from '@/components/ui/badges';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { FilterSelect, PageHeader, SearchInput, Toggle, ViewTabs } from '@/components/ui/page';
import { Link, useRouter } from '@/i18n/navigation';
import { useCan, usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { ApiError, adminApi } from '@/lib/session';

type Selection = AdminMarketRow['selections'][number];

/** Market families the board can be narrowed to. */
const GROUPS: Record<string, MarketType[]> = {
  main: ['MATCH_RESULT', 'DOUBLE_CHANCE', 'BTTS'],
  goals: ['TOTAL_GOALS', 'TEAM_TOTAL_GOALS', 'CORRECT_SCORE'],
  handicaps: ['EUROPEAN_HANDICAP', 'ASIAN_HANDICAP'],
  specials: ['TOTAL_CORNERS', 'TOTAL_CARDS'],
  players: ['ANYTIME_SCORER', 'PLAYER_SHOTS'],
};
type Group = 'all' | keyof typeof GROUPS;

/** Odds management: pick a match, see every market's prices, set or hand back any price. */
export default function OddsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />}>
      <OddsBoard />
    </Suspense>
  );
}

function OddsBoard() {
  const t = useTranslations('odds');
  const params = useSearchParams();
  const router = useRouter();
  const eventId = params.get('event');
  const select = (id: string | null) => router.replace(id ? `/odds?event=${id}` : '/odds', { scroll: false });

  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className={cn('min-w-0', eventId && 'hidden lg:block')}>
          <MatchList selected={eventId} onSelect={select} />
        </div>
        <div className={cn('min-w-0', !eventId && 'hidden lg:block')}>
          {eventId ? (
            <MarketBoard key={eventId} eventId={eventId} onBack={() => select(null)} />
          ) : (
            <div className="glass grid min-h-[420px] place-items-center rounded-[var(--radius-card)]">
              <EmptyState icon={<TrendingUp className="size-10 text-brand" aria-hidden="true" />} title={t('pickTitle')}>
                <p className="max-w-sm text-sm">{t('pickHelp')}</p>
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── left: match picker ──
function MatchList({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const t = useTranslations('odds');
  const te = useTranslations('sportsbook.events');
  const f = useFmt();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const { data: comps } = useQuery({ queryKey: ['competitions'], queryFn: () => adminApi<AdminCompetitionRow[]>('/admin/sportsbook/competitions') });
  const list = usePaged<AdminEventRow>(['events'], '/admin/sportsbook/events', { q, status, competitionId }, { refetchInterval: 15_000 });

  return (
    <section className="glass flex flex-col overflow-hidden rounded-[var(--radius-card)] lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
      <div className="space-y-2 border-b border-line p-3">
        <SearchInput value={q} onChange={setQ} placeholder={te('search')} />
        <div className="grid grid-cols-[1fr_auto] gap-2 [&_label:first-child_select]:w-full">
          <FilterSelect
            label={te('league')}
            value={competitionId}
            onChange={setCompetitionId}
            options={[{ value: '', label: te('allLeagues') }, ...(comps ?? []).filter((c) => c.active && c.enabled).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <FilterSelect
            label={te('cols.status')}
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: te('bettable') },
              { value: 'LIVE', label: te('statuses.LIVE') },
              { value: 'SCHEDULED', label: te('statuses.SCHEDULED') },
            ]}
          />
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" data-testid="odds-matches">
        {list.isLoading
          ? Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="p-3">
                <Skeleton className="h-10 w-full" />
              </li>
            ))
          : null}
        {!list.isLoading && list.items.length === 0 ? <li className="p-6 text-center text-sm text-ink-muted">{te('empty')}</li> : null}
        {list.items.map((e) => {
          const on = e.id === selected;
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                aria-current={on ? 'true' : undefined}
                className={cn('relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-tint/[0.04]', on && 'bg-brand-soft hover:bg-brand-soft')}
                data-testid={`odds-match-${e.id}`}
              >
                {on ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand" /> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{e.homeTeam}</span>
                  <span className="block truncate text-sm font-semibold">{e.awayTeam}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">{e.competition.name}</span>
                </span>
                <span className="shrink-0 text-right">
                  {e.status === 'LIVE' ? (
                    <>
                      <span className="block font-display text-base font-semibold tabular-nums">
                        {e.homeScore}:{e.awayScore}
                      </span>
                      <span className="text-xs font-semibold text-live">{e.minute ?? 0}&apos;</span>
                    </>
                  ) : (
                    <span className="block whitespace-nowrap text-xs text-ink-muted">{f.dateTime(e.startTime)}</span>
                  )}
                  {e.suspended ? (
                    <Badge tone="danger" className="mt-1">
                      {t('suspendedShort')}
                    </Badge>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
        {list.hasNextPage ? (
          <li className="p-3">
            <Button variant="ghost" size="sm" className="w-full" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {t('more')}
            </Button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

// ── right: the selected match's markets ──
function MarketBoard({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const t = useTranslations('odds');
  const tm = useTranslations('markets');
  const tp = useTranslations('periods');
  const to = useTranslations('outcomes');
  const tc = useTranslations('common2');
  const f = useFmt();
  const can = useCan();
  const qc = useQueryClient();
  const [group, setGroup] = useState<Group>('all');
  const [filter, setFilter] = useState('');
  const [manualOnly, setManualOnly] = useState(false);
  const [pricing, setPricing] = useState<{ market: AdminMarketRow; selection: Selection } | null>(null);
  const [action, setAction] = useState<{ market: AdminMarketRow; patch: { enabled?: boolean; suspended?: boolean } } | null>(null);

  const event = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => adminApi<Page<AdminEventRow>>(`/admin/sportsbook/events?id=${eventId}&limit=1`).then((p) => p.items[0] ?? null),
    refetchInterval: 15_000,
  });
  const markets = useQuery({
    queryKey: ['event-markets', eventId],
    queryFn: () => adminApi<AdminMarketRow[]>(`/admin/sportsbook/events/${eventId}/markets`),
    refetchInterval: 20_000,
  });

  const label = (m: AdminMarketRow) =>
    `${tm(m.type)}${m.lineCenti !== null ? ` ${m.lineCenti / 100}` : ''}${m.playerName ? ` · ${m.playerName}` : ''}${m.period === 'H1' ? ` (${tp('H1')})` : ''}`;
  const outcomeLabel = (s: Selection) => s.label ?? (to.has(s.outcome) ? to(s.outcome) : s.outcome);
  const editable = (m: AdminMarketRow) => can('OPERATOR') && m.status !== 'SETTLED';

  const all = markets.data ?? [];
  const stats = {
    manual: all.reduce((n, m) => n + m.selections.filter((s) => s.manual).length, 0),
    suspended: all.filter((m) => m.status === 'SUSPENDED').length,
  };
  const term = filter.trim().toLowerCase();
  const shown = all.filter(
    (m) =>
      (group === 'all' || GROUPS[group]!.includes(m.type)) &&
      (!manualOnly || m.selections.some((s) => s.manual)) &&
      (!term || label(m).toLowerCase().includes(term)),
  );
  const counts = Object.fromEntries(Object.entries(GROUPS).map(([g, types]) => [g, all.filter((m) => types.includes(m.type)).length]));
  const e = event.data;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
        <ArrowLeft aria-hidden="true" />
        {t('back')}
      </Button>

      {/* match header */}
      <section className="glass rounded-[var(--radius-card)] p-5" data-testid="odds-event">
        {e ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span className="grid h-5 w-8 place-items-center rounded bg-tint/[0.07] text-[10px] font-bold">{e.competition.countryCode}</span>
              <span className="font-semibold">{e.competition.name}</span>
              <span aria-hidden="true">·</span>
              <span>{f.dateTime(e.startTime)}</span>
              <EventStatusBadge status={e.status} />
              {e.suspended ? <Badge tone="danger">{t('matchSuspended')}</Badge> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {e.homeTeam} <span className="text-ink-faint">–</span> {e.awayTeam}
                {e.status === 'LIVE' ? (
                  <span className="ml-3 align-middle text-xl tabular-nums text-live">
                    {e.homeScore}:{e.awayScore} · {e.minute ?? 0}&apos;
                  </span>
                ) : null}
              </h2>
              <Link href="/sportsbook" className="text-sm font-semibold text-ink-muted hover:text-brand">
                {t('matchSettings')}
              </Link>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['markets', all.length],
                  ['manualPrices', stats.manual],
                  ['suspendedMarkets', stats.suspended],
                  ['openBets', e.openTickets],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-tint/[0.04] px-3 py-2 ring-1 ring-line">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{t(`stats.${k}`)}</dt>
                  <dd className={cn('font-display text-xl font-semibold tabular-nums', k === 'manualPrices' && v > 0 && 'text-accent')}>{markets.isLoading && k !== 'openBets' ? '–' : v}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : event.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <p className="text-sm text-ink-muted">{t('notFound')}</p>
        )}
      </section>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 [&>[role=tablist]]:max-w-full">
        <ViewTabs<Group>
          label={t('groupsLabel')}
          value={group}
          onChange={setGroup}
          options={[
            { value: 'all', label: t('groups.all'), count: all.length },
            ...Object.keys(GROUPS)
              .filter((g) => counts[g]! > 0)
              .map((g) => ({ value: g as Group, label: t(`groups.${g}`), count: counts[g] })),
          ]}
        />
        <label className="relative ml-auto block min-w-[180px] flex-1 sm:max-w-[240px]">
          <span className="sr-only">{t('filter')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            type="search"
            value={filter}
            onChange={(ev) => setFilter(ev.target.value)}
            placeholder={t('filter')}
            className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-tint/[0.04] pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <Toggle checked={manualOnly} onChange={setManualOnly} label={t('manualOnly')} />
          {t('manualOnly')}
        </label>
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <Bot className="size-3.5" aria-hidden="true" />
          {t('legendAuto')}
        </span>
        <span className="flex items-center gap-1.5 text-accent">
          <Hand className="size-3.5" aria-hidden="true" />
          {t('legendManual')}
        </span>
        {can('OPERATOR') ? <span>{t('legendClick')}</span> : null}
      </p>

      {/* markets */}
      {markets.isLoading ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="glass rounded-[var(--radius-card)]">
          <EmptyState title={all.length === 0 ? t('noMarkets') : t('noMatch')} />
        </div>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2" data-testid="event-markets">
          {shown.map((m) => {
            const wide = m.selections.length > 3;
            return (
              <li
                key={m.id}
                className={cn(
                  'glass flex flex-col rounded-[var(--radius-card)] p-4',
                  m.adminSuspended && 'ring-1 ring-danger/40',
                  !m.enabled && 'opacity-60',
                  m.selections.length > 6 && 'xl:col-span-2',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 text-sm font-semibold">{label(m)}</h3>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                    {m.status === 'SUSPENDED' ? <Badge tone={m.adminSuspended ? 'danger' : 'warning'}>{t(m.adminSuspended ? 'byOperator' : 'byFeed')}</Badge> : null}
                    {m.status === 'SETTLED' ? <Badge>{t('settled')}</Badge> : null}
                    {!m.enabled ? <Badge>{t('hidden')}</Badge> : null}
                  </div>
                </div>

                <div className={cn('mt-3 grid gap-2', wide ? 'grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4' : m.selections.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                  {m.selections.map((s) => {
                    const body = (
                      <>
                        <span className="flex w-full items-center justify-between gap-1">
                          <span className="truncate text-xs text-ink-muted">{outcomeLabel(s)}</span>
                          {s.manual ? <Hand className="size-3.5 shrink-0 text-accent" aria-label={t('manual')} /> : null}
                        </span>
                        <span className={cn('font-display text-xl font-semibold tabular-nums', s.manual && 'text-accent')}>{f.odds(s.oddsMilli)}</span>
                      </>
                    );
                    const tile = cn(
                      'flex min-w-0 flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left ring-1',
                      s.manual ? 'bg-accent/10 ring-accent/40' : 'bg-tint/[0.04] ring-line',
                      !s.active && 'line-through opacity-50',
                    );
                    return editable(m) ? (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPricing({ market: m, selection: s })}
                        className={cn(tile, 'transition-all hover:-translate-y-px hover:ring-brand/60 focus-visible:ring-2 focus-visible:ring-brand')}
                        title={t('editPrice')}
                        data-testid="selection-price"
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={s.id} className={tile}>
                        {body}
                      </div>
                    );
                  })}
                </div>

                {editable(m) ? (
                  <div className="mt-3 flex gap-1 border-t border-line pt-3">
                    <Button size="sm" variant={m.adminSuspended ? 'secondary' : 'ghost'} onClick={() => setAction({ market: m, patch: { suspended: !m.adminSuspended } })}>
                      {m.adminSuspended ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                      {t(m.adminSuspended ? 'resume' : 'suspend')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAction({ market: m, patch: { enabled: !m.enabled } })}>
                      {m.enabled ? <EyeOff aria-hidden="true" /> : <Lock aria-hidden="true" />}
                      {t(m.enabled ? 'hide' : 'show')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <PriceDialog
        target={pricing}
        title={pricing ? `${label(pricing.market)} · ${outcomeLabel(pricing.selection)}` : ''}
        onClose={() => setPricing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['event-markets', eventId] })}
      />
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
          await qc.invalidateQueries({ queryKey: ['event-markets', eventId] });
        }}
      />
    </div>
  );
}

/** Set a price by hand (held against automatic pricing) or hand it back. */
function PriceDialog({
  target,
  title,
  onClose,
  onSaved,
}: {
  target: { market: AdminMarketRow; selection: Selection } | null;
  title: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations('odds');
  const f = useFmt();
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [text, setText] = useState('');
  useEffect(() => {
    if (!target) return;
    setMode('manual');
    setText((target.selection.oddsMilli / 1000).toFixed(2));
  }, [target]);

  const milli = Math.round(Number(text.replace(',', '.')) * 1000);
  const valid = Number.isFinite(milli) && milli >= 1010 && milli <= 1_000_000;
  const current = target?.selection.oddsMilli ?? 0;
  const step = (d: number) => setText((v) => (Math.max(1.01, Math.round((Number(v.replace(',', '.')) || 1) * 100 + d * 100) / 100)).toFixed(2));
  const change = valid && current ? ((milli - current) / current) * 100 : 0;

  return (
    <ReasonDialog
      open={!!target}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={t(mode === 'manual' ? 'priceHelp' : 'autoHelp')}
      confirmLabel={t(mode === 'manual' ? 'savePrice' : 'handBack')}
      onConfirm={async (reason) => {
        if (mode === 'manual' && !valid) throw new ApiError('VALIDATION_FAILED', 400);
        await adminApi(`/admin/sportsbook/selections/${target!.selection.id}`, {
          method: 'PATCH',
          body: mode === 'manual' ? { manual: true, oddsMilli: milli, reason } : { manual: false, reason },
        });
        toast.success(t('priceUpdated'));
        await onSaved();
      }}
    >
      {target?.selection.manual ? (
        <ViewTabs<'manual' | 'auto'>
          label={t('mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'manual', label: t('modeManual') },
            { value: 'auto', label: t('modeAuto') },
          ]}
        />
      ) : null}
      <div className="flex items-center justify-between rounded-xl bg-tint/[0.04] px-4 py-3 ring-1 ring-line">
        <span className="text-sm text-ink-muted">{t(target?.selection.manual ? 'currentManual' : 'currentAuto')}</span>
        <span className="font-display text-2xl font-semibold tabular-nums">{current ? f.odds(current) : '–'}</span>
      </div>
      {mode === 'manual' ? (
        <div>
          <label htmlFor="price-input" className="mb-1.5 block text-sm font-medium">
            {t('newPrice')}
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="icon" onClick={() => step(-0.05)} aria-label="-0.05">
              <Minus aria-hidden="true" />
            </Button>
            <Input
              id="price-input"
              inputMode="decimal"
              value={text}
              onChange={(ev) => setText(ev.target.value.replace(/[^\d.,]/g, ''))}
              aria-invalid={!valid}
              className={cn('h-10 w-28 text-center font-display text-lg font-semibold tabular-nums', !valid && 'border-danger')}
              data-testid="price-input"
            />
            <Button type="button" variant="secondary" size="icon" onClick={() => step(0.05)} aria-label="+0.05">
              <Plus aria-hidden="true" />
            </Button>
            {valid ? (
              <span className="ml-auto text-right text-xs text-ink-muted">
                {t('implied', { pct: (100_000 / milli).toFixed(1) })}
                {change !== 0 ? <span className={cn('block font-semibold', change > 0 ? 'text-success' : 'text-danger')}>{`${change > 0 ? '+' : ''}${change.toFixed(1)}%`}</span> : null}
              </span>
            ) : null}
          </div>
          {!valid ? <p className="mt-1 text-xs text-danger">{t('invalidPrice')}</p> : null}
        </div>
      ) : null}
    </ReasonDialog>
  );
}
