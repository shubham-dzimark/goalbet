'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, Send, Server, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { type AdminMailStatus, type AdminMailTestResult, MAIL_SECURITY } from '@goalbet/shared';
import { Alert, Badge, Button, EmptyState, Input, Skeleton, cn } from '@goalbet/ui';
import { ReasonDialog, toast } from '@/components/ui/feedback';
import { PageHeader, Panel, StatCard, Toggle } from '@/components/ui/page';
import { useCan, useErrorText } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi } from '@/lib/session';

type Security = AdminMailStatus['security'];
type PasswordMode = 'keep' | 'replace' | 'remove';
const DEFAULT_PORT: Record<Security, number> = { tls: 465, starttls: 587, none: 25 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Super admin: the SMTP server used for outgoing email (password resets). */
export default function EmailSettingsPage() {
  const t = useTranslations('email');
  const can = useCan();
  const isSuper = can();
  const { data, isLoading } = useQuery({
    queryKey: ['mail-settings'],
    queryFn: () => adminApi<AdminMailStatus>('/admin/mail'),
    enabled: isSuper,
  });

  if (!isSuper) {
    return (
      <div className="glass rounded-[var(--radius-card)]">
        <EmptyState icon={<Lock className="size-8" />} title={t('forbiddenTitle')}>
          {t('forbiddenHelp')}
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      {isLoading || !data ? <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" /> : <Content data={data} />}
    </>
  );
}

function Content({ data }: { data: AdminMailStatus }) {
  const t = useTranslations('email');
  const f = useFmt();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [enabled, setEnabled] = useState(data.enabled || data.source === 'none');
  const [host, setHost] = useState(data.host);
  const [port, setPort] = useState(String(data.port));
  const [security, setSecurity] = useState<Security>(data.security);
  const [username, setUsername] = useState(data.username);
  const [mode, setMode] = useState<PasswordMode>(data.password.set ? 'keep' : 'replace');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fromName, setFromName] = useState(data.fromName || 'GoalBet');
  const [fromAddress, setFromAddress] = useState(data.fromAddress);
  const [testTo, setTestTo] = useState('');
  const [test, setTest] = useState<AdminMailTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset the form when the saved settings change (e.g. after saving)
  useEffect(() => {
    setEnabled(data.enabled || data.source === 'none');
    setHost(data.host);
    setPort(String(data.port));
    setSecurity(data.security);
    setUsername(data.username);
    setMode(data.password.set ? 'keep' : 'replace');
    setPassword('');
    setFromName(data.fromName || 'GoalBet');
    setFromAddress(data.fromAddress);
  }, [data]);

  const settings = () => ({
    enabled,
    host: host.trim(),
    port: Number(port),
    security,
    username: username.trim(),
    fromName: fromName.trim(),
    fromAddress: fromAddress.trim(),
  });

  const validate = () => {
    if (!host.trim()) return t('errors.host');
    const p = Number(port);
    if (!Number.isInteger(p) || p < 1 || p > 65535) return t('errors.port');
    if (!fromName.trim()) return t('errors.fromName');
    if (!EMAIL.test(fromAddress.trim())) return t('errors.fromAddress');
    if (username.trim() && mode === 'replace' && !password && !data.password.set) return t('errors.password');
    return null;
  };

  const runTest = async () => {
    const problem = validate() ?? (EMAIL.test(testTo.trim()) ? null : t('errors.testTo'));
    setError(problem);
    if (problem) return;
    setTesting(true);
    setTest(null);
    try {
      const body = { ...settings(), to: testTo.trim(), ...(mode === 'replace' && password ? { password } : {}) };
      setTest(await adminApi<AdminMailTestResult>('/admin/mail/test', { method: 'POST', body }));
    } catch (e) {
      setTest({ ok: false, error: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async (reason: string) => {
    const body = {
      ...settings(),
      ...(mode === 'replace' && password ? { password } : mode === 'remove' ? { password: null } : {}),
      reason,
    };
    qc.setQueryData(['mail-settings'], await adminApi<AdminMailStatus>('/admin/mail', { method: 'PUT', body }));
    setTest(null);
    toast.success(t('saved'));
  };

  const sourceHint =
    data.source === 'admin' ? t('stats.fromPanel', { date: data.updatedAt ? f.dateTime(data.updatedAt) : '' }) : data.source === 'env' ? t('stats.fromEnv') : t('stats.none');

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label={t('stats.status')}
          value={data.source === 'none' ? t('stats.logOnly') : data.enabled ? t('stats.on') : t('stats.off')}
          icon={Mail}
          tone={data.source !== 'none' && data.enabled ? 'brand' : 'neutral'}
          hint={sourceHint}
          testId="mail-status"
        />
        <StatCard label={t('stats.server')} value={data.host ? `${data.host}:${data.port}` : '—'} icon={Server} hint={data.host ? t(`security.${data.security}`) : undefined} />
        <StatCard label={t('stats.sender')} value={data.fromAddress || '—'} icon={Send} hint={data.fromName || undefined} />
      </div>

      {data.source === 'none' ? <Alert tone="warning">{t('noneWarning')}</Alert> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title={t('form.title')}>
          <div className="space-y-5" data-testid="mail-form">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Toggle checked={enabled} onChange={setEnabled} label={t('form.enabled')} testId="mail-enabled" />
              <span>
                {t('form.enabled')}
                <span className="block text-xs font-normal text-ink-muted">{t('form.enabledHelp')}</span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.host')}</span>
                <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.example.com" autoComplete="off" spellCheck={false} data-testid="mail-host" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.port')}</span>
                <Input inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} data-testid="mail-port" />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('form.security')}</legend>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
                {MAIL_SECURITY.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={security === s}
                    onClick={() => {
                      // keep a custom port, but follow the usual one when switching
                      if (Number(port) === DEFAULT_PORT[security]) setPort(String(DEFAULT_PORT[s]));
                      setSecurity(s);
                    }}
                    className={cn('rounded-xl p-3 text-left ring-1 transition-colors', security === s ? 'bg-brand-soft ring-brand' : 'bg-tint/[0.03] ring-line hover:ring-line-strong')}
                    data-testid={`mail-security-${s}`}
                  >
                    <span className="block text-sm font-semibold">{t(`security.${s}`)}</span>
                    <span className="block text-xs text-ink-muted">{t(`security.${s}_help`)}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm">
              <span className="mb-1 block font-semibold">{t('form.username')}</span>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} data-testid="mail-username" />
              <span className="mt-1 block text-xs text-ink-faint">{t('form.usernameHelp')}</span>
            </label>

            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">{t('form.password')}</legend>
              {data.password.set && mode !== 'replace' ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint/[0.04] px-3 py-2 ring-1 ring-line">
                  <KeyRound className="size-4 text-brand" aria-hidden="true" />
                  <span className="font-mono text-sm">••••••••••</span>
                  {mode === 'remove' ? <Badge tone="danger">{t('form.willRemove')}</Badge> : <span className="text-xs text-ink-faint">{t('form.stored')}</span>}
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setMode('replace')} data-testid="mail-replace-password">
                      {t('form.replace')}
                    </Button>
                    {mode === 'remove' ? (
                      <Button size="sm" variant="ghost" onClick={() => setMode('keep')}>
                        {t('form.undo')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => setMode('remove')}>
                        {t('form.remove')}
                      </Button>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      spellCheck={false}
                      className="pr-10"
                      aria-label={t('form.password')}
                      data-testid="mail-password"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={t(showPassword ? 'form.hide' : 'form.show')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink">
                      {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                  {data.password.set ? (
                    <Button variant="ghost" onClick={() => (setMode('keep'), setPassword(''))}>
                      {t('form.undo')}
                    </Button>
                  ) : null}
                </div>
              )}
              <p className="text-xs text-ink-faint">{t('form.passwordHelp')}</p>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.fromName')}</span>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} data-testid="mail-from-name" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-semibold">{t('form.fromAddress')}</span>
                <Input type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="no-reply@yourdomain.ro" data-testid="mail-from-address" />
              </label>
            </div>

            {error ? <Alert>{error}</Alert> : null}
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const problem = validate();
                  setError(problem);
                  if (!problem) setConfirm(true);
                }}
                data-testid="mail-save"
              >
                {t('form.save')}
              </Button>
            </div>
          </div>
        </Panel>

        <Panel title={t('test.title')}>
          <p className="mb-3 text-sm text-ink-muted">{t('test.help')}</p>
          <div className="flex gap-2">
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" aria-label={t('test.to')} data-testid="mail-test-to" />
            <Button variant="secondary" onClick={() => void runTest()} loading={testing} data-testid="mail-test">
              <Send aria-hidden="true" />
              {t('test.send')}
            </Button>
          </div>
          {test ? (
            <div
              className={cn('mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-sm ring-1', test.ok ? 'bg-success/10 text-success ring-success/30' : 'bg-danger/10 text-danger ring-danger/30')}
              data-testid="mail-test-result"
            >
              {test.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 break-words">{test.ok ? t('test.ok', { to: testTo.trim() }) : t('test.failed', { error: test.error ?? '' })}</span>
            </div>
          ) : null}
          <div className="mt-5 space-y-2 border-t border-line pt-4 text-xs text-ink-muted">
            <p className="font-semibold text-ink">{t('tips.title')}</p>
            <p>{t('tips.providers')}</p>
            <p>{t('tips.domain')}</p>
          </div>
        </Panel>
      </div>

      <ReasonDialog open={confirm} onOpenChange={setConfirm} title={t('confirm.title')} description={t('confirm.help')} confirmLabel={t('form.save')} onConfirm={save} />
    </div>
  );
}
