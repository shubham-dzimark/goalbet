'use client';

import { Radio, ShieldCheck, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useRef } from 'react';
import { BallStage } from '@/components/three/ball-stage';
import { gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';

/** Split auth layout: animated "stadium" panel + form card. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const t = useTranslations('authHero');
  const scope = useRef<HTMLDivElement>(null);
  const still = useRef(0);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.to('[data-beam]', { opacity: 0.35, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: 0.7 });
      gsap.fromTo('[data-auth-in]', { y: 24, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.6 });
    },
    { scope },
  );

  return (
    <div ref={scope} className="grid gap-4 py-2 lg:min-h-[calc(100dvh-8rem)] lg:grid-cols-2">
      <aside data-theme="dark" className="relative hidden overflow-hidden rounded-[28px] border border-line-strong bg-chrome-strong p-10 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="absolute inset-0">
          <div data-beam className="absolute -left-20 -top-20 h-[140%] w-40 rotate-[20deg] bg-gradient-to-b from-brand/30 to-transparent opacity-15 blur-2xl" />
          <div data-beam className="absolute -right-20 -top-20 h-[140%] w-40 -rotate-[20deg] bg-gradient-to-b from-accent/30 to-transparent opacity-15 blur-2xl" />
          {/* pitch markings */}
          <svg viewBox="0 0 400 300" className="absolute inset-x-0 bottom-0 w-full opacity-[0.12]" fill="none" stroke="white" strokeWidth="1.5">
            <rect x="20" y="20" width="360" height="260" rx="4" />
            <line x1="200" y1="20" x2="200" y2="280" />
            <circle cx="200" cy="150" r="40" />
            <rect x="20" y="95" width="50" height="110" />
            <rect x="330" y="95" width="50" height="110" />
          </svg>
        </div>
        <div className="relative" data-auth-in>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand">{t('kicker')}</p>
          <h2 className="mt-3 font-display tracking-tight text-6xl font-semibold leading-[0.9]">
            {t('line1')}
            <br />
            <span className="text-glow">{t('line2')}</span>
          </h2>
        </div>
        <BallStage scroll={still} className="-mx-10 h-72" />
        <ul className="relative space-y-3 text-sm" data-auth-in>
          {[
            { icon: Radio, text: t('point1') },
            { icon: Zap, text: t('point2') },
            { icon: ShieldCheck, text: t('point3') },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-ink-muted">
              <span className="grid size-9 place-items-center rounded-xl bg-tint/[0.06] text-brand ring-1 ring-line">
                <Icon className="size-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>
      <div className="flex items-center justify-center">
        <div className="glass w-full max-w-md rounded-[28px] p-6 sm:p-8" data-auth-in>
          <h1 className="font-display tracking-tight text-4xl font-semibold leading-none">{title}</h1>
          {subtitle ? <p className="mb-6 mt-2 text-sm text-ink-muted">{subtitle}</p> : <div className="mb-6" />}
          {children}
          {footer ? <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
