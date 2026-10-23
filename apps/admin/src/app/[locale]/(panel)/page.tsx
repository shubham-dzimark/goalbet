'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@goalbet/ui';
import { useSession } from '@/lib/session';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const admin = useSession((s) => s.admin);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-semibold" data-testid="admin-welcome">
          {t('welcome', { name: admin?.name ?? '' })}
        </p>
        <p className="text-sm text-ink-muted">{t('phaseNote')}</p>
      </CardContent>
    </Card>
  );
}
