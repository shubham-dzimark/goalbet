import { setRequestLocale } from 'next-intl/server';
import { type EventDetailDto } from '@goalbet/shared';
import { MatchView } from '@/components/sport/match-view';
import { serverGet } from '@/lib/server-api';

export default async function MatchPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <MatchView id={id} initial={await serverGet<EventDetailDto>(`/catalog/events/${id}`)} />;
}
