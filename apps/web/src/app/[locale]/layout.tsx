import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { AppShell } from '@/components/shell/app-shell';
import { Providers } from '@/components/providers';
import { themeScript } from '@/lib/theme';
import { requestTimeZone } from '@/lib/time-zone-server';
import '../globals.css';

// Self-hosted at build time, preloaded, with a size-matched fallback so text does not shift when it
// loads; the shared tokens read --font-inter (latin-ext covers Romanian ă, ș, ț)
const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: { default: t('title'), template: `%s · GoalBet` }, description: t('description') };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#08111f' },
    { media: '(prefers-color-scheme: light)', color: '#f2f5f9' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  // render times in the visitor's zone so nothing jumps (or changes day) after hydration
  const timeZone = await requestTimeZone();

  return (
    // data-theme is set before paint by themeScript (saved choice or OS preference)
    <html lang={locale} data-theme="dark" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* without JavaScript the GSAP entrance start states would never be animated in */}
        <noscript>
          <style>{'.gsap-in,.gsap-rise{opacity:1;transform:none}'}</style>
        </noscript>
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers timeZone={timeZone}>
            <AppShell>{children}</AppShell>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
