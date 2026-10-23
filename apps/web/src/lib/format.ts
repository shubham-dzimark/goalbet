'use client';

import { useLocale, useTranslations } from 'next-intl';
import { type EventSummaryDto, formatOdds, formatRon } from '@goalbet/shared';

const TZ = 'Europe/Bucharest';

function dayKey(d: Date) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ });
}

/** Locale-aware formatting helpers (RON, odds, kick-off times in Romanian time). */
export function useFormat() {
  const locale = useLocale() as 'ro' | 'en';
  const t = useTranslations('sport');
  const intl = locale === 'ro' ? 'ro-RO' : 'en-GB';

  const time = (iso: string) => new Date(iso).toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit', timeZone: TZ });

  const day = (iso: string) => {
    const d = new Date(iso);
    const today = dayKey(new Date());
    const tomorrow = dayKey(new Date(Date.now() + 86_400_000));
    if (dayKey(d) === today) return t('today');
    if (dayKey(d) === tomorrow) return t('tomorrow');
    return d.toLocaleDateString(intl, { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
  };

  return {
    locale,
    ron: (bani: number) => formatRon(bani, locale),
    odds: (milli: number) => formatOdds(milli, locale),
    time,
    day,
    dayKey: (iso: string) => dayKey(new Date(iso)),
    kickoff: (iso: string) => `${day(iso)} ${time(iso)}`,
    dateTime: (iso: string) =>
      new Date(iso).toLocaleString(intl, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ }),
    date: (iso: string) => new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }),
  };
}

/** "67'" / "HT" / "45+2'" for live matches. */
export function useMatchClock() {
  const t = useTranslations('matchPeriod');
  return (e: Pick<EventSummaryDto, 'status' | 'period' | 'minute'>) => {
    if (e.status !== 'LIVE') return null;
    if (e.period === 'HALF_TIME') return t('HALF_TIME');
    if (e.minute === null) return '';
    if (e.period === 'FIRST_HALF' && e.minute > 45) return `45+${e.minute - 45}'`;
    if (e.period === 'SECOND_HALF' && e.minute > 90) return `90+${e.minute - 90}'`;
    return `${e.minute}'`;
  };
}
