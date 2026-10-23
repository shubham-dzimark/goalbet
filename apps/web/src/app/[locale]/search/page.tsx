import { setRequestLocale } from 'next-intl/server';
import { type CompetitionDto, type EventSummaryDto } from '@goalbet/shared';
import { SearchView } from '@/components/sport/search-view';
import { serverGet } from '@/lib/server-api';

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const q = ((await searchParams).q ?? '').slice(0, 60);
  const result =
    q.trim().length >= 2
      ? await serverGet<{ competitions: CompetitionDto[]; events: EventSummaryDto[] }>(`/catalog/search?q=${encodeURIComponent(q)}`)
      : null;
  return <SearchView q={q} result={result} />;
}
