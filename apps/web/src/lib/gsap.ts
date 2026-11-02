'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// only what the app uses: every registered plugin ships in the bundle of every page
gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Animations are skipped for players who ask the OS for reduced motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fine pointer = mouse/trackpad: hover-only effects (tilt, magnetic) are skipped on touch. */
export const hasFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

gsap.defaults({ ease: 'power3.out', duration: 0.5 });

/**
 * Runs `fn` once the browser is idle after the first paint (at most `timeout` ms later). GSAP reads
 * an element's current transform when a tween starts; doing that after layout has settled is cheap,
 * while doing it during start-up forces a synchronous reflow. Returns a canceller.
 */
export function whenIdle(fn: () => void, timeout = 400) {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(fn, 1);
  return () => window.clearTimeout(id);
}

/**
 * Runs `fn` once when `el` is about to scroll into view (default: 10% below the viewport). The
 * observer reports after layout, so GSAP's reads inside `fn` never force a reflow. Returns a canceller.
 */
export function onceInView(el: Element, fn: () => void, rootMargin = '0px 0px 10% 0px') {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fn();
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}

/** Finishes a CSS-started entrance: drops the start-state class, then GSAP's inline styles. */
export function settleEntrance(targets: Element[]) {
  targets.forEach((t) => t.classList.remove('gsap-in', 'gsap-rise'));
  gsap.set(targets, { clearProps: 'transform,opacity' });
}

export { gsap, useGSAP, ScrollTrigger };
