import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { type CompetitionDto, type EventSummaryDto } from '@goalbet/shared';
import { CompetitionView } from '@/components/sport/competition-view';
import { serverGet } from '@/lib/server-api';

export default async function CompetitionPage({ params }: { params: Promise<{ locale: string; competitionId: string }> }) {
  const { locale, competitionId } = await params;
  setRequestLocale(locale);
  const initial = await serverGet<{ competition: CompetitionDto; events: EventSummaryDto[] }>(`/catalog/competitions/${competitionId}`);
  if (!initial) notFound();
  return <CompetitionView id={competitionId} initial={initial} />;
}
