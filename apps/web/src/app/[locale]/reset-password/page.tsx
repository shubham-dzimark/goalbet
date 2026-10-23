'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert, Button, Field } from '@goalbet/ui';
import { passwordSchema } from '@goalbet/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { PasswordInput } from '@/components/auth/password-input';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useApiFormError } from '@/lib/use-api-form';
import { useFieldError } from '@/lib/use-error-message';

const schema = z.object({ password: passwordSchema });

function ResetForm() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const token = useSearchParams().get('token') ?? '';
  const [done, setDone] = useState(false);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '' } });
  const { formError, handle } = useApiFormError(form.setError);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: values.password } });
      setDone(true);
    } catch (e) {
      handle(e);
    }
  });

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t('resetDone')}</Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/login">{t('submitLogin')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? <Alert>{formError}</Alert> : null}
      <Field label={t('newPassword')} htmlFor="password" error={fe(form.formState.errors.password?.message)} hint={t('passwordHint')}>
        <PasswordInput id="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
        {t('resetSubmit')}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  return (
    <AuthCard title={t('resetTitle')}>
      <Suspense>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
