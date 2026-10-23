import { setRequestLocale } from 'next-intl/server';
import { type CountryGroupDto, type EventSummaryDto } from '@goalbet/shared';
import { SportView } from '@/components/sport/competition-view';
import { serverGet } from '@/lib/server-api';

export default async function SportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [countries, upcoming] = await Promise.all([
    serverGet<CountryGroupDto[]>('/catalog/countries'),
    serverGet<EventSummaryDto[]>('/catalog/upcoming?hours=24'),
  ]);
  return <SportView countries={countries} upcoming={upcoming} />;
}
