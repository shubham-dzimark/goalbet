'use client';

import { ChevronLeft, ChevronRight, Radio, Timer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { type EventSummaryDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { Countdown, MinuteRing } from '@/components/fx/match-clock';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useFormat, useMatchClock } from '@/lib/format';
import { gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';
import { OddsButton } from './odds-button';

const ROTATE_MS = 8_000;

function ProgressBar({ event }: { event: EventSummaryDto }) {
  const minute = event.period === 'HALF_TIME' ? 45 : Math.min(90, event.minute ?? 0);
  return (
    <div className="relative h-1.5 w-full rounded-full bg-tint/[0.07]" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand/40 to-brand transition-[width] duration-1000" style={{ width: `${(minute / 90) * 100}%` }} />
      <span className="absolute -top-1 left-1/2 h-3.5 w-px bg-tint/30" />
      <span className="absolute -top-[3px] size-3 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_14px_rgb(var(--brand-rgb)/0.9)] transition-[left] duration-1000" style={{ left: `${(minute / 90) * 100}%` }} />
    </div>
  );
}

/** Home hero: rotating live spotlight, or the next big match with a countdown when nothing is live. */
export function LiveSpotlight({ live, upcoming }: { live: EventSummaryDto[]; upcoming: EventSummaryDto[] }) {
  const t = useTranslations();
  const f = useFormat();
  const clockOf = useMatchClock();
  const mode = live.length > 0 ? 'live' : 'next';
  const list = mode === 'live' ? live : upcoming.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const event = list[Math.min(index, list.length - 1)];

  useEffect(() => {
    if (paused || list.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % list.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, list.length]);

  useGSAP(
    () => {
      if (!stage.current || prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.fromTo('[data-spot="crest"]', { scale: 0.6, opacity: 0, rotate: -8 }, { scale: 1, opacity: 1, rotate: 0, stagger: 0.08, duration: 0.6, ease: 'back.out(1.6)' })
        .fromTo('[data-spot="text"]', { y: 14, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, duration: 0.45 }, '<0.1')
        .fromTo('[data-spot="odds"] > *', { y: 16, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.4 }, '<0.15');
    },
    { scope: stage, dependencies: [event?.id] },
  );

  if (!event) return null;
  const market = event.mainMarket;
  const isLive = event.status === 'LIVE';

  return (
    <section
      aria-label={t(mode === 'live' ? 'home.spotlight' : 'home.nextUp')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong"
      data-theme="dark"
      data-testid="live-spotlight"
    >
      {/* floodlight backdrop tinted by the two teams */}
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-[background] duration-1000"
        style={{
          background:
            'radial-gradient(42rem 22rem at 0% 0%, rgb(var(--brand-rgb) / 0.22), transparent 60%), radial-gradient(36rem 20rem at 100% 0%, rgb(var(--gold-rgb) / 0.12), transparent 60%), radial-gradient(30rem 16rem at 50% 120%, rgb(var(--brand-rgb) / 0.14), transparent 70%)',
        }}
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-tint/10 to-transparent" />
      <div aria-hidden="true" className="absolute left-1/2 top-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-tint/[0.06]" />

      <div ref={stage} className="relative px-4 pb-4 pt-5 sm:px-8 sm:pt-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted" data-spot="text">
            <Flag code={event.competition.countryCode} />
            {event.competition.name}
          </span>
          {mode === 'live' ? (
            <span className="flex items-center gap-2 rounded-full bg-live px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_24px_rgb(var(--live-rgb)/0.6)]">
              <Radio className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('home.spotlight')}</span>
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-full bg-accent/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
              <Timer className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t('home.nextUp')}</span>
            </span>
          )}
        </div>

        <Link href={`/match/${event.id}`} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span data-spot="crest">
              <TeamCrest name={event.homeTeam} size={72} className="sm:size-24" />
            </span>
            <span data-spot="text" className="font-display text-lg font-bold uppercase leading-tight sm:text-2xl">
              {event.homeTeam}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2" data-spot="text">
            {isLive ? (
              <>
                <span className="font-display text-5xl font-extrabold tabular-nums tracking-tight sm:text-7xl" data-testid="spotlight-score">
                  {event.homeScore}
                  <span className="mx-1 text-ink-faint">:</span>
                  {event.awayScore}
                </span>
                <MinuteRing event={event} size={52} />
              </>
            ) : (
              <>
                <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{f.kickoff(event.startTime)}</span>
                <Countdown to={event.startTime} className="font-display text-3xl font-bold text-accent sm:text-5xl" />
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <span data-spot="crest">
              <TeamCrest name={event.awayTeam} size={72} className="sm:size-24" />
            </span>
            <span data-spot="text" className="font-display text-lg font-bold uppercase leading-tight sm:text-2xl">
              {event.awayTeam}
            </span>
          </div>
        </Link>

        {isLive ? (
          <div className="mx-auto mt-5 max-w-xl">
            <ProgressBar event={event} />
            <div className="mt-1.5 flex justify-between text-[10px] font-semibold text-ink-faint">
              <span>0&apos;</span>
              <span>{t('matchPeriod.HALF_TIME')}</span>
              <span>90&apos;</span>
            </div>
          </div>
        ) : null}

        {market ? (
          <div className="mx-auto mt-5 grid max-w-2xl grid-cols-3 gap-2" data-spot="odds">
            {market.selections.map((s) => (
              <OddsButton
                key={s.id}
                event={event}
                market={market}
                selection={s}
                size="lg"
                label={s.outcome === 'HOME' ? event.homeTeam : s.outcome === 'AWAY' ? event.awayTeam : t('outcome.draw')}
                shortLabel={t(`outcomes.${s.outcome}`)}
              />
            ))}
          </div>
        ) : null}

        {list.length > 1 ? (
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              aria-label={t('fx.previous')}
              onClick={() => setIndex((i) => (i - 1 + list.length) % list.length)}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-tint/[0.06] text-ink-muted ring-1 ring-line hover:text-ink"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
              {list.map((e, i) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index}
                  className={cn(
                    'relative flex shrink-0 items-center gap-2 overflow-hidden rounded-full py-1.5 pl-1.5 pr-3 text-xs font-semibold ring-1 transition-colors',
                    i === index ? 'bg-tint/10 text-ink ring-brand/50' : 'bg-tint/[0.04] text-ink-muted ring-line hover:text-ink',
                  )}
                >
                  <span className="flex -space-x-1.5">
                    <TeamCrest name={e.homeTeam} size={20} />
                    <TeamCrest name={e.awayTeam} size={20} />
                  </span>
                  {e.status === 'LIVE' ? `${e.homeScore}:${e.awayScore} · ${clockOf(e)}` : f.time(e.startTime)}
                  {i === index && !paused ? (
                    <span key={`${e.id}-bar`} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand [animation:gb-progress_8s_linear_forwards]" />
                  ) : null}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label={t('fx.next')}
              onClick={() => setIndex((i) => (i + 1) % list.length)}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-tint/[0.06] text-ink-muted ring-1 ring-line hover:text-ink"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
