'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Flag as FlagIcon, Lock, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type EventDetailDto } from '@goalbet/shared';
import { Alert, EmptyState } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Countdown, MinuteRing } from '@/components/fx/match-clock';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { usePoll, useWatch } from '@/lib/realtime';
import { useFormat } from '@/lib/format';
import { MarketBoard } from './market-board';

/** F1.9 — match page: full-bleed hero (crests, score or countdown, live stats) + every market. */
export function MatchView({ id, initial }: { id: string; initial: EventDetailDto | null }) {
  const t = useTranslations();
  const f = useFormat();
  const livePoll = usePoll(3_000);
  const slowPoll = usePoll(15_000);
  useWatch({ eventIds: [id] });
  const { data, isError } = useQuery({
    queryKey: ['event', id],
    queryFn: () => api<EventDetailDto>(`/catalog/events/${id}`),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: (q) => (q.state.data?.status === 'LIVE' ? livePoll : slowPoll),
  });

  if (isError || !data) {
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState title={t('match.notFound')}>
          <Link href="/" className="font-semibold text-brand">
            {t('match.back')}
          </Link>
        </EmptyState>
      </div>
    );
  }
  const live = data.status === 'LIVE';

  return (
    <div className="space-y-5">
      <section data-theme="dark" className="relative overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(42rem 22rem at 0% 0%, rgb(var(--brand-rgb) / 0.22), transparent 60%), radial-gradient(36rem 20rem at 100% 0%, rgb(var(--gold-rgb) / 0.12), transparent 60%), radial-gradient(30rem 16rem at 50% 120%, rgb(var(--brand-rgb) / 0.14), transparent 70%)',
          }}
        />
        <div aria-hidden="true" className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-tint/10 to-transparent" />
        <div className="relative px-4 pb-6 pt-4 sm:px-8">
          <div className="mb-6 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-muted">
            <Link href={`/sport/${data.competition.id}`} className="flex items-center gap-2 rounded-full bg-tint/[0.06] px-3 py-1.5 hover:text-ink">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              <Flag code={data.competition.countryCode} />
              {data.competition.name}
            </Link>
            {!live ? <span>{f.kickoff(data.startTime)}</span> : null}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <TeamCrest name={data.homeTeam} logo={data.homeLogo} size={64} className="sm:size-24" />
              <h1 className="font-display text-xl font-bold uppercase leading-tight sm:text-3xl" data-testid="match-home">
                {data.homeTeam}
              </h1>
            </div>
            <div className="flex flex-col items-center gap-2">
              {live ? (
                <>
                  <p className="font-display text-5xl font-extrabold tabular-nums sm:text-7xl" data-testid="match-score">
                    {data.homeScore}
                    <span className="mx-1 text-ink-faint">:</span>
                    {data.awayScore}
                  </p>
                  <MinuteRing event={data} size={52} />
                  {data.htHomeScore !== null ? <p className="text-xs text-ink-faint">{t('match.ht', { home: data.htHomeScore, away: data.htAwayScore ?? 0 })}</p> : null}
                </>
              ) : (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-muted">{t('fx.kickoffIn')}</span>
                  <Countdown to={data.startTime} className="font-display text-3xl font-bold text-accent sm:text-5xl" />
                </>
              )}
            </div>
            <div className="flex flex-col items-center gap-3 text-center">
              <TeamCrest name={data.awayTeam} logo={data.awayLogo} size={64} className="sm:size-24" />
              <h1 className="font-display text-xl font-bold uppercase leading-tight sm:text-3xl" data-testid="match-away">
                {data.awayTeam}
              </h1>
            </div>
          </div>
          {live && (data.corners > 0 || data.cards > 0) ? (
            <div className="mt-5 flex justify-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 rounded-full bg-tint/[0.06] px-3 py-1">
                <FlagIcon className="size-3.5 text-accent" aria-hidden="true" />
                {t('match.corners')} {data.corners}
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-tint/[0.06] px-3 py-1">
                <Square className="size-3.5 fill-warning text-warning" aria-hidden="true" />
                {t('match.cards')} {data.cards}
              </span>
            </div>
          ) : null}
        </div>
      </section>
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
