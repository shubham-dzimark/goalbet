'use client';

import { ArrowRight, CalendarDays } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { AnimatedNumber } from '@/components/fx/animated-number';
import { BallStage } from '@/components/three/ball-stage';
import { Link } from '@/i18n/navigation';
import { SplitText, gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';
import { useMagnetic } from '@/lib/use-interactions';

const MotionLink = motion.create(Link);
const plain = (n: number) => String(n);

/** Faint pitch markings behind the hero copy. */
function PitchLines() {
  return (
    <svg viewBox="0 0 800 400" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g fill="none" stroke="#f2f6fb" strokeWidth="2">
        <rect x="20" y="20" width="760" height="360" rx="4" />
        <line x1="400" y1="20" x2="400" y2="380" />
        <circle cx="400" cy="200" r="62" />
        <rect x="20" y="110" width="110" height="180" />
        <rect x="670" y="110" width="110" height="180" />
        <rect x="20" y="160" width="40" height="80" />
        <rect x="740" y="160" width="40" height="80" />
      </g>
    </svg>
  );
}

/**
 * Home hero: SplitText headline, magnetic CTAs, live stats and the 3D match ball. Scrolling past it
 * scrubs a parallax exit and feeds the ball's spin through `scroll` (no pinning, no scroll hijack).
 */
export function StadiumHero({ live, today, competitions, boosted }: { live: number; today: number; competitions: number; boosted: number }) {
  const t = useTranslations('hero');
  const root = useRef<HTMLElement>(null);
  const scroll = useRef(0);
  const primary = useRef<HTMLAnchorElement>(null);
  useMagnetic(primary, 0.3);

  useGSAP(
    () => {
      const el = root.current;
      if (!el || prefersReducedMotion()) return;
      // Line 1 rises per character. The gradient line rises as one masked block instead: Chrome
      // stops painting background-clip:text once its characters are separate composited boxes.
      const split = new SplitText('[data-split-line]', { type: 'chars', charsClass: 'inline-block will-change-transform' });
      gsap
        .timeline({ defaults: { ease: 'power4.out' }, onComplete: () => split.revert() })
        .from('[data-hero-kicker]', { y: 16, opacity: 0, duration: 0.5 })
        .from(split.chars, { yPercent: 115, rotate: 6, opacity: 0, stagger: 0.03, duration: 0.8 }, '-=0.2')
        .from('[data-glow-line]', { yPercent: 115, skewX: -8, duration: 0.9 }, '-=0.55')
        .from('[data-hero-fade]', { y: 20, opacity: 0, stagger: 0.08, duration: 0.6 }, '-=0.45')
        .from('[data-beam]', { opacity: 0, scaleY: 0.4, transformOrigin: 'top center', stagger: 0.12, duration: 1.2, ease: 'power2.out' }, 0);

      // scrubbed parallax exit; progress also drives the 3D ball
      gsap.to('[data-hero-copy]', {
        yPercent: -18,
        opacity: 0.15,
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top top', end: 'bottom top', scrub: true },
      });
      gsap.to('[data-hero-ball]', {
        yPercent: 6,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          onUpdate: (self) => {
            scroll.current = self.progress;
          },
        },
      });
      return () => split.revert();
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
    <section ref={root} data-theme="dark" className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-[linear-gradient(160deg,#0c1a2e_0%,#08111f_55%,#071a14_100%)]" aria-labelledby="hero-title">
      <PitchLines />
      {/* floodlight beams */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <span data-beam className="absolute -top-24 left-[12%] h-[130%] w-40 -rotate-[18deg] bg-[linear-gradient(180deg,rgb(var(--brand-rgb)/0.22),transparent_70%)] blur-2xl" />
        <span data-beam className="absolute -top-24 right-[18%] h-[130%] w-48 rotate-[16deg] bg-[linear-gradient(180deg,rgb(var(--gold-rgb)/0.14),transparent_70%)] blur-2xl" />
      </div>

      <div className="relative grid items-center gap-2 p-6 sm:p-9 lg:grid-cols-[1.15fr_1fr] lg:gap-0 lg:p-10">
        <div data-hero-copy className="relative z-10">
          <p data-hero-kicker className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-tint/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink-muted">
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-75" />
              <span className="relative size-2 rounded-full bg-live" />
            </span>
            {t('kicker', { count: live })}
          </p>

          <h1 id="hero-title" data-hero-title className="mt-5 font-display text-5xl font-bold uppercase italic leading-[0.92] tracking-tight sm:text-6xl 2xl:text-7xl">
            <span data-split-line className="block overflow-hidden pb-1">
              {t('line1')}
            </span>
            <span className="block overflow-hidden pb-1">
              <span data-glow-line className="text-glow inline-block pr-2">
                {t('line2')}
              </span>
            </span>
          </h1>

          <p data-hero-fade className="mt-4 max-w-md text-base text-ink-muted sm:text-lg">
            {t('subtitle')}
          </p>

          <div data-hero-fade className="mt-7 flex flex-wrap gap-3">
            <MotionLink
              ref={primary}
              href="/live"
              whileTap={{ scale: 0.95 }}
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-strong))] px-6 font-bold text-brand-ink shadow-[0_10px_40px_-8px_rgb(var(--brand-rgb)/0.7)]"
              data-testid="hero-live"
            >
              {t('ctaLive')}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </MotionLink>
            <motion.a
              href="#board"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-tint/[0.04] px-6 font-semibold text-ink backdrop-blur hover:border-brand/50"
            >
              <CalendarDays className="size-4 text-accent" aria-hidden="true" />
              {t('ctaToday')}
            </motion.a>
          </div>

          <dl data-hero-fade className="mt-9 grid max-w-lg grid-cols-4 gap-2 sm:gap-4">
            {stats.map((s) => (
              <div key={s.label} className="border-l border-line-strong pl-3">
                <dd className={s.live ? 'font-display text-2xl font-bold tabular-nums text-live sm:text-3xl' : 'font-display text-2xl font-bold tabular-nums sm:text-3xl'}>
                  <AnimatedNumber value={s.value} format={plain} duration={1.4} />
                </dd>
                <dt className="text-[11px] uppercase leading-tight tracking-wider text-ink-faint">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        {/* below lg the ball is a small decorative badge in the corner; on desktop it gets its own column */}
        <div data-hero-ball className="pointer-events-none absolute -right-6 top-3 size-36 opacity-90 sm:-right-2 sm:top-6 sm:size-48 lg:pointer-events-auto lg:relative lg:right-auto lg:top-auto lg:size-auto lg:h-[26rem] lg:opacity-100">
          <BallStage scroll={scroll} className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}
