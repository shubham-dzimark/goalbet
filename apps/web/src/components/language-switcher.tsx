'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@goalbet/ui';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';

/** F0.3 — RO/EN switch; remembered in a cookie for guests and on the profile for players. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  const authed = useAuth((s) => s.status === 'authed');

  const change = (next: 'ro' | 'en') => {
    if (next === locale) return;
    start(() => {
      const query = Object.fromEntries(search.entries());
      router.replace({ pathname, query }, { locale: next });
    });
    if (authed) {
      void api<{ locale: string }>('/me', { method: 'PATCH', body: { locale: next } })
        .then((u) => useAuth.getState().user && useAuth.getState().setUser({ ...useAuth.getState().user!, locale: u.locale }))
        .catch(() => undefined);
    }
  };

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn('inline-flex rounded-md bg-chrome-strong p-0.5 text-xs font-bold', pending && 'opacity-70', className)}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          aria-pressed={l === locale}
          aria-label={t('language.switchTo', { language: t(`common.${l}`) })}
          data-testid={`lang-${l}`}
          className={cn(
            'rounded px-2 py-1 uppercase transition-colors',
            l === locale ? 'bg-brand text-brand-ink' : 'text-chrome-muted hover:text-chrome-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
