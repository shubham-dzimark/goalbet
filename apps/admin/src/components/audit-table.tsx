'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type AdminAuditRow } from '@goalbet/shared';
import { Dialog, SidePanelContent } from '@goalbet/ui';
import { usePaged } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { AuditCategoryBadge } from './ui/badges';
import { type Column, DataTable } from './ui/data-table';
import { DetailList } from './ui/page';

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="text-sm text-ink-faint">—</p>;
  return (
    <pre className="max-h-64 overflow-auto rounded-xl bg-chrome-strong p-3 font-mono text-[12px] leading-relaxed text-ink-muted ring-1 ring-line">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** One audit entry: who, what, when, from where, and the before/after state (F3.8). */
export function AuditPanel({ entry, onClose }: { entry: AdminAuditRow | null; onClose: () => void }) {
  const t = useTranslations('audit');
  const tc = useTranslations('common2');
  const f = useFmt();
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <SidePanelContent title={entry?.action ?? ''} description={entry ? f.dateTime(entry.createdAt) : undefined} closeLabel={tc('close')}>
        {entry ? (
          <div className="space-y-5" data-testid="audit-panel">
            <DetailList
              rows={[
                { label: t('cols.category'), value: <AuditCategoryBadge category={entry.category} /> },
                { label: t('cols.actor'), value: `${entry.actorLabel ?? '—'} (${t(`actorTypes.${entry.actorType}`)})` },
                { label: t('cols.entity'), value: entry.entityType ? <span className="font-mono text-xs">{entry.entityType} · {entry.entityId}</span> : '—' },
                { label: t('ip'), value: entry.ip ?? '—' },
              ]}
            />
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{t('before')}</h3>
              <Json value={entry.before} />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{t('after')}</h3>
              <Json value={entry.after} />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">{t('meta')}</h3>
              <Json value={entry.meta} />
            </section>
          </div>
        ) : null}
      </SidePanelContent>
    </Dialog>
  );
}

/** Audit log table (Audit page, player history). */
export function AuditTable({ params, testId }: { params: Record<string, string | undefined>; testId?: string }) {
  const t = useTranslations('audit');
  const f = useFmt();
  const [open, setOpen] = useState<AdminAuditRow | null>(null);
  const list = usePaged<AdminAuditRow>(['audit'], '/admin/audit', params);

  const columns: Column<AdminAuditRow>[] = [
    {
      key: 'time',
      header: t('cols.time'),
      cell: (a) => (
        <div className="whitespace-nowrap">
          <p className="text-sm">{f.dateTime(a.createdAt)}</p>
          <p className="text-[11px] text-ink-faint">{f.ago(a.createdAt)}</p>
        </div>
      ),
    },
    { key: 'category', header: t('cols.category'), cell: (a) => <AuditCategoryBadge category={a.category} /> },
    { key: 'action', header: t('cols.action'), cell: (a) => <span className="font-mono text-xs font-semibold">{a.action}</span> },
    {
      key: 'actor',
      header: t('cols.actor'),
      cell: (a) => (
        <div className="max-w-[220px]">
          <p className="truncate text-sm">{a.actorLabel ?? '—'}</p>
          <p className="text-[11px] text-ink-faint">{t(`actorTypes.${a.actorType}`)}</p>
        </div>
      ),
      hideBelow: 'md',
    },
    { key: 'entity', header: t('cols.entity'), cell: (a) => <span className="text-xs text-ink-muted">{a.entityType ?? '—'}</span>, hideBelow: 'lg' },
  ];

  return (
    <>
      <DataTable
        testId={testId}
        columns={columns}
        rows={list.items}
        rowKey={(a) => a.id}
        loading={list.isLoading}
        onRowClick={setOpen}
        hasMore={list.hasNextPage}
        loadingMore={list.isFetchingNextPage}
        onLoadMore={() => void list.fetchNextPage()}
        empty={t('empty')}
      />
      <AuditPanel entry={open} onClose={() => setOpen(null)} />
    </>
  );
}
