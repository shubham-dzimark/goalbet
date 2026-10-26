import { brand } from '../brand/brand';
import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  const m = brand.logoMark;
  return (
    <svg viewBox={m.viewBox} className={cn('h-8 w-8 text-brand drop-shadow-[0_0_12px_rgb(var(--brand-rgb)/0.45)]', className)} aria-hidden="true">
      <path d={m.background} fill="currentColor" />
      <path d={m.glyph} fill="#0a0f05" />
      <circle cx={m.ball.cx} cy={m.ball.cy} r={m.ball.r} fill="#0a0f05" />
    </svg>
  );
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-2xl font-extrabold uppercase italic tracking-tight">
        {brand.wordmark[0]}
        <span className="text-brand">{brand.wordmark[1]}</span>
        {suffix ? <span className="ml-1.5 text-sm font-semibold not-italic text-ink-muted">{suffix}</span> : null}
      </span>
    </span>
  );
}
