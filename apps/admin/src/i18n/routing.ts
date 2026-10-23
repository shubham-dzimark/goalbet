import { defineRouting } from 'next-intl/routing';

/** F0.3 — Romanian (default) and English; the choice is remembered in the NEXT_LOCALE cookie. */
export const routing = defineRouting({
  locales: ['ro', 'en'],
  defaultLocale: 'ro',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];
