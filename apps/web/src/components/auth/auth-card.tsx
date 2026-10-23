import type { ReactNode } from 'react';
import { Card, LogoMark } from '@goalbet/ui';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex justify-center px-4 py-8 sm:py-14">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <LogoMark className="mt-1 h-9 w-9 shrink-0" />
          <div>
            <h1 className="font-display text-3xl font-bold leading-tight">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
          </div>
        </div>
        {children}
        {footer ? <div className="mt-6 border-t border-line pt-4 text-center text-sm text-ink-muted">{footer}</div> : null}
      </Card>
    </div>
  );
}
