import { setRequestLocale } from 'next-intl/server';
import { type HomeFeedDto } from '@goalbet/shared';
import { HomeView } from '@/components/sport/home-view';
import { serverGet } from '@/lib/server-api';

/** F1.1 — homepage for guests and players. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const initial = await serverGet<HomeFeedDto>('/catalog/home');
  return <HomeView initial={initial} />;
}
