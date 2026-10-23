import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[var(--radius-card)] border border-line bg-card shadow-xs', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-2 border-b border-line px-4 py-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-display text-lg font-bold uppercase tracking-wide', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase', {
  variants: {
    tone: {
      neutral: 'bg-card-alt text-ink-muted',
      brand: 'bg-brand-soft text-brand-strong',
      live: 'bg-live text-white',
      boost: 'bg-boost text-boost-ink',
      success: 'bg-brand-soft text-success',
      warning: 'bg-amber-100 text-warning',
      danger: 'bg-orange-100 text-danger',
      info: 'bg-blue-100 text-info',
      chrome: 'bg-chrome-soft text-chrome-ink',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2', className)} aria-hidden="true">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-line/70', className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-line', className)} />;
}

export function Alert({
  tone = 'danger',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'danger' | 'warning' | 'success' | 'info' }) {
  const tones = {
    danger: 'border-orange-200 bg-orange-50 text-danger',
    warning: 'border-amber-200 bg-amber-50 text-warning',
    success: 'border-emerald-200 bg-emerald-50 text-success',
    info: 'border-blue-200 bg-blue-50 text-info',
  } as const;
  return <div role="alert" className={cn('rounded-lg border px-3 py-2 text-sm', tones[tone], className)} {...props} />;
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-ink-muted">
      {icon}
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
