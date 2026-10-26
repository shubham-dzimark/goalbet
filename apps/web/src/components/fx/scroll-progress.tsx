'use client';

import { motion, useScroll, useSpring } from 'motion/react';

/** Thin emerald→gold page progress bar along the top edge. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, restDelta: 0.001 });
  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-[linear-gradient(90deg,var(--color-brand),#7ef0c0,var(--color-accent))] shadow-[0_0_12px_rgb(var(--brand-rgb)/0.7)]"
    />
  );
}
