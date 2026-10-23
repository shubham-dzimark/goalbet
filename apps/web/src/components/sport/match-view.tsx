'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type EventDetailDto } from '@goalbet/shared';
import { Alert, Card, EmptyState, LiveDot } from '@goalbet/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useFormat, useMatchClock } from '@/lib/format';
import { MarketBoard } from './market-board';

/** F1.9 — match page: header with score/clock and every market. */
export function MatchView({ id, initial }: { id: string; initial: EventDetailDto | null }) {
  const t = useTranslations();
  const f = useFormat();
  const clockOf = useMatchClock();
  const { data, isError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api<EventDetailDto>(`/catalog/events/${id}`),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: (q) => (q.state.data?.status === 'LIVE' ? 3_000 : 15_000),
  });

  if (isError || !data) {
    return (
      <Card>
        <EmptyState title={t('match.notFound')}>
          <Link href="/" className="font-semibold text-brand">
            {t('match.back')}
          </Link>
        </EmptyState>
      </Card>
    );
  }
  const live = data.status === 'LIVE';

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-chrome px-4 py-4 text-chrome-ink sm:px-6">
          <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase text-chrome-muted">
            <Link href={`/sport/${data.competition.id}`} className="flex items-center gap-1.5 hover:text-chrome-ink">
              <ArrowLeft className="size-4" aria-hidden="true" />
              {data.competition.country} · {data.competition.name}
            </Link>
            {live ? (
              <span className="flex items-center gap-1.5 text-live" data-testid="match-clock">
                <LiveDot />
                {clockOf(data)}
              </span>
            ) : (
              <span>{f.kickoff(data.startTime)}</span>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
            <h1 className="font-display text-xl font-bold sm:text-3xl" data-testid="match-home">{data.homeTeam}</h1>
            <div className="min-w-24">
              {live ? (
                <p className="font-display text-4xl font-bold tabular-nums" data-testid="match-score">
                  {data.homeScore} : {data.awayScore}
                </p>
              ) : (
                <p className="font-display text-2xl font-bold text-chrome-muted">vs</p>
              )}
              {live && data.htHomeScore !== null ? (
                <p className="text-xs text-chrome-muted">{t('match.ht', { home: data.htHomeScore, away: data.htAwayScore ?? 0 })}</p>
              ) : null}
            </div>
            <h1 className="font-display text-xl font-bold sm:text-3xl" data-testid="match-away">{data.awayTeam}</h1>
          </div>
          {live ? (
            <p className="mt-3 text-center text-xs text-chrome-muted">
              {t('match.corners')}: {data.corners} · {t('match.cards')}: {data.cards}
            </p>
          ) : null}
        </div>
      </Card>
      {data.suspended ? (
        <Alert tone="warning" className="flex items-center gap-2">
          <Lock className="size-4" aria-hidden="true" />
          {t('match.suspended')}
        </Alert>
      ) : null}
      <MarketBoard event={data} />
    </div>
  );
}
