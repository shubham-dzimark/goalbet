'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatRon } from '@goalbet/shared';
import { ApiError } from './api';

/** Localised message for any error thrown by the API client (F1.14: clear localised messages). */
export function useErrorMessage() {
  const t = useTranslations();
  const locale = useLocale() as 'ro' | 'en';
  return (err: unknown): string => {
    if (!(err instanceof ApiError)) return t('errors.INTERNAL');
    const d = err.details ?? {};
    const params: Record<string, string> = {};
    for (const k of ['min', 'max']) {
      const v = d[`${k}Bani`];
      if (typeof v === 'number') params[k] = formatRon(v, locale);
    }
    if (typeof d['until'] === 'string') params['until'] = new Date(d['until']).toLocaleDateString(locale);
    return t.has(`errors.${err.code}`) ? t(`errors.${err.code}`, params) : t('errors.INTERNAL');
  };
}

/** Translate a validation key ("validation.email") or pass plain text through. */
export function useFieldError() {
  const t = useTranslations();
  return (key: string | undefined) => (key ? (t.has(key) ? t(key) : key) : undefined);
}
