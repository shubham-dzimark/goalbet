'use client';

import { flushSync } from 'react-dom';
import { create } from 'zustand';
import { prefersReducedMotion } from './gsap';

export type Theme = 'dark' | 'light';
const KEY = 'gb-theme';

/**
 * Runs in <head> before first paint: saved choice, else the OS preference. Keeps the page from
 * flashing the wrong theme and needs no server knowledge, so pages stay statically rendered.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

const current = (): Theme => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export const useTheme = create<{ theme: Theme; sync: () => void; setTheme: (t: Theme, origin?: { x: number; y: number }) => void }>((set) => ({
  theme: 'dark',
  sync: () => set({ theme: current() }),
  setTheme: (theme, origin) => {
    const apply = () => {
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem(KEY, theme);
      } catch {
        // private mode: the choice just isn't remembered
      }
      flushSync(() => set({ theme }));
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || prefersReducedMotion()) return apply();

    // the new theme grows out of the toggle as a circle (View Transitions API)
    const x = origin?.x ?? window.innerWidth - 40;
    const y = origin?.y ?? 40;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    doc.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    });
  },
}));
