'use client';

import { ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input, Logo } from '@goalbet/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useRouter } from '@/i18n/navigation';
import { type AdminProfile, ApiError, useSession } from '@/lib/session';

type Step =
  | { kind: 'credentials' }
  | { kind: 'totp' }
  | { kind: 'setup'; setupToken: string; qrDataUrl: string; secret: string };

type LoginResponse =
  | { status: 'OK'; accessToken: string; admin: AdminProfile }
  | { status: 'TOTP_REQUIRED' }
  | { status: 'TOTP_SETUP'; setupToken: string; qrDataUrl: string; secret: string };

async function post(path: string, body: unknown): Promise<LoginResponse> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(json?.error?.code ?? 'INTERNAL', res.status, json?.error?.details);
  return json as LoginResponse;
}

/** F3.1 — email + password, then TOTP (or first-time authenticator enrolment). */
export default function AdminLoginPage() {
  const t = useTranslations('login');
  const te = useTranslations('errors');
  const locale = useLocale();
  const router = useRouter();
  const { status, expired, admin } = useSession();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authed') router.replace('/', { locale: admin?.locale === 'en' || admin?.locale === 'ro' ? admin.locale : locale });
  }, [status, admin, router, locale]);

  const handle = (r: LoginResponse) => {
    if (r.status === 'OK') useSession.getState().setSession(r.accessToken, r.admin);
    else if (r.status === 'TOTP_REQUIRED') setStep({ kind: 'totp' });
    else setStep({ kind: 'setup', setupToken: r.setupToken, qrDataUrl: r.qrDataUrl, secret: r.secret });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step.kind === 'credentials') handle(await post('/admin/auth/login', { email, password }));
      else if (step.kind === 'totp') handle(await post('/admin/auth/login', { email, password, totp: code }));
      else handle(await post('/admin/auth/totp/enable', { setupToken: step.setupToken, totp: code }));
      setCode('');
    } catch (err) {
      const c = err instanceof ApiError ? err.code : 'INTERNAL';
      setError(te.has(c) ? te(c) : te('INTERNAL'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-chrome px-4 py-10">
      <div className="mb-6 flex w-full max-w-md items-center justify-between text-chrome-ink">
        <Logo suffix="Admin" />
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-2">
          <ShieldCheck className="size-6 text-brand" aria-hidden="true" />
          <h1 className="font-display text-2xl font-bold">
            {step.kind === 'credentials' ? t('title') : step.kind === 'totp' ? t('totpTitle') : t('setupTitle')}
          </h1>
        </div>
        {expired ? <Alert tone="warning" className="mb-4">{t('expired')}</Alert> : null}
        {step.kind === 'credentials' ? <p className="mb-4 text-sm text-ink-muted">{t('subtitle')}</p> : null}
        {error ? <Alert className="mb-4">{error}</Alert> : null}

        <form onSubmit={submit} className="space-y-4" data-testid="admin-login-form">
          {step.kind === 'credentials' ? (
            <>
              <Field label={t('email')} htmlFor="email">
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t('password')} htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          ) : (
            <>
              {step.kind === 'setup' ? (
                <div className="space-y-3 text-sm text-ink-muted">
                  <p>{t('setupHelp')}</p>
                  <img src={step.qrDataUrl} alt="" width={180} height={180} className="mx-auto rounded-lg border border-line" />
                  <p>
                    {t('setupSecret')} <code className="break-all rounded bg-card-alt px-1.5 py-0.5 font-mono text-ink">{step.secret}</code>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">{t('totpHelp')}</p>
              )}
              <Field label={t('totpCode')} htmlFor="totp">
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center font-mono text-lg tracking-[0.4em]"
                />
              </Field>
            </>
          )}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            {step.kind === 'credentials' ? t('continue') : t('verify')}
          </Button>
          {step.kind !== 'credentials' ? (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setStep({ kind: 'credentials' })}>
              {t('back')}
            </Button>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
