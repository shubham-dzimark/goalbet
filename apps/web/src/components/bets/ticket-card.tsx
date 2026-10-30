'use client';

import { CheckCircle2, CircleDashed, MinusCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type CashOutQuoteDto, type LegStatus, type TicketDto, type TicketStatus } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { CashOutBar } from '@/components/bets/cash-out';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useMarketText } from '@/lib/markets';

const STATUS_STYLE: Record<TicketStatus, { text: string; glow: string; chip: string }> = {
  PENDING: { text: 'text-ink-muted', glow: 'from-tint/10', chip: 'bg-tint/10 text-ink-muted' },
  ACTIVE: { text: 'text-accent', glow: 'from-accent/25', chip: 'bg-accent/15 text-accent' },
  LIVE: { text: 'text-live', glow: 'from-live/30', chip: 'bg-live text-white' },
  WON: { text: 'text-brand', glow: 'from-brand/30', chip: 'bg-brand text-brand-ink' },
  LOST: { text: 'text-danger', glow: 'from-danger/20', chip: 'bg-danger/15 text-danger' },
  VOID: { text: 'text-ink-muted', glow: 'from-tint/10', chip: 'bg-tint/10 text-ink-muted' },
  CASHED_OUT: { text: 'text-boost', glow: 'from-boost/25', chip: 'bg-boost text-boost-ink' },
  REJECTED: { text: 'text-danger', glow: 'from-danger/20', chip: 'bg-danger/15 text-danger' },
};

function LegIcon({ status }: { status: LegStatus }) {
  if (status === 'WON' || status === 'HALF_WON') return <CheckCircle2 className="size-4 text-brand" aria-hidden="true" />;
  if (status === 'LOST' || status === 'HALF_LOST') return <XCircle className="size-4 text-danger" aria-hidden="true" />;
  if (status === 'VOID') return <MinusCircle className="size-4 text-ink-faint" aria-hidden="true" />;
  return <CircleDashed className="size-4 text-ink-faint" aria-hidden="true" />;
}

/** F1.7 ticket stub: every leg with odds and status, stake, odds, potential / actual win. */
export function TicketCard({ ticket, link = true, cashOut }: { ticket: TicketDto; link?: boolean; cashOut?: CashOutQuoteDto | undefined }) {
  const t = useTranslations();
  const f = useFormat();
  const { marketTitle, outcomeLong } = useMarketText();
  const settled = ['WON', 'LOST', 'VOID', 'CASHED_OUT'].includes(ticket.status);
  const style = STATUS_STYLE[ticket.status];
  const done = ticket.legs.filter((l) => l.status !== 'PENDING').length;
  const won = ticket.legs.filter((l) => l.status === 'WON' || l.status === 'HALF_WON').length;
  const amount = ticket.status === 'CASHED_OUT' ? (ticket.cashedOutBani ?? 0) : settled ? (ticket.payoutBani ?? 0) : ticket.potentialWinBani;

  return (
    <article data-reveal className="relative overflow-hidden rounded-[var(--radius-card)] bg-card-solid ring-1 ring-line" data-testid="ticket-card" data-status={ticket.status}>
      <div aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent', style.glow)} />
      <div className="relative flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide', style.chip)} data-testid="ticket-status">
            {t(`ticketStatus.${ticket.status}`)}
          </span>
          <span className="font-display tracking-tight text-lg font-semibold">
            {ticket.legs.some((l) => l.kind === 'BET_BUILDER') && ticket.type === 'SINGLE' ? t('ticketType.BET_BUILDER') : t(`ticketType.${ticket.type}`)}
          </span>
        </div>
        <span className="text-xs text-ink-muted">
          <span className="font-mono font-semibold tracking-wider text-ink">{ticket.code}</span> · {f.dateTime(ticket.placedAt)}
        </span>
      </div>

      {ticket.legs.length > 1 ? (
        <div className="relative mx-4 mt-3 flex gap-1" aria-label={`${won}/${ticket.legs.length}`}>
          {ticket.legs.map((l) => (
            <span
              key={l.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                l.status === 'WON' || l.status === 'HALF_WON' ? 'bg-brand' : l.status === 'LOST' || l.status === 'HALF_LOST' ? 'bg-danger' : l.status === 'VOID' ? 'bg-tint/30' : 'bg-tint/10',
              )}
            />
          ))}
          <span className="sr-only">
            {done}/{ticket.legs.length}
          </span>
        </div>
      ) : null}

      <ul className="relative mt-2 divide-y divide-line px-4">
        {ticket.legs.map((leg) => (
          <li key={leg.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5">
              <LegIcon status={leg.status} />
            </span>
            <div className="min-w-0 flex-1">
              {leg.selections.map((s) => (
                <p key={s.selectionId} className="truncate text-sm">
                  <span className="font-bold">{outcomeLong({ type: s.marketType, line: s.line }, { outcome: s.outcome, label: s.label }, leg.event)}</span>
                  <span className="text-ink-muted"> · {marketTitle({ type: s.marketType, period: s.marketPeriod, line: s.line, team: s.team, playerName: s.playerName }, leg.event)}</span>
                </p>
              ))}
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-ink-faint">
                <TeamCrest name={leg.event.homeTeam} logo={leg.event.homeLogo} size={14} />
                {leg.event.homeTeam} – {leg.event.awayTeam}
                {leg.event.status === 'LIVE' ? (
                  <span className="font-bold text-live">
                    {leg.event.homeScore}:{leg.event.awayScore} {leg.event.minute ? `${leg.event.minute}'` : ''}
                  </span>
                ) : (
                  <span>· {f.kickoff(leg.event.startTime)}</span>
                )}
              </p>
            </div>
            <span className="font-display tracking-tight text-lg font-semibold tabular-nums">{f.odds(leg.oddsMilli)}</span>
          </li>
        ))}
      </ul>

      {/* perforation */}
      <div aria-hidden="true" className="relative my-1 flex items-center">
        <span className="-ml-3 size-6 rounded-full bg-surface" />
        <span className="flex-1 border-t-2 border-dashed border-line" />
        <span className="-mr-3 size-6 rounded-full bg-surface" />
      </div>

      <dl className="relative grid grid-cols-3 gap-2 px-4 pb-4 pt-1">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{t('bets.stake')}</dt>
          <dd className="font-display tracking-tight text-lg font-semibold tabular-nums">{f.ron(ticket.stakeBani)}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{t('bets.totalOdds')}</dt>
          <dd className="font-display tracking-tight text-lg font-semibold tabular-nums">{f.odds(ticket.totalOddsMilli)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] uppercase tracking-wide text-ink-faint">
            {ticket.status === 'CASHED_OUT' ? t('bets.cashedOut') : settled ? t('bets.payout') : t('bets.potentialWin')}
          </dt>
          <dd className={cn('font-display tracking-tight text-xl font-semibold tabular-nums', style.text)} data-testid="ticket-win">
            {f.ron(amount)}
          </dd>
        </div>
      </dl>
      {settled ? null : <CashOutBar ticket={ticket} quote={cashOut} />}
      {link ? (
        <Link href={`/my-bets/${ticket.id}`} className="relative block border-t border-line px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-ink-muted transition-colors hover:bg-tint/[0.03] hover:text-brand">
          {t('bets.details')}
        </Link>
      ) : null}
    </article>
  );
}
