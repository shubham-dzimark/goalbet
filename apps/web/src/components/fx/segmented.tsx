'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@goalbet/ui';
import { gsap, prefersReducedMotion } from '@/lib/gsap';

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
  testId?: string;
}

/** Pill tabs with a GSAP-driven sliding highlight. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = wrap.current;
    if (!root || !pill.current) return;
    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
      if (!active || !pill.current) return;
      const vars = { x: active.offsetLeft, width: active.offsetWidth, opacity: 1 };
      // first placement and resizes (e.g. web fonts loading) snap; value changes glide
      if (!animate || prefersReducedMotion()) gsap.set(pill.current, vars);
      else gsap.to(pill.current, { ...vars, duration: 0.45, ease: 'expo.out' });
    };
    place(placed.current);
    placed.current = true;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(root);
    root.querySelectorAll('button').forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={wrap}
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-scrollbar relative flex max-w-full gap-1 overflow-x-auto rounded-full bg-tint/[0.05] p-1 ring-1 ring-line', className)}
    >
      <span
        ref={pill}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 left-0 top-1 rounded-full bg-brand opacity-0 shadow-[0_6px_20px_-6px_rgb(var(--brand-rgb)/0.7)]"
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={o.value}
            data-testid={o.testId}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-10 flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition-colors duration-300',
              size === 'sm' ? 'px-3 py-1 text-xs' : 'px-4 py-1.5 text-sm',
              active ? 'text-brand-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.badge !== undefined ? (
              <span className={cn('rounded-full px-1.5 text-[10px] font-bold', active ? 'bg-black/15' : 'bg-tint/10')}>{o.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
