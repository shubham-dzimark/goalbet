'use client';

import { Inbox, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode } from 'react';
import { Skeleton, cn } from '@goalbet/ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  /** hidden below this breakpoint to keep phone tables readable */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' } as const;
const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Admin data table: sticky header, skeleton loading, empty state, clickable rows and
 * "load more" for cursor-paged lists.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  onRowClick,
  empty,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  testId,
  className,
  compact = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: ((row: T) => void) | undefined;
  empty?: ReactNode;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  testId?: string;
  className?: string;
  /** small tables in a side panel: no minimum width */
  compact?: boolean;
}) {
  const t = useTranslations('table');
  return (
    <div className={cn('glass overflow-hidden rounded-[var(--radius-card)]', className)} data-testid={testId}>
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-sm', !compact && 'min-w-[640px]')}>
          <thead>
            <tr className="border-b border-line bg-tint/[0.03]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-faint',
                    ALIGN[c.align ?? 'left'],
                    c.hideBelow && HIDE[c.hideBelow],
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3.5', c.hideBelow && HIDE[c.hideBelow])}>
                        <Skeleton className="h-4 w-full max-w-[140px]" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={onRowClick ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(row)) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    className={cn(
                      'border-b border-line transition-colors last:border-0',
                      onRowClick && 'cursor-pointer hover:bg-brand/[0.05] focus-visible:bg-brand/[0.07] focus-visible:outline-none',
                    )}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3 align-middle', ALIGN[c.align ?? 'left'], c.hideBelow && HIDE[c.hideBelow], c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-ink-muted">
          <Inbox className="size-8 text-ink-faint" aria-hidden="true" />
          <p className="text-sm">{empty ?? t('empty')}</p>
        </div>
      ) : null}
      {hasMore ? (
        <div className="border-t border-line p-3 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t('loadMore')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
