'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, Flip, ScrollTrigger, SplitText);

/** Animations are skipped for players who ask the OS for reduced motion. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fine pointer = mouse/trackpad: hover-only effects (tilt, magnetic) are skipped on touch. */
export const hasFinePointer = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

gsap.defaults({ ease: 'power3.out', duration: 0.5 });

// ScrollTrigger measures positions on load and window resize only. Lists that load or shrink
// afterwards (skeletons → matches) move everything below them, and a stale start point near the
// bottom of the page may never be reached, leaving revealed content invisible. Re-measure
// whenever the page height changes.
if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let height = 0;
  new ResizeObserver(([entry]) => {
    const h = Math.round(entry?.contentRect.height ?? 0);
    if (h === height) return;
    height = h;
    clearTimeout(timer);
    timer = setTimeout(() => ScrollTrigger.refresh(), 150);
  }).observe(document.body);
}

export { gsap, useGSAP, Flip, ScrollTrigger, SplitText };
