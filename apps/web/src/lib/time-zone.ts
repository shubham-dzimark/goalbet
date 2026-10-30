'use client';

import { createContext, useContext, useEffect } from 'react';
import { create } from 'zustand';
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from './time-zone-defaults';

/** Zone the server rendered with (cookie, else the visitor's IP zone); the first client render matches it. */
export const TimeZoneContext = createContext(DEFAULT_TIME_ZONE);

/** Set only when the browser's zone differs from the one the page was rendered in (e.g. a VPN). */
const useBrowserTimeZone = create<{ tz: string | null; setTz: (tz: string) => void }>((set) => ({
  tz: null,
  setTz: (tz) => set({ tz }),
}));

export function useTimeZone() {
  const rendered = useContext(TimeZoneContext);
  return useBrowserTimeZone((s) => s.tz) ?? rendered;
}

export function isValidTimeZone(tz: string) {
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

/**
 * Remembers the browser's zone in a cookie for the next server render, and only switches the
 * current page when it differs from the zone the server guessed (no visible change otherwise).
 */
export function useSyncTimeZone() {
  const rendered = useContext(TimeZoneContext);
  const setTz = useBrowserTimeZone((s) => s.setTz);
  useEffect(() => {
    const reported = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!reported) return;
    const modern = LEGACY[reported];
    const tz = modern && isValidTimeZone(modern) ? modern : isValidTimeZone(reported) ? reported : DEFAULT_TIME_ZONE;
    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    if (tz !== rendered) setTz(tz);
  }, [rendered, setTz]);
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
