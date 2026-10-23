import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Card, CardHeader, CardTitle, Skeleton } from '@goalbet/ui';

/** Phase 1 shell of the F1.1 homepage: sidebar · feed · bet slip. Content arrives in phase 2. */
export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations('home');
  return (
    <div className="grid gap-4 px-4 py-4 md:grid-cols-[240px_1fr] xl:grid-cols-[260px_1fr_340px]">
      <aside className="hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('competitions')}</CardTitle>
          </CardHeader>
          <div className="space-y-2 p-3">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-6" />
            ))}
          </div>
        </Card>
      </aside>
      <main className="space-y-4">
        {(['topLive', 'topMatches', 'boosted', 'topCompetitions'] as const).map((k) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle>{t(k)}</CardTitle>
            </CardHeader>
            <p className="p-4 text-sm text-ink-muted">{t('comingSoon')}</p>
          </Card>
        ))}
      </main>
      <aside className="hidden xl:block">
        <Card className="sticky top-18 h-64" />
      </aside>
    </div>
  );
}
