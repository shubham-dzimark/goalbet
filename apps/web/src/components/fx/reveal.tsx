'use client';

import { type ReactNode, useRef } from 'react';
import { ScrollTrigger, SplitText, gsap, prefersReducedMotion, useGSAP } from '@/lib/gsap';

/**
 * Scroll-triggered staggered entrance (ScrollTrigger.batch): items fade/slide in as they enter
 * the viewport, in small groups, once. Targets are `[data-reveal]` descendants, else children.
 * `deps` re-runs it, e.g. when a filter swaps the list.
 */
export function Reveal({
  children,
  className,
  deps = [],
  y = 28,
  stagger = 0.06,
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
      gsap.set(targets, { opacity: 0, y, scale: 0.98 });
      ScrollTrigger.batch(targets, {
        start: 'top 92%',
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, { opacity: 1, y: 0, scale: 1, stagger, duration: 0.7, ease: 'power3.out', overwrite: true, clearProps: 'transform,opacity' }),
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

/** Section heading whose characters rise in (SplitText) when it scrolls into view. */
export function RevealHeading({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (!ref.current || prefersReducedMotion()) return;
      const text = ref.current.querySelector<HTMLElement>('[data-split]') ?? ref.current;
      const split = new SplitText(text, { type: 'chars', charsClass: 'inline-block will-change-transform' });
      gsap.from(split.chars, {
        yPercent: 110,
        opacity: 0,
        stagger: 0.025,
        duration: 0.6,
        ease: 'power4.out',
        scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true },
      });
      return () => split.revert();
    },
    { scope: ref },
  );
  return (
    <h2 ref={ref} id={id} className={className}>
      {children}
    </h2>
  );
}

