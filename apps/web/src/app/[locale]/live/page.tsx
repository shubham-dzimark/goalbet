import { setRequestLocale } from 'next-intl/server';
import { type EventSummaryDto } from '@goalbet/shared';
import { LiveView } from '@/components/sport/live-view';
import { serverGet } from '@/lib/server-api';

export default async function LivePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LiveView initial={await serverGet<EventSummaryDto[]>('/catalog/live')} />;
}
