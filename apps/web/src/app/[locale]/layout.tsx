import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { AppChrome } from '@/components/app-chrome';
import { Footer } from '@/components/footer';
import { Providers } from '@/components/providers';
import '../globals.css';

const sans = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-brand-sans', display: 'swap' });
const display = Barlow_Condensed({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700', '800'],
  style: ['normal', 'italic'],
  variable: '--font-brand-display',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return { title: { default: t('title'), template: `%s · GoalBet` }, description: t('description') };
}

export const viewport: Viewport = { themeColor: '#0b1f45', width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers>
            <AppChrome>{children}</AppChrome>
            <Footer />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
