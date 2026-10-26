'use client';

import { useEffect } from 'react';
import { create } from 'zustand';

/** Server render and first client render use Romanian time so the markup hydrates identically. */
export const DEFAULT_TIME_ZONE = 'Europe/Bucharest';

export const useTimeZone = create<{ tz: string; setTz: (tz: string) => void }>((set) => ({
  tz: DEFAULT_TIME_ZONE,
  setTz: (tz) => set({ tz }),
}));

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// some browsers still report the legacy IANA names
const LEGACY: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
};

/** Switches every formatted time to the player's own time zone right after mount. */
export function useSyncTimeZone() {
  const setTz = useTimeZone((s) => s.setTz);
  useEffect(() => {
    const reported = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!reported) return;
    const modern = LEGACY[reported];
    setTz(modern && isValidTimeZone(modern) ? modern : isValidTimeZone(reported) ? reported : DEFAULT_TIME_ZONE);
  }, [setTz]);
}

function zoneName(tz: string, date: Date, locale: string, style: 'short' | 'shortOffset') {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, timeZoneName: style }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/** "+05:30" style offset from UTC at the given instant (accounts for DST). */
export function utcOffset(tz: string, date = new Date()) {
  const raw = zoneName(tz, date, 'en-US', 'shortOffset').replace('GMT', '');
  if (!raw) return 'UTC';
  const [h, m = '00'] = raw.split(':');
  return `UTC${h!.slice(0, 1)}${h!.slice(1).padStart(2, '0')}:${m}`;
}

/**
 * Short zone label at the given instant: a common abbreviation where one exists (IST, EET, EEST,
 * GMT, EDT, GST…), otherwise the UTC offset. Abbreviations depend on the formatting locale, so a
 * few English locales are tried in turn.
 */
export function zoneLabel(tz: string, date = new Date()) {
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  for (const locale of ['en-US', 'en-GB', 'en-IN']) {
    const name = zoneName(tz, date, locale, 'short');
    if (name && !/^(GMT|UTC)[+-]/.test(name)) return name;
  }
  return utcOffset(tz, date).replace(':00', '');
}
