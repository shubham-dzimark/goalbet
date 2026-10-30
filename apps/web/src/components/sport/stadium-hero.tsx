'use client';

import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { type EventSummaryDto } from '@goalbet/shared';
import { cn } from '@goalbet/ui';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { Link } from '@/i18n/navigation';
import { gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';
import { HeroMatchStack } from './hero-match-stack';

const MotionLink = motion.create(Link);
const plain = (n: number) => String(n);

/**
 * Home hero, Apple-style: one clear statement, one primary action, the numbers that matter, and
 * (on desktop) a stack of the next matches you can bet on straight away. Content fades up gently;
 * scrolling past eases the copy out (no pinning, no scroll hijack).
 */
export function StadiumHero({
  live,
  today,
  competitions,
  boosted,
  matches,
}: {
  live: number;
  today: number;
  competitions: number;
  boosted: number;
  matches: EventSummaryDto[];
}) {
  const t = useTranslations('hero');
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current;
      if (!el || prefersReducedMotion()) return;
      gsap.from('[data-hero-in]', { y: 20, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power2.out' });
      gsap.from('[data-hero-visual]', { y: 24, opacity: 0, duration: 1, delay: 0.25, ease: 'power2.out' });

      // the copy eases out as the hero scrolls away
      gsap.to('[data-hero-copy]', {
        yPercent: -10,
        opacity: 0.3,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
    },
    { scope: root },
  );

  const stats = [
    { label: t('statLive'), value: live, live: true },
    { label: t('statToday'), value: today },
    { label: t('statCompetitions'), value: competitions },
    { label: t('statBoosted'), value: boosted },
  ];

  return (
    <section
      ref={root}
      data-theme="dark"
      className="relative isolate overflow-hidden rounded-[1.75rem] border border-line bg-[radial-gradient(70rem_40rem_at_0%_0%,rgb(var(--brand-rgb)/0.10),transparent_55%),linear-gradient(180deg,var(--color-card-solid),var(--color-surface))]"
      aria-labelledby="hero-title"
    >
      <div className="relative grid items-center gap-12 px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-8 lg:py-20">
        <div data-hero-copy className="relative z-10">
          <p data-hero-in className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-60" />
              <span className="relative size-2 rounded-full bg-live" />
            </span>
            {t('kicker', { count: live })}
          </p>

          <h1 id="hero-title" data-hero-in className="mt-4 font-display text-5xl font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl 2xl:text-7xl">
            {t('line1')}
            <br />
            <span className="text-glow">{t('line2')}</span>
          </h1>

          <p data-hero-in className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-muted">
            {t('subtitle')}
          </p>

          <div data-hero-in className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <MotionLink
              href="/live"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-7 text-[15px] font-semibold text-brand-ink transition-[filter] hover:brightness-110"
              data-testid="hero-live"
            >
              {t('ctaLive')}
            </MotionLink>
            <a href="#board" className="group inline-flex h-12 items-center gap-1 text-[15px] font-medium text-brand">
              {t('ctaToday')}
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
          </div>

          <dl data-hero-in className="mt-12 grid max-w-lg grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label}>
                <dd className={cn('font-display text-[28px] font-semibold leading-none tracking-tight tabular-nums', s.live && s.value > 0 && 'text-live')}>
                  <AnimatedNumber value={s.value} format={plain} duration={1.2} />
                </dd>
                <dt className="mt-1.5 text-[13px] leading-snug text-ink-muted">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* desktop only: below lg the live spotlight right under the hero shows the same matches */}
        {matches.length > 0 ? (
          <div data-hero-visual className="relative hidden h-[26rem] lg:block">
            <HeroMatchStack events={matches} className="h-full w-full" />
          </div>
        ) : null}
      </div>
    </section>
  );
}
