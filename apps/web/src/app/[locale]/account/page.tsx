'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@goalbet/ui';
import { formatRon } from '@goalbet/shared';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth-store';

/** F1.4 account — phase 1 shows the profile and RON balance; the full dashboard lands in phase 2. */
export default function AccountPage() {
  const t = useTranslations('nav');
  const tc = useTranslations('auth');
  const locale = useLocale() as 'ro' | 'en';
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'guest') router.replace({ pathname: '/login', query: { next: '/account' } });
  }, [status, router]);

  if (!user) return <Skeleton className="m-4 h-40" />;
  return (
    <div className="mx-auto max-w-3xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('account')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-ink-muted">{t('balance')}</p>
            <p className="font-display text-3xl font-bold" data-testid="account-balance">
              {formatRon(user.balanceBani, locale)}
            </p>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-muted">{tc('name')}:</dt>
              <dd className="font-semibold">{user.name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">{tc('email')}:</dt>
              <dd>{user.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-muted">{tc('phone')}:</dt>
              <dd>{user.phone}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
