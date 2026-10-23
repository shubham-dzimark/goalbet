'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@goalbet/ui';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { adminApi, useSession } from '@/lib/session';

/** F0.3 — RO/EN in the admin app, remembered on the admin's profile. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const authed = useSession((s) => s.status === 'authed');

  const change = (next: 'ro' | 'en') => {
    if (next === locale) return;
    router.replace(pathname, { locale: next });
    if (authed) void adminApi('/admin/auth/me', { method: 'PATCH', body: { locale: next } }).catch(() => undefined);
  };

  return (
    <div role="group" aria-label={t('language')} className={cn('inline-flex rounded-md bg-chrome-strong p-0.5 text-xs font-bold', className)}>
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          aria-pressed={l === locale}
          data-testid={`lang-${l}`}
          className={cn('rounded px-2 py-1 uppercase', l === locale ? 'bg-brand text-brand-ink' : 'text-chrome-muted hover:text-chrome-ink')}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
