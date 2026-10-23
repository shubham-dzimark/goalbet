import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Logo } from '@goalbet/ui';
import { LanguageSwitcher } from './language-switcher';

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="mt-10 bg-chrome-strong pb-20 text-chrome-muted md:pb-0">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-8 text-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <span className="text-chrome-ink">
            <Logo />
          </span>
          <span
            className="inline-flex size-9 items-center justify-center rounded-full border-2 border-chrome-muted font-bold text-chrome-ink"
            aria-label="18+"
          >
            {t('adultsOnly')}
          </span>
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
        </div>
        <div className="space-y-1 md:text-right">
          <p className="font-semibold text-chrome-ink">{t('responsible')}</p>
          <p>{t('currencyNote')}</p>
          <p className="text-xs">{t('rights', { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
