import { setRequestLocale } from 'next-intl/server';
import { type EventSummaryDto, type HomeFeedDto } from '@goalbet/shared';
import { HomeView } from '@/components/sport/home-view';
import { serverGet } from '@/lib/server-api';

/** F1.1 — homepage for guests and players. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [initial, upcoming] = await Promise.all([
    serverGet<HomeFeedDto>('/catalog/home'),
    serverGet<EventSummaryDto[]>('/catalog/upcoming?hours=168'),
  ]);
  return <HomeView initial={initial} upcoming={upcoming} />;
}
