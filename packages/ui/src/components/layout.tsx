import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-[var(--radius-card)]', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-between gap-2 border-b border-line px-4 py-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('font-display text-lg font-bold uppercase italic tracking-wide', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', {
  variants: {
    tone: {
      neutral: 'bg-tint/8 text-ink-muted',
      brand: 'bg-brand-soft text-brand',
      live: 'bg-live text-white',
      boost: 'bg-boost text-boost-ink',
      success: 'bg-success/15 text-success',
      warning: 'bg-warning/15 text-warning',
      danger: 'bg-danger/15 text-danger',
      info: 'bg-info/15 text-info',
      chrome: 'bg-tint/10 text-chrome-ink',
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
    <span
      className={cn('relative inline-flex size-2 rounded-full bg-live [animation:gb-pulse-ring_1.4s_ease-out_infinite]', className)}
      aria-hidden="true"
    />
  );
}

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg bg-[linear-gradient(90deg,rgb(255_255_255/0.04),rgb(255_255_255/0.09),rgb(255_255_255/0.04))] bg-[length:200%_100%] [animation:gb-shimmer_1.6s_linear_infinite]',
        className,
      )}
      {...props}
    />
  );
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
    danger: 'border-danger/30 bg-danger/10 text-danger',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    success: 'border-success/30 bg-success/10 text-success',
    info: 'border-info/30 bg-info/10 text-info',
  } as const;
  return <div role="alert" className={cn('rounded-xl border px-3 py-2 text-sm', tones[tone], className)} {...props} />;
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-ink-muted">
      {icon}
      <p className="font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
