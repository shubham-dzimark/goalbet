'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { Alert, Button, Field, Input } from '@goalbet/ui';
import { type LoginInput, loginSchema } from '@goalbet/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { PasswordInput } from '@/components/auth/password-input';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { type SessionUser, useAuth } from '@/lib/auth-store';
import { useApiFormError } from '@/lib/use-api-form';
import { useFieldError } from '@/lib/use-error-message';

function LoginForm() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const router = useRouter();
  const locale = useLocale();
  const search = useSearchParams();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });
  const { formError, handle } = useApiFormError(form.setError);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/auth/login', { method: 'POST', body: values });
      useAuth.getState().setSession(res.accessToken, res.user);
      const next = search.get('next');
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(target, { locale: res.user.locale === 'en' || res.user.locale === 'ro' ? res.user.locale : locale });
    } catch (e) {
      handle(e);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="login-form">
      {formError ? <Alert>{formError}</Alert> : null}
      <Field label={t('email')} htmlFor="email" error={fe(errors.email?.message)}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
      </Field>
      <Field label={t('password')} htmlFor="password" error={fe(errors.password?.message)}>
        <PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
          {t('forgot')}
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
        {t('submitLogin')}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  const t = useTranslations('auth');
  return (
    <AuthCard
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      footer={
        <>
          {t('noAccount')}{' '}
          <Link href="/register" className="font-semibold text-brand hover:underline">
            {t('submitRegister')}
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
