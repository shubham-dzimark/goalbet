'use client';

import { gsap, prefersReducedMotion } from './gsap';

/**
 * Animates a glowing chip from the clicked odds button to the visible bet-slip target
 * (desktop dock header or the mobile slip button), then pulses the target.
 */
export function flyToSlip(from: HTMLElement, label: string) {
  if (prefersReducedMotion()) return;
  const target = [...document.querySelectorAll<HTMLElement>('[data-slip-target]')].find((el) => el.offsetParent !== null);
  if (!target) return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();

  const chip = document.createElement('div');
  chip.textContent = label;
  chip.setAttribute('aria-hidden', 'true');
  Object.assign(chip.style, {
    position: 'fixed',
    left: `${a.left + a.width / 2}px`,
    top: `${a.top + a.height / 2}px`,
    zIndex: '9999',
    padding: '6px 10px',
    borderRadius: '999px',
    background: 'var(--color-brand)',
    color: 'var(--color-brand-ink)',
    font: '700 13px var(--font-sans)',
    boxShadow: '0 0 24px rgb(var(--brand-rgb) / 0.8)',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
  });
  document.body.appendChild(chip);

  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  gsap
    .timeline({ onComplete: () => chip.remove() })
    .to(chip, { scale: 1.15, duration: 0.12 })
    .to(chip, { x: dx, duration: 0.6, ease: 'power2.inOut' }, '>')
    .to(chip, { y: dy, duration: 0.6, ease: 'back.in(1.4)' }, '<')
    .to(chip, { scale: 0.3, opacity: 0, duration: 0.18 }, '-=0.12')
    .fromTo(target, { scale: 1 }, { scale: 1.08, duration: 0.15, yoyo: true, repeat: 1 }, '-=0.1');
}
