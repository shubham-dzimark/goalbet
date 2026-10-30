import 'server-only';
import { cookies, headers } from 'next/headers';
import { DEFAULT_TIME_ZONE, TIME_ZONE_COOKIE } from './time-zone-defaults';

function valid(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The visitor's time zone for server rendering, so kick-off times and Today/Tomorrow match what
 * the browser shows: the zone the browser reported earlier (cookie), else Vercel's IP-based guess.
 */
export async function requestTimeZone(): Promise<string> {
  const fromCookie = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  if (fromCookie && valid(decodeURIComponent(fromCookie))) return decodeURIComponent(fromCookie);
  const fromIp = (await headers()).get('x-vercel-ip-timezone');
  return valid(fromIp) ? fromIp : DEFAULT_TIME_ZONE;
}
