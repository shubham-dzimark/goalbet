'use client';

import { useLocale } from 'next-intl';
import { formatOdds, formatRon } from '@goalbet/shared';

/** Locale-aware formatters for the admin tables (times in the operator's own time zone). */
export function useFmt() {
  const locale = useLocale() as 'ro' | 'en';
  const intl = locale === 'ro' ? 'ro-RO' : 'en-GB';
  const num = new Intl.NumberFormat(intl);
  return {
    locale,
    ron: (bani: number) => formatRon(bani, locale),
    /** "+12,50 RON" / "−5,00 RON" for ledger movements */
    signedRon: (bani: number) => `${bani > 0 ? '+' : bani < 0 ? '−' : ''}${formatRon(Math.abs(bani), locale)}`,
    /** compact money for charts and KPI cards: "12,4k RON" */
    compactRon: (bani: number) =>
      `${new Intl.NumberFormat(intl, { notation: 'compact', maximumFractionDigits: 1 }).format(bani / 100)} RON`,
    odds: (milli: number) => formatOdds(milli, locale),
    num: (n: number) => num.format(n),
    dateTime: (iso: string) => new Date(iso).toLocaleString(intl, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    date: (iso: string) => new Date(iso).toLocaleDateString(intl, { day: '2-digit', month: 'short', year: 'numeric' }),
    time: (iso: string) => new Date(iso).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' }),
    shortDay: (isoDate: string) => new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(intl, { day: '2-digit', month: 'short' }),
    /** "3 min ago" */
    ago: (iso: string) => {
      const rtf = new Intl.RelativeTimeFormat(intl, { numeric: 'auto' });
      const s = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
      const abs = Math.abs(s);
      if (abs < 60) return rtf.format(s, 'second');
      if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
      if (abs < 86_400) return rtf.format(Math.round(s / 3600), 'hour');
      return rtf.format(Math.round(s / 86_400), 'day');
    },
  };
}

/** RON text field → bani (accepts "12,50" and "12.50"); null when invalid. */
export function parseRon(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const bani = Math.round(Number(s) * 100);
  return bani > 0 ? bani : null;
}

export const banitoRonInput = (bani: number) => (bani / 100).toFixed(2);
