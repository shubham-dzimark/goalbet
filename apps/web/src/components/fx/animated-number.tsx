'use client';

import { useEffect, useRef } from 'react';
import { gsap, prefersReducedMotion } from '@/lib/gsap';

/** Counts smoothly from the previous value to the new one (balances, potential winnings, scores). */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.8,
  testId,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
  testId?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || current.current === value) {
      current.current = value;
      el.textContent = format(value);
      return;
    }
    const state = { n: current.current };
    const tween = gsap.to(state, {
      n: value,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = format(Math.round(state.n));
      },
      onComplete: () => {
        current.current = value;
      },
    });
    gsap.fromTo(el, { scale: 1.08 }, { scale: 1, duration: 0.4 });
    return () => {
      tween.kill();
      current.current = value;
    };
  }, [value, format, duration]);

  return (
    <span ref={ref} className={className} data-testid={testId}>
      {format(value)}
    </span>
  );
}
