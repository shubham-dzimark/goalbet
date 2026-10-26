'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type EventDetailDto, type EventSummaryDto } from '@goalbet/shared';
import { Button, LiveDot, Skeleton } from '@goalbet/ui';
import { MinuteRing } from '@/components/fx/match-clock';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { usePoll, useWatch } from '@/lib/realtime';
import { useMarketText } from '@/lib/markets';
import { EventList, PageTitle } from './event-list';
import { OddsButton } from './odds-button';

const KEY_MARKETS = ['MATCH_RESULT|FT||||', 'TOTAL_GOALS|FT|250||', 'BTTS|FT||||', 'DOUBLE_CHANCE|FT||||', 'TOTAL_GOALS|FT|150||', 'TOTAL_GOALS|FT|350||'];

/** Live centre panel: the selected match's scoreboard and key in-play markets. */
function LivePanel({ id }: { id: string }) {
  const t = useTranslations();
  const { marketTitle, outcomeShort } = useMarketText();
  const poll = usePoll(3_000);
  useWatch({ eventIds: [id] });
  const { data } = useQuery({ queryKey: ['event', id], queryFn: () => api<EventDetailDto>(`/catalog/events/${id}`), refetchInterval: poll });
  if (!data) return <Skeleton className="h-96 rounded-3xl" />;
  const markets = KEY_MARKETS.map((k) => data.markets.find((m) => m.key === k)).filter((m): m is NonNullable<typeof m> => !!m);
  return (
    <div className="glass overflow-hidden rounded-3xl">
      <div className="relative bg-[radial-gradient(30rem_12rem_at_50%_0%,rgb(var(--live-rgb)/0.18),transparent_70%)] px-5 pb-5 pt-4">
        <p className="mb-4 text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">{data.competition.name}</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamCrest name={data.homeTeam} size={52} />
            <span className="text-sm font-bold leading-tight">{data.homeTeam}</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="font-display text-5xl font-extrabold tabular-nums">
              {data.homeScore}
              <span className="text-ink-faint">:</span>
              {data.awayScore}
            </span>
            <MinuteRing event={data} size={46} />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <TeamCrest name={data.awayTeam} size={52} />
            <span className="text-sm font-bold leading-tight">{data.awayTeam}</span>
          </div>
        </div>
        {data.htHomeScore !== null ? (
          <p className="mt-3 text-center text-xs text-ink-faint">{t('match.ht', { home: data.htHomeScore, away: data.htAwayScore ?? 0 })}</p>
        ) : null}
      </div>
      <div className="space-y-3 p-4">
        {markets.length === 0 ? <p className="py-6 text-center text-sm text-ink-muted">{t('match.noMarkets')}</p> : null}
        {markets.map((m) => (
          <div key={m.id}>
            <p className="mb-1.5 text-xs font-semibold text-ink-muted">{marketTitle(m, data)}</p>
            <div className={m.selections.length === 2 ? 'grid grid-cols-2 gap-1.5' : 'grid grid-cols-3 gap-1.5'}>
              {m.selections.map((s) => (
                <OddsButton key={s.id} event={data} market={m} selection={s} label={outcomeShort(m, s, data)} />
              ))}
            </div>
          </div>
        ))}
        <Button asChild variant="outline" className="w-full">
          <Link href={`/match/${id}`}>
            {t('live.allMarkets', { count: data.marketCount })}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** F1.6 — live centre: every live match (scores, minute, live odds) + a focus panel on desktop. */
export function LiveView({ initial }: { initial: EventSummaryDto[] | null }) {
  const t = useTranslations();
  const poll = usePoll(4_000);
  useWatch({ live: true });
  const { data } = useQuery({
    queryKey: ['live'],
    queryFn: () => api<EventSummaryDto[]>('/catalog/live'),
    ...(initial ? { initialData: initial } : {}),
    refetchInterval: poll,
  });
  const events = data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const focus = events.find((e) => e.id === selected) ?? events[0];

  return (
    <>
      <PageTitle
        sub={
          <span className="flex items-center gap-2">
            <LiveDot />
            {t('live.kicker', { count: events.length })}
          </span>
        }
      >
        {t('sport.liveNow')}
      </PageTitle>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <EventList events={events} groupBy="competition" empty={t('sport.noLive')} selectedId={focus?.id ?? null} onSelect={(e) => setSelected(e.id)} />
        {focus ? (
          <div className="hidden 2xl:block">
            <div className="sticky top-3">
              <LivePanel id={focus.id} />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
