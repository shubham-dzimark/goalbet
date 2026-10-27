'use client';

import { AlertTriangle, Ban, Clock, ExternalLink, History, LifeBuoy, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@goalbet/ui';
import { PageTitle } from '@/components/sport/event-list';
import { Link } from '@/i18n/navigation';

const TOOLS = [
  { key: 'limits', icon: ShieldCheck, tab: 'limits' },
  { key: 'reality', icon: Clock, tab: 'preferences' },
  { key: 'exclusion', icon: Ban, tab: 'exclusion' },
  { key: 'history', icon: History, tab: 'overview' },
] as const;

/** Responsible gambling: the player's tools, warning signs and where to get help in Romania. */
export default function ResponsibleGamblingPage() {
  const t = useTranslations('rg');
  const signs = t.raw('signs') as string[];
  return (
    <div className="max-w-4xl space-y-6" data-testid="rg-page">
      <PageTitle sub={t('kicker')}>{t('title')}</PageTitle>
      <p className="text-ink-muted">{t('intro')}</p>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold uppercase italic">{t('toolsTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map(({ key, icon: Icon, tab }) => (
            <Link
              key={key}
              href={`/account?tab=${tab}`}
              className="group flex gap-3 rounded-2xl bg-card-solid p-4 ring-1 ring-line transition-colors hover:ring-brand/40"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/12 text-brand">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-semibold group-hover:text-brand">{t(`tools.${key}.title`)}</span>
                <span className="block text-sm text-ink-muted">{t(`tools.${key}.text`)}</span>
              </span>
            </Link>
          ))}
        </div>
        <Button asChild variant="outline" className="mt-3">
          <Link href="/account?tab=limits">{t('manage')}</Link>
        </Button>
      </section>

      <section className="rounded-2xl bg-warning/[0.07] p-5 ring-1 ring-warning/30">
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase italic">
          <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
          {t('signsTitle')}
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {signs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase italic">
          <LifeBuoy className="size-5 text-brand" aria-hidden="true" />
          {t('helpTitle')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <a href="https://jocresponsabil.ro" target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-card-solid p-4 ring-1 ring-line hover:ring-brand/40">
            <span className="flex items-center gap-1.5 font-semibold">
              {t('helpLine')}
              <ExternalLink className="size-3.5 text-ink-faint" aria-hidden="true" />
            </span>
            <span className="mt-1 block text-sm text-ink-muted">{t('helpLineText')}</span>
          </a>
          <a href="https://onjn.gov.ro" target="_blank" rel="noopener noreferrer" className="rounded-2xl bg-card-solid p-4 ring-1 ring-line hover:ring-brand/40">
            <span className="flex items-center gap-1.5 font-semibold">
              {t('onjn')}
              <ExternalLink className="size-3.5 text-ink-faint" aria-hidden="true" />
            </span>
            <span className="mt-1 block text-sm text-ink-muted">{t('onjnText')}</span>
          </a>
        </div>
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <span className="grid size-8 place-items-center rounded-full border-2 border-danger/70 font-display text-xs">18+</span>
          {t('adults')}
        </p>
      </section>
    </div>
  );
}
