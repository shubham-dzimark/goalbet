'use client';

import { type ReactNode, useRef } from 'react';
import { ScrollTrigger, gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';

/**
 * Scroll-triggered staggered entrance (ScrollTrigger.batch): items fade/slide in as they enter
 * the viewport, in small groups, once. Targets are `[data-reveal]` descendants, else children.
 * `deps` re-runs it, e.g. when a filter swaps the list.
 */
export function Reveal({
  children,
  className,
  deps = [],
  y = 20,
  stagger = 0.05,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  deps?: unknown[];
  y?: number;
  stagger?: number;
  as?: 'div' | 'section' | 'ul';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      const root = ref.current;
      if (!root || prefersReducedMotion()) return;
      const marked = root.querySelectorAll<HTMLElement>('[data-reveal]');
      const targets = marked.length ? [...marked] : ([...root.children] as HTMLElement[]);
      if (targets.length === 0) return;
      gsap.set(targets, { opacity: 0, y });
      ScrollTrigger.batch(targets, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, stagger, duration: 0.7, ease: 'power2.out', overwrite: true, clearProps: 'transform,opacity' }),
      });
    },
    { scope: ref, dependencies: deps, revertOnUpdate: true },
  );
  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}

/** Section heading that fades up gently when it scrolls into view. */
export function RevealHeading({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      gsap.from(ref.current, {
        y: 16,
        opacity: 0,
        duration: 0.7,
        ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 92%', once: true },
      });
    },
    { scope: ref },
  );
  return (
    <h2 ref={ref} id={id} className={className}>
      {children}
    </h2>
  );
}

