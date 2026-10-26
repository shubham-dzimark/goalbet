'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AUDIT_CATEGORIES } from '@goalbet/shared';
import { AuditTable } from '@/components/audit-table';
import { DateInput, FilterSelect, PageHeader, SearchInput, ViewTabs } from '@/components/ui/page';
import { adminApi } from '@/lib/session';

/** F3.8 audit logs: admin actions, wallet changes, betting activity and system events. */
export default function AuditPage() {
  const t = useTranslations('audit');
  const [category, setCategory] = useState('');
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: actions } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => adminApi<{ category: string; action: string; count: number }[]>('/admin/audit/actions'),
  });
  const actionOptions = (actions ?? []).filter((a) => !category || a.category === category);

  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <div className="mb-4 space-y-3">
        <ViewTabs
          label={t('cols.category')}
          value={category}
          onChange={(v) => {
            setCategory(v);
            setAction('');
          }}
          options={[{ value: '', label: t('all') }, ...AUDIT_CATEGORIES.map((c) => ({ value: c as string, label: t(`categories.${c}`) }))]}
        />
        <div className="flex flex-wrap items-end gap-2">
          <SearchInput value={q} onChange={setQ} placeholder={t('search')} className="min-w-[220px] flex-1" />
          <FilterSelect
            label={t('cols.action')}
            value={action}
            onChange={setAction}
            options={[{ value: '', label: t('allActions') }, ...actionOptions.map((a) => ({ value: a.action, label: `${a.action} (${a.count})` }))]}
          />
          <FilterSelect
            label={t('cols.actor')}
            value={actorType}
            onChange={setActorType}
            options={[{ value: '', label: t('allActors') }, ...(['ADMIN', 'USER', 'SYSTEM'] as const).map((a) => ({ value: a, label: t(`actorTypes.${a}`) }))]}
          />
          <DateInput label={t('from')} value={from} onChange={setFrom} />
          <DateInput label={t('to')} value={to} onChange={setTo} />
        </div>
      </div>
      <AuditTable params={{ category, action, actorType, q, from, to }} testId="audit-table" />
    </>
  );
}
