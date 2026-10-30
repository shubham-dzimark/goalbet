'use client';

import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminTicketRow, type TicketLegDto } from '@goalbet/shared';
import { Dialog, SidePanelContent, Skeleton } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';
import { LegStatusBadge, TicketStatusBadge, TxTypeBadge } from './ui/badges';
import { type Column, DataTable } from './ui/data-table';
import { DetailList } from './ui/page';

type TicketDetail = AdminTicketRow & {
  rejectReason: string | null;
  voidReason: string | null;
  transactions: { id: string; type: string; amountBani: number; balanceAfterBani: number; reason: string; createdAt: string }[];
};

/** Readable selection: "Over 2.5 · Total goals". */
function useLegText() {
  const t = useTranslations();
  return (leg: TicketLegDto) =>
    leg.selections
      .map((s) => {
        const market = t.has(`markets.${s.marketType}`) ? t(`markets.${s.marketType}`) : s.marketType;
        const outcome = s.label ?? (t.has(`outcomes.${s.outcome}`) ? t(`outcomes.${s.outcome}`) : s.outcome);
        const line = s.line !== null ? ` ${(s.line / 100).toString()}` : '';
        return `${outcome}${line} · ${market}${s.marketPeriod === 'H1' ? ` (${t('periods.H1')})` : ''}`;
      })
      .join(' + ');
}

/** Ticket side panel: legs with results, money and wallet movements (F3.4). */
export function TicketPanel({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('bets');
  const tc = useTranslations('common2');
  const tt = useTranslations('ticketType');
  const f = useFmt();
  const legText = useLegText();
  const { data } = useQuery({ queryKey: ['ticket', id], queryFn: () => adminApi<TicketDetail>(`/admin/tickets/${id}`), enabled: !!id });

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SidePanelContent title={data ? `${t('ticket')} ${data.code}` : t('ticket')} description={data ? f.dateTime(data.placedAt) : undefined} closeLabel={tc('close')}>
        {!data ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6" data-testid="ticket-panel">
            <div className="flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={data.status} />
              <span className="rounded-full bg-tint/[0.06] px-2 py-0.5 text-[11px] font-bold uppercase text-ink-muted">{tt(data.type)}</span>
              {data.isLive ? (
                <span className="flex items-center gap-1 text-[11px] font-bold uppercase text-live">
                  <Radio className="size-3" aria-hidden="true" />
                  {t('liveBet')}
                </span>
              ) : null}
            </div>

            <DetailList
              rows={[
                { label: t('player'), value: <Link href={`/users/${data.user.id}`} className="text-brand hover:underline">{data.user.name}</Link> },
                { label: t('stake'), value: f.ron(data.stakeBani) },
                { label: t('odds'), value: f.odds(data.totalOddsMilli) },
                { label: t('potential'), value: f.ron(data.potentialWinBani) },
                ...(data.payoutBani !== null ? [{ label: t('payout'), value: <span className="text-brand">{f.ron(data.payoutBani)}</span> }] : []),
                ...(data.cashedOutBani !== null ? [{ label: t('cashedOut'), value: <span className="text-accent">{f.ron(data.cashedOutBani)}</span> }] : []),
                ...(data.settledAt ? [{ label: t('settledAt'), value: f.dateTime(data.settledAt) }] : []),
                ...(data.rejectReason ? [{ label: t('rejectReason'), value: data.rejectReason }] : []),
                ...(data.voidReason ? [{ label: t('voidReason'), value: data.voidReason }] : []),
              ]}
            />

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{t('legs', { count: data.legs.length })}</h3>
              <ol className="space-y-2">
                {data.legs.map((l) => (
                  <li key={l.id} className="rounded-xl bg-tint/[0.04] p-3 ring-1 ring-line">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{l.event.homeTeam} – {l.event.awayTeam}</p>
                        <p className="truncate text-xs text-ink-muted">{legText(l)}</p>
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          {l.event.competition} · {f.dateTime(l.event.startTime)}
                          {l.event.status !== 'SCHEDULED' ? ` · ${l.event.homeScore}:${l.event.awayScore}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-display tracking-tight text-lg font-semibold tabular-nums">{f.odds(l.oddsMilli)}</p>
                        <LegStatusBadge status={l.status} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{t('movements')}</h3>
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {data.transactions.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <TxTypeBadge type={x.type} />
                      <span className="text-xs text-ink-faint">{f.dateTime(x.createdAt)}</span>
                    </span>
                    <span className={x.amountBani > 0 ? 'font-semibold text-brand' : 'font-semibold'}>{f.signedRon(x.amountBani)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </SidePanelContent>
    </Dialog>
  );
}

/** Ticket list (Bets page, player page). `params` are the admin ticket filters. */
export function TicketsTable({ params, showPlayer = true, testId }: { params: Record<string, string | undefined>; showPlayer?: boolean; testId?: string }) {
  const t = useTranslations('bets');
  const tt = useTranslations('ticketType');
  const f = useFmt();
  const [open, setOpen] = useState<string | null>(null);
  const list = usePaged<AdminTicketRow>(['tickets'], '/admin/tickets', params, { refetchInterval: 15_000 });

  const columns: Column<AdminTicketRow>[] = [
    {
      key: 'code',
      header: t('cols.ticket'),
      cell: (x) => (
        <div>
          <p className="font-mono text-sm font-bold tracking-wider">{x.code}</p>
          <p className="text-[11px] text-ink-faint">{f.dateTime(x.placedAt)}</p>
        </div>
      ),
    },
    ...(showPlayer
      ? [{ key: 'player', header: t('cols.player'), cell: (x: AdminTicketRow) => <span className="block max-w-[180px] truncate">{x.user.name}</span>, hideBelow: 'md' as const }]
      : []),
    {
      key: 'selection',
      header: t('cols.selection'),
      cell: (x) => (
        <div className="max-w-[260px]">
          <p className="truncate text-sm">{x.legs.length === 1 ? `${x.legs[0]!.event.homeTeam} – ${x.legs[0]!.event.awayTeam}` : t('multi', { count: x.legs.length })}</p>
          <p className="text-[11px] uppercase text-ink-faint">
            {tt(x.type)}
            {x.isLive ? ` · ${t('liveBet')}` : ''}
          </p>
        </div>
      ),
      hideBelow: 'sm',
    },
    { key: 'stake', header: t('cols.stake'), align: 'right', cell: (x) => <span className="tabular-nums">{f.ron(x.stakeBani)}</span> },
    { key: 'odds', header: t('cols.odds'), align: 'right', cell: (x) => <span className="font-display tracking-tight font-semibold tabular-nums">{f.odds(x.totalOddsMilli)}</span>, hideBelow: 'md' },
    {
      key: 'return',
      header: t('cols.return'),
      align: 'right',
      cell: (x) =>
        x.payoutBani !== null ? (
          <span className="font-semibold text-brand">{f.ron(x.payoutBani)}</span>
        ) : x.cashedOutBani !== null ? (
          <span className="font-semibold text-accent">{f.ron(x.cashedOutBani)}</span>
        ) : (
          <span className="text-ink-muted">{f.ron(x.potentialWinBani)}</span>
        ),
    },
    { key: 'status', header: t('cols.status'), cell: (x) => <TicketStatusBadge status={x.status} /> },
  ];

  return (
    <>
      <DataTable
        testId={testId}
        columns={columns}
        rows={list.items}
        rowKey={(x) => x.id}
        loading={list.isLoading}
        onRowClick={(x) => setOpen(x.id)}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={t('empty')}
      />
      <TicketPanel id={open} onClose={() => setOpen(null)} />
    </>
  );
}
