'use client';

import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type LegStatus, type TicketDto, type TicketStatus } from '@goalbet/shared';
import { Badge, Card, cn } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';

const STATUS_TONE: Record<TicketStatus, 'neutral' | 'brand' | 'live' | 'success' | 'danger' | 'warning' | 'info'> = {
  PENDING: 'neutral',
  ACTIVE: 'info',
  LIVE: 'live',
  WON: 'success',
  LOST: 'danger',
  VOID: 'neutral',
  CASHED_OUT: 'brand',
  REJECTED: 'danger',
};

function LegIcon({ status }: { status: LegStatus }) {
  if (status === 'WON' || status === 'HALF_WON') return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  if (status === 'LOST' || status === 'HALF_LOST') return <XCircle className="size-4 text-danger" aria-hidden="true" />;
  if (status === 'VOID') return <MinusCircle className="size-4 text-ink-faint" aria-hidden="true" />;
  return <CircleDashed className="size-4 text-ink-faint" aria-hidden="true" />;
}

/** F1.7 ticket: every leg with odds and status, stake, potential / actual win, status. */
export function TicketCard({ ticket, link = true }: { ticket: TicketDto; link?: boolean }) {
  const t = useTranslations();
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const settled = ['WON', 'LOST', 'VOID', 'CASHED_OUT'].includes(ticket.status);

  return (
    <Card className="overflow-hidden" data-testid="ticket-card" data-status={ticket.status}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-card-alt px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[ticket.status]} data-testid="ticket-status">{t(`ticketStatus.${ticket.status}`)}</Badge>
          <span className="text-sm font-bold">
            {ticket.legs.some((l) => l.kind === 'BET_BUILDER') && ticket.type === 'SINGLE' ? t('ticketType.BET_BUILDER') : t(`ticketType.${ticket.type}`)}
          </span>
        </div>
        <span className="text-xs text-ink-muted">
          {t('bets.code')} <span className="font-mono font-semibold text-ink">{ticket.code}</span> · {f.dateTime(ticket.placedAt)}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {ticket.legs.map((leg) => (
          <li key={leg.id} className="flex items-start gap-2.5 px-3 py-2">
            <span className="mt-0.5">
              <LegIcon status={leg.status} />
            </span>
            <div className="min-w-0 flex-1">
              {leg.selections.map((s) => (
                <p key={s.selectionId} className="truncate text-sm font-semibold">
                  {outcomeLong({ type: s.marketType, line: s.line }, { outcome: s.outcome, label: s.label }, leg.event)}
                  <span className="font-normal text-ink-muted">
                    {' · '}
                    {marketTitle({ type: s.marketType, period: s.marketPeriod, line: s.line, team: s.team, playerName: s.playerName }, leg.event)}
                  </span>
                </p>
              ))}
              <p className="truncate text-xs text-ink-faint">
                {leg.event.homeTeam} – {leg.event.awayTeam}
                {leg.event.status === 'LIVE' ? (
                  <span className="ml-1.5 font-bold text-live">
                    {leg.event.homeScore}:{leg.event.awayScore} {leg.event.minute ? `${leg.event.minute}'` : ''}
                  </span>
                ) : (
                  ` · ${f.kickoff(leg.event.startTime)}`
                )}
              </p>
            </div>
            <span className="text-sm font-bold tabular-nums">{f.odds(leg.oddsMilli)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-3 gap-2 border-t border-line px-3 py-2 text-xs">
        <div>
          <dt className="text-ink-muted">{t('bets.stake')}</dt>
          <dd className="font-bold tabular-nums">{f.ron(ticket.stakeBani)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">{t('bets.totalOdds')}</dt>
          <dd className="font-bold tabular-nums">{f.odds(ticket.totalOddsMilli)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-ink-muted">
            {ticket.status === 'CASHED_OUT' ? t('bets.cashedOut') : settled ? t('bets.payout') : t('bets.potentialWin')}
          </dt>
          <dd className={cn('font-bold tabular-nums', ticket.status === 'WON' && 'text-success')} data-testid="ticket-win">
            {f.ron(ticket.status === 'CASHED_OUT' ? (ticket.cashedOutBani ?? 0) : settled ? (ticket.payoutBani ?? 0) : ticket.potentialWinBani)}
          </dd>
        </div>
      </dl>
      {link ? (
        <Link href={`/my-bets/${ticket.id}`} className="block border-t border-line px-3 py-2 text-center text-xs font-semibold text-brand hover:bg-card-alt">
          {t('bets.details')}
        </Link>
      ) : null}
    </Card>
  );
}
