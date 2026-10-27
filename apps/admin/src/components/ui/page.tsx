'use client';

import { type LucideIcon, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { cn } from '@goalbet/ui';

/** Page title row: kicker, title, description and actions. */
export function PageHeader({ title, description, actions, kicker }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; kicker?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {kicker ? <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-brand">{kicker}</p> : null}
        <h1 className="font-display text-3xl font-bold uppercase italic leading-none tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONES = {
  brand: 'text-brand bg-brand-soft',
  gold: 'text-accent bg-accent-soft',
  live: 'text-live bg-live/12',
  info: 'text-info bg-info/12',
  neutral: 'text-ink-muted bg-tint/[0.06]',
  danger: 'text-danger bg-danger/12',
} as const;

/** KPI tile. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn('glass relative overflow-hidden rounded-[var(--radius-card)] p-4', className)} data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        {Icon ? (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', TONES[tone])}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums leading-none">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/** Rounded panel with an optional title row. */
export function Panel({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('glass overflow-hidden rounded-[var(--radius-card)]', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          {title ? <h2 className="font-display text-lg font-bold uppercase italic tracking-wide">{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Search box that reports its value after the user stops typing. */
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    const id = setTimeout(() => text !== value && onChange(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text, value, onChange]);
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[var(--radius-control)] border border-line bg-tint/[0.04] pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand/60 focus:outline-none"
      />
    </label>
  );
}

/** Compact select for filter bars. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-10 rounded-[var(--radius-control)] border border-line bg-card-solid px-3 pr-8 text-sm text-ink focus:border-brand/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-muted">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-[var(--radius-control)] border border-line bg-tint/[0.04] px-2 text-sm text-ink focus:border-brand/60 focus:outline-none"
      />
    </label>
  );
}

/** Pill tabs for quick views (all · live · settled …). */
export function ViewTabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number | undefined }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-tint/[0.05] p-1 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink',
            value === o.value && 'bg-brand text-brand-ink hover:text-brand-ink',
          )}
        >
          {o.label}
          {o.count !== undefined ? <span className="rounded-full bg-black/15 px-1.5 text-[10px]">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Label/value rows for detail panels. */
export function DetailList({ rows }: { rows: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2">
          <dt className="shrink-0 text-ink-muted">{r.label}</dt>
          <dd className="min-w-0 text-right font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Accessible on/off switch. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  tone = 'brand',
  testId,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: 'brand' | 'danger';
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      data-testid={testId}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? (tone === 'danger' ? 'bg-danger' : 'bg-brand') : 'bg-tint/15',
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}
