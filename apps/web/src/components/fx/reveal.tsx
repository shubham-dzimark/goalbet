'use client';

import { type ReactNode, useRef } from 'react';
import { gsap, prefersReducedMotion, settleEntrance, useGSAP } from '@/lib/gsap';

/**
 * Calls `onEnter` with the elements that scrolled into view (each once), batched per observer
 * callback. IntersectionObserver lets the browser report visibility, so nothing reads layout from
 * script, positions never go stale when content above loads or shrinks, and it works with
 * `content-visibility: auto` sections.
 */
function observeOnce(targets: Element[], onEnter: (batch: Element[]) => void) {
  const io = new IntersectionObserver(
    (entries) => {
      const batch = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      if (batch.length === 0) return;
      batch.forEach((el) => io.unobserve(el));
      onEnter(batch);
    },
    // a little before the element reaches the bottom of the viewport
    { rootMargin: '0px 0px -8% 0px' },
  );
  targets.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/**
 * Marks targets with the CSS start state (`gsap-in`: transparent, `y` px lower) — a class write,
 * no layout read — and lets GSAP animate them in as they enter the viewport.
 */
function revealOnScroll(targets: HTMLElement[], y: number, animate: (batch: Element[]) => void) {
  targets.forEach((t) => {
    t.style.setProperty('--gsap-y', `${y}px`);
    t.classList.add('gsap-in');
  });
  const stop = observeOnce(targets, animate);
  return () => {
    stop();
    settleEntrance(targets);
  };
}

/**
 * Staggered entrance: items fade/slide in as they enter the viewport, in small groups, once.
 * Targets are `[data-reveal]` descendants, else children. `deps` re-runs it, e.g. when a filter
 * swaps the list.
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
    (_ctx, contextSafe) => {
      const root = ref.current;
      if (!root || prefersReducedMotion() || !contextSafe) return;
      const marked = root.querySelectorAll<HTMLElement>('[data-reveal]');
      const targets = marked.length ? [...marked] : ([...root.children] as HTMLElement[]);
      if (targets.length === 0) return;
      return revealOnScroll(
        targets,
        y,
        contextSafe((batch: Element[]) =>
          gsap.to(batch, { opacity: 1, y: 0, stagger, duration: 0.7, ease: 'power2.out', overwrite: true, onComplete: () => settleEntrance(batch) }),
        ),
      );
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
    (_ctx, contextSafe) => {
      const el = ref.current;
      if (!el || prefersReducedMotion() || !contextSafe) return;
      return revealOnScroll(
        [el],
        16,
        contextSafe((batch: Element[]) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out', onComplete: () => settleEntrance(batch) })),
      );
    },
    { scope: ref },
  );
  return (
    <h2 ref={ref} id={id} className={className}>
      {children}
    </h2>
  );
}
