'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';

/**
 * Cross-fades tab content: the old panel slides out before the new one slides in
 * (AnimatePresence mode="wait"), keyed by the active tab.
 */
export function TabPanel({
  tab,
  children,
  className,
}: {
  tab: string;
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        role="tabpanel"
        className={className}
        initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(4px)' }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
