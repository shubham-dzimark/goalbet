'use client';

import { Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@goalbet/ui';
import { useTheme } from '@/lib/theme';

/** Light/dark switch; the icon spins out and the new one springs in. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const { theme, sync, setTheme } = useTheme();
  // the icon appears only after reading the real theme, so hydration never animates a swap
  const [ready, setReady] = useState(false);
  useEffect(() => {
    sync();
    setReady(true);
  }, [sync]);
  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={(e) => setTheme(next, { x: e.clientX, y: e.clientY })}
      aria-label={t(next === 'light' ? 'themeLight' : 'themeDark')}
      title={t(next === 'light' ? 'themeLight' : 'themeDark')}
      data-testid="theme-toggle"
      className={cn(
        'grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-tint/[0.05] text-ink-muted ring-1 ring-line transition-colors hover:text-ink',
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {ready ? (
          <motion.span
            key={theme}
            initial={{ y: 14, rotate: -90, opacity: 0 }}
            animate={{ y: 0, rotate: 0, opacity: 1 }}
            exit={{ y: -14, rotate: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="grid place-items-center"
          >
            {theme === 'dark' ? (
              <Moon className="size-4" aria-hidden="true" />
            ) : (
              <Sun className="size-4 text-accent" aria-hidden="true" />
            )}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </button>
  );
}
