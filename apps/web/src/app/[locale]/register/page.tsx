'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { type z } from 'zod';
import { Alert, Button, Checkbox, Field, Input } from '@goalbet/ui';
import { registerSchema } from '@goalbet/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { PasswordInput } from '@/components/auth/password-input';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { type SessionUser, useAuth } from '@/lib/auth-store';
import { useApiFormError } from '@/lib/use-api-form';
import { useFieldError } from '@/lib/use-error-message';

type FormIn = z.input<typeof registerSchema>;
type FormOut = z.output<typeof registerSchema>;

/** F1.3 — Name, Email, Phone, Password (+ date of birth for 18+ and terms). */
export default function RegisterPage() {
  const t = useTranslations('auth');
  const fe = useFieldError();
  const router = useRouter();
  const locale = useLocale() as 'ro' | 'en';
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', dateOfBirth: '', acceptTerms: false as unknown as true },
  });
  const { formError, handle } = useApiFormError(form.setError);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: { ...values, locale },
      });
      useAuth.getState().setSession(res.accessToken, res.user);
      router.replace('/account');
    } catch (e) {
      handle(e);
    }
  });

  return (
    <AuthCard
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <>
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            {t('submitLogin')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4" data-testid="register-form">
        {formError ? <Alert>{formError}</Alert> : null}
        <Field label={t('name')} htmlFor="name" error={fe(errors.name?.message)}>
          <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...form.register('name')} />
        </Field>
        <Field label={t('email')} htmlFor="email" error={fe(errors.email?.message)}>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
        </Field>
        <Field label={t('phone')} htmlFor="phone" error={fe(errors.phone?.message)}>
          <Input id="phone" type="tel" autoComplete="tel" placeholder="07xx xxx xxx" aria-invalid={!!errors.phone} {...form.register('phone')} />
        </Field>
        <Field label={t('password')} htmlFor="password" error={fe(errors.password?.message)} hint={t('passwordHint')}>
          <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
        </Field>
        <Field label={t('dateOfBirth')} htmlFor="dateOfBirth" error={fe(errors.dateOfBirth?.message)}>
          <Input id="dateOfBirth" type="date" autoComplete="bday" aria-invalid={!!errors.dateOfBirth} {...form.register('dateOfBirth')} />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-start gap-3">
            <Controller
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <Checkbox
                  id="acceptTerms"
                  checked={field.value === true}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  aria-invalid={!!errors.acceptTerms}
                  className="mt-0.5"
                />
              )}
            />
            <label htmlFor="acceptTerms" className="text-sm text-ink-muted">
              {t('acceptTerms')}
            </label>
          </div>
          {errors.acceptTerms ? (
            <p role="alert" className="text-xs font-medium text-danger">
              {fe(errors.acceptTerms.message)}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {t('submitRegister')}
        </Button>
      </form>
    </AuthCard>
  );
}
