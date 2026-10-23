'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Radio, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type CountryGroupDto } from '@goalbet/shared';
import { Card, CardHeader, CardTitle, Skeleton, cn } from '@goalbet/ui';
import { Link, usePathname } from '@/i18n/navigation';
import { api } from '@/lib/api';

/** Left sidebar: competitions by country (F1.1 / F1.5). */
export function CompetitionsNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data } = useQuery({ queryKey: ['countries'], queryFn: () => api<CountryGroupDto[]>('/catalog/countries'), staleTime: 60_000 });
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-chrome text-chrome-ink">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-brand" aria-hidden="true" />
          {t('home.competitions')}
        </CardTitle>
      </CardHeader>
      <nav aria-label={t('home.competitions')} className="py-1">
        <Link
          href="/live"
          className={cn('flex items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-card-alt', pathname === '/live' && 'text-brand')}
        >
          <Radio className="size-4 text-live" aria-hidden="true" />
          {t('sport.liveNow')}
        </Link>
        <Link
          href="/sport"
          className={cn('flex items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-card-alt', pathname === '/sport' && 'text-brand')}
        >
          {t('sport.allCompetitions')}
        </Link>
        {!data
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mx-4 my-2 h-5" />)
          : data.map((country) => (
              <div key={country.countryCode} className="border-t border-line">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-bold uppercase tracking-wide text-ink-muted hover:bg-card-alt"
                  aria-expanded={!closed[country.countryCode]}
                  onClick={() => setClosed((c) => ({ ...c, [country.countryCode]: !c[country.countryCode] }))}
                >
                  {country.country}
                  <ChevronDown className={cn('size-4 transition-transform', closed[country.countryCode] && '-rotate-90')} aria-hidden="true" />
                </button>
                {!closed[country.countryCode]
                  ? country.competitions.map((c) => (
                      <Link
                        key={c.id}
                        href={`/sport/${c.id}`}
                        className={cn(
                          'flex items-center justify-between py-1.5 pl-6 pr-4 text-sm hover:bg-card-alt',
                          pathname === `/sport/${c.id}` && 'bg-brand-soft font-semibold text-brand-strong',
                        )}
                      >
                        <span className="truncate">{c.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-ink-faint">
                          {c.live > 0 ? <span className="font-bold text-live">{c.live}</span> : null}
                          {c.upcoming}
                        </span>
                      </Link>
                    ))
                  : null}
              </div>
            ))}
      </nav>
    </Card>
  );
}
