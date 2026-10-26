'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TicketsTable } from '@/components/tickets-table';
import { DateInput, FilterSelect, PageHeader, SearchInput, ViewTabs } from '@/components/ui/page';

const VIEWS = ['all', 'open', 'live', 'settled', 'cashout'] as const;
type View = (typeof VIEWS)[number];
const SETTLED = ['WON', 'LOST', 'VOID', 'CASHED_OUT'] as const;

/** F3.4 bet management: every ticket; live / settled / cash outs; won / lost / void. */
export default function BetsPage() {
  const t = useTranslations('bets');
  const ts = useTranslations('ticketStatus');
  const tt = useTranslations('ticketType');
  const [view, setView] = useState<View>('all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <div className="mb-4 space-y-3">
        <ViewTabs
          label={t('views.label')}
          value={view}
          onChange={(v) => {
            setView(v);
            setStatus('');
          }}
          options={VIEWS.map((v) => ({ value: v, label: t(`views.${v}`) }))}
        />
        <div className="flex flex-wrap items-end gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="min-w-[220px] flex-1" />
          {view === 'settled' ? (
            <FilterSelect label={t('cols.status')} value={status} onChange={setStatus} options={[{ value: '', label: t('anyResult') }, ...SETTLED.map((s) => ({ value: s, label: ts(s) }))]} />
          ) : null}
          <FilterSelect
            label={t('type')}
            value={type}
            onChange={setType}
            options={[
              { value: '', label: t('allTypes') },
              { value: 'SINGLE', label: tt('SINGLE') },
              { value: 'ACCA', label: tt('ACCA') },
            ]}
          />
          <DateInput label={t('from')} value={from} onChange={setFrom} />
          <DateInput label={t('to')} value={to} onChange={setTo} />
        </div>
      </div>
      <TicketsTable params={{ view, q, type, status, from, to }} testId="bets-table" />
    </>
  );
}
