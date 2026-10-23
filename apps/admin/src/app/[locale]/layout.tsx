import type { Metadata } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { Providers } from '@/components/providers';
import '../globals.css';

const sans = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-brand-sans', display: 'swap' });
const display = Barlow_Condensed({
  subsets: ['latin', 'latin-ext'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-brand-display',
  display: 'swap',
});

export const metadata: Metadata = { title: 'GoalBet Admin', robots: { index: false, follow: false } };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
