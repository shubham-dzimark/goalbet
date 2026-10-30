'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { type EventSummaryDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { Flag } from '@/components/fx/flag';
import { TeamCrest } from '@/components/fx/team-crest';
import { Link } from '@/i18n/navigation';
import { useTilt } from '@/lib/use-interactions';
import { KickoffTag } from './match-card';
import { OddsButton } from './odds-button';

const ROTATE_MS = 6_000;

// Wallet-style deck: the cards behind are solid and only peek out as edges above the front card
const SLOTS = [
  { y: 0, scale: 1, opacity: 1 },
  { y: -14, scale: 0.94, opacity: 0.55 },
  { y: -27, scale: 0.88, opacity: 0.25 },
];

function TeamSide({ name, logo, score, live }: { name: string; logo: string | null; score: number; live: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <TeamCrest name={name} logo={logo} size={56} />
      <span className="line-clamp-2 text-sm font-bold leading-tight">{name}</span>
      {live ? <span className="font-display tracking-tight text-3xl font-semibold tabular-nums">{score}</span> : null}
    </div>
  );
}

function MatchCardFace({ event, interactive }: { event: EventSummaryDto; interactive: boolean }) {
  const t = useTranslations();
  const market = event.mainMarket;
  const live = event.status === 'LIVE';
  return (
    <div
      className={cn(
        // solid surface: nothing behind may show through the front card
        'flex h-full flex-col gap-4 rounded-3xl border bg-card-solid p-5 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.85)]',
        live ? 'border-live/30' : 'border-line-strong',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-ink-muted">
          <Flag code={event.competition.countryCode} />
          <span className="truncate">{event.competition.name}</span>
        </span>
        <KickoffTag event={event} />
      </div>

      <Link href={`/match/${event.id}`} tabIndex={interactive ? 0 : -1} className="flex flex-1 items-center gap-3">
        <TeamSide name={event.homeTeam} logo={event.homeLogo} score={event.homeScore} live={live} />
        <span className="text-[13px] font-medium text-ink-faint">{live ? ':' : 'vs'}</span>
        <TeamSide name={event.awayTeam} logo={event.awayLogo} score={event.awayScore} live={live} />
      </Link>

      {market ? (
        <div className={cn('grid grid-cols-3 gap-2', !interactive && 'pointer-events-none')}>
          {market.selections.map((s) => (
            <OddsButton key={s.id} event={event} market={market} selection={s} label={t(`outcomes.${s.outcome}`)} className="h-11 px-2.5" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hero visual: a fanned stack of the next matches (live first) with their real club badges, live
 * minute or kick-off countdown and 1X2 prices you can add to the slip straight from the hero. The
 * front card cycles every few seconds (paused while hovered), the stack tilts with the pointer.
 */
export function HeroMatchStack({ events, className }: { events: EventSummaryDto[]; className?: string }) {
  const t = useTranslations('hero');
  const reduce = useReducedMotion();
  const stack = useRef<HTMLDivElement>(null);
  useTilt(stack, { max: 7, lift: 0 });
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = events.length;

  useEffect(() => {
    if (paused || n < 2 || reduce) return;
    const id = setInterval(() => setFront((i) => (i + 1) % n), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, n, reduce]);

  if (n === 0) return null;
  const go = (step: number) => setFront((i) => (i + step + n) % n);

  return (
    <div className={cn('relative flex flex-col items-center justify-center', className)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* floodlight behind the stack */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgb(var(--brand-rgb)/0.22),transparent)] blur-2xl" />

      <div ref={stack} className="relative h-[16.5rem] w-full max-w-sm" aria-roledescription="carousel" aria-label={t('stackLabel')}>
        {events.map((e, i) => {
          const slot = (i - front + n) % n;
          const s = SLOTS[Math.min(slot, SLOTS.length - 1)]!;
          const hidden = slot >= SLOTS.length;
          return (
            <motion.div
              key={e.id}
              className="absolute inset-0 origin-top"
              style={{ zIndex: n - slot }}
              initial={reduce ? false : { opacity: 0, y: 40, scale: 0.9 }}
              animate={{ y: s.y, scale: s.scale, opacity: hidden ? 0 : s.opacity }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 24, delay: slot * 0.04 }}
              aria-hidden={slot !== 0}
            >
              <MatchCardFace event={e} interactive={slot === 0} />
            </motion.div>
          );
        })}
      </div>

      {n > 1 ? (
        <div className="relative mt-5 flex items-center gap-3">
          <button type="button" onClick={() => go(-1)} aria-label={t('prevMatch')} className="grid size-11 place-items-center rounded-full border border-line-strong text-ink-muted transition-colors hover:border-line-strong hover:bg-tint/[0.06] hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <div className="flex gap-1.5">
            {events.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setFront(i)}
                aria-label={`${e.homeTeam} – ${e.awayTeam}`}
                aria-current={i === front}
                className="relative h-1.5 w-6 overflow-hidden rounded-full bg-tint/15"
              >
                {i === front ? (
                  <motion.span
                    key={`${front}-${paused}`}
                    className="absolute inset-y-0 left-0 rounded-full bg-brand"
                    initial={{ width: paused || reduce ? '100%' : '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: paused || reduce ? 0 : ROTATE_MS / 1000, ease: 'linear' }}
                  />
                ) : null}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(1)} aria-label={t('nextMatch')} className="grid size-11 place-items-center rounded-full border border-line-strong text-ink-muted transition-colors hover:border-line-strong hover:bg-tint/[0.06] hover:text-ink">
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
