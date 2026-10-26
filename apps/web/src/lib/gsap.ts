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

export { gsap, useGSAP, Flip, ScrollTrigger, SplitText };
