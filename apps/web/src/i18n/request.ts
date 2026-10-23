import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

/** App messages merged with the shared ones (errors, markets, statuses) from packages/shared/i18n. */
export async function loadMessages(locale: string) {
  const [app, shared] = await Promise.all([
    import(`../../messages/${locale}.json`).then((m) => m.default),
    import(`@goalbet/shared/i18n/${locale}.json`).then((m) => m.default),
  ]);
  return { ...shared, ...app };
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale), timeZone: 'Europe/Bucharest' };
});
