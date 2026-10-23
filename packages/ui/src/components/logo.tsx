import { brand } from '../brand/brand';
import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  const m = brand.logoMark;
  return (
    <svg viewBox={m.viewBox} className={cn('h-8 w-8 text-brand', className)} aria-hidden="true">
      <path d={m.background} fill="currentColor" />
      <path d={m.glyph} fill="#fff" />
      <circle cx={m.ball.cx} cy={m.ball.cy} r={m.ball.r} fill="#fff" />
    </svg>
  );
}

export function Logo({ className, suffix }: { className?: string; suffix?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-2xl font-bold italic tracking-tight">
        {brand.name}
        {suffix ? <span className="ml-1.5 text-sm font-semibold not-italic opacity-70">{suffix}</span> : null}
      </span>
    </span>
  );
}
