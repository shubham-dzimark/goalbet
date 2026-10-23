'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { type z } from 'zod';
import { Alert, Button, Field, Input } from '@goalbet/ui';
import { forgotPasswordSchema } from '@goalbet/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useApiFormError } from '@/lib/use-api-form';
import { useFieldError } from '@/lib/use-error-message';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const { formError, handle } = useApiFormError(form.setError);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api('/auth/forgot-password', { method: 'POST', body: values });
      setSent(true);
    } catch (e) {
      handle(e);
    }
  });

  return (
    <AuthCard
      title={t('forgotTitle')}
      subtitle={t('forgotSubtitle')}
      footer={
        <Link href="/login" className="font-semibold text-brand hover:underline">
          {t('submitLogin')}
        </Link>
      }
    >
      {sent ? (
        <Alert tone="success">{t('forgotSent')}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {formError ? <Alert>{formError}</Alert> : null}
          <Field label={t('email')} htmlFor="email" error={fe(form.formState.errors.email?.message)}>
            <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            {t('forgotSubmit')}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
