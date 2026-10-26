'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Logo } from '@goalbet/ui';
import { LanguageSwitcher } from '../language-switcher';

export function SiteFooter() {
  const t = useTranslations('footer');
  return (
    <footer className="mt-12 border-t border-line pt-6 text-sm text-ink-muted">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Logo />
          <span className="grid size-9 place-items-center rounded-full border-2 border-danger/70 font-display text-sm font-bold text-ink" aria-label="18+">
            {t('adultsOnly')}
          </span>
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
        </div>
        <div className="space-y-0.5 md:text-right">
          <p className="font-semibold text-ink">{t('responsible')}</p>
          <p>{t('currencyNote')}</p>
          <p className="text-xs text-ink-faint">{t('rights', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
