'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LaptopMinimal, LogOut, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { type AdminAccount, type AdminTotpSetup } from '@goalbet/shared';
import { Alert, Badge, Button, Dialog, DialogContent, Field, Input, Skeleton } from '@goalbet/ui';
import { toast } from '@/components/ui/feedback';
import { DetailList, PageHeader, Panel } from '@/components/ui/page';
import { useErrorText } from '@/lib/data';
import { useFmt } from '@/lib/format';
import { adminApi, useSession } from '@/lib/session';

/** The signed-in admin's own settings: profile, password, 2FA and active sessions. */
export default function AccountPage() {
  const t = useTranslations('account');
  const tr = useTranslations('roles');
  const f = useFmt();
  const { data, isLoading } = useQuery({ queryKey: ['account'], queryFn: () => adminApi<AdminAccount>('/admin/account') });

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-[var(--radius-card)]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader kicker={t('kicker')} title={t('title')} description={t('description')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={<span className="flex items-center gap-2"><UserRound className="size-4 text-brand" aria-hidden="true" />{t('profile.title')}</span>}>
          <ProfileForm account={data} />
          <div className="mt-4">
            <DetailList
              rows={[
                { label: t('profile.email'), value: data.email },
                { label: t('profile.role'), value: tr(data.role) },
                { label: t('profile.since'), value: f.date(data.createdAt) },
                { label: t('profile.lastLogin'), value: data.lastLoginAt ? f.dateTime(data.lastLoginAt) : '—' },
              ]}
            />
            <p className="mt-2 text-xs text-ink-faint">{t('profile.emailHelp')}</p>
          </div>
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><KeyRound className="size-4 text-brand" aria-hidden="true" />{t('password.title')}</span>}>
          <PasswordForm needsCode={data.totpEnabled} />
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand" aria-hidden="true" />{t('totp.title')}</span>}>
          <TotpSection enabled={data.totpEnabled} />
        </Panel>

        <Panel title={<span className="flex items-center gap-2"><LaptopMinimal className="size-4 text-brand" aria-hidden="true" />{t('sessions.title')}</span>} bodyClassName="p-0">
          <Sessions account={data} />
        </Panel>
      </div>
    </>
  );
}

function ProfileForm({ account }: { account: AdminAccount }) {
  const t = useTranslations('account.profile');
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [name, setName] = useState(account.name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setName(account.name), [account.name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const next = await adminApi<AdminAccount>('/admin/account', { method: 'PATCH', body: { name } });
      qc.setQueryData(['account'], next);
      const s = useSession.getState();
      if (s.admin && s.accessToken) s.setSession(s.accessToken, { ...s.admin, name: next.name });
      toast.success(t('saved'));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <Field label={t('name')} htmlFor="acc-name" className="flex-1">
        <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} data-testid="account-name" />
      </Field>
      <Button type="submit" loading={busy} disabled={name.trim() === account.name || name.trim().length < 2}>
        {t('save')}
      </Button>
    </form>
  );
}

function PasswordForm({ needsCode }: { needsCode: boolean }) {
  const t = useTranslations('account.password');
  const tv = useTranslations('validation');
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError(tv('passwordLength'));
    if (!/[A-Za-z]/.test(next)) return setError(tv('passwordLetter'));
    if (!/\d/.test(next)) return setError(tv('passwordDigit'));
    if (next !== confirm) return setError(tv('passwordMatch'));
    setBusy(true);
    setError(null);
    try {
      const acc = await adminApi<AdminAccount>('/admin/account/password', { method: 'POST', body: { currentPassword: current, newPassword: next, ...(needsCode ? { totp: code } : {}) } });
      qc.setQueryData(['account'], acc);
      setCurrent('');
      setNext('');
      setConfirm('');
      setCode('');
      toast.success(t('changed'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="password-form">
      <Field label={t('current')} htmlFor="pw-current">
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('new')} htmlFor="pw-new" hint={t('rules')}>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        <Field label={t('confirm')} htmlFor="pw-confirm">
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
      </div>
      {needsCode ? (
        <Field label={t('code')} htmlFor="pw-code">
          <Input id="pw-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required className="block w-40 font-mono tracking-[0.3em]" />
        </Field>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">{t('note')}</p>
        <Button type="submit" loading={busy}>
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}

type TotpMode = 'enable' | 'move' | 'disable';

/**
 * Optional 2FA, the admin's own choice. Turn on: password → scan QR → code. Move to a new phone:
 * current code → scan QR → code. Turn off: password + current code.
 */
function TotpSection({ enabled }: { enabled: boolean }) {
  const t = useTranslations('account.totp');
  const tc = useTranslations('common2');
  const qc = useQueryClient();
  const errorText = useErrorText();
  const [mode, setMode] = useState<TotpMode | null>(null);
  const [setup, setSetup] = useState<AdminTotpSetup | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mode) {
      setSetup(null);
      setPassword('');
      setCode('');
      setError(null);
    }
  }, [mode]);

  const needsPassword = !setup && (mode === 'enable' || mode === 'disable');
  const needsCode = setup !== null || mode === 'move' || mode === 'disable';
  const ready = (!needsPassword || password.length > 0) && (!needsCode || code.length === 6);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'disable') {
        qc.setQueryData(['account'], await adminApi<AdminAccount>('/admin/account/totp/disable', { method: 'POST', body: { password, totp: code } }));
        toast.success(t('disabled'));
        setMode(null);
      } else if (!setup) {
        const body = mode === 'enable' ? { password } : { totp: code };
        setSetup(await adminApi<AdminTotpSetup>('/admin/account/totp/start', { method: 'POST', body }));
        setPassword('');
        setCode('');
      } else {
        qc.setQueryData(['account'], await adminApi<AdminAccount>('/admin/account/totp/confirm', { method: 'POST', body: { setupToken: setup.setupToken, totp: code } }));
        toast.success(t(mode === 'enable' ? 'enabled' : 'changed'));
        setMode(null);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'enable' ? t('enable') : mode === 'disable' ? t('disable') : t('move');
  const description =
    mode === 'disable' ? t('disableHelp') : mode === 'enable' ? (setup ? t('enableStep2') : t('enableStep1')) : setup ? t('step2') : t('step1');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <Smartphone className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">{t('app')}</p>
          <Badge tone={enabled ? 'success' : 'neutral'}>{t(enabled ? 'on' : 'off')}</Badge>
        </div>
      </div>
      <p className="text-sm text-ink-muted">{t(enabled ? 'help' : 'offHelp')}</p>
      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setMode('move')} data-testid="totp-move">
            {t('move')}
          </Button>
          <Button variant="ghost" onClick={() => setMode('disable')} data-testid="totp-disable">
            {t('disable')}
          </Button>
        </div>
      ) : (
        <Button onClick={() => setMode('enable')} data-testid="totp-enable">
          {t('enable')}
        </Button>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent title={title} description={description} closeLabel={tc('close')}>
          <form onSubmit={submit} className="space-y-4">
            {setup ? (
              <div className="space-y-2 text-center">
                <img src={setup.qrDataUrl} alt="" width={180} height={180} className="mx-auto rounded-lg border border-line bg-white p-1" />
                <p className="text-xs text-ink-muted">{t('manual')}</p>
                <code className="block break-all rounded-lg bg-chrome-strong px-2 py-1.5 font-mono text-xs">{setup.secret}</code>
              </div>
            ) : null}
            {needsPassword ? (
              <Field label={t('password')} htmlFor="totp-password">
                <Input id="totp-password" type="password" autoComplete="current-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} data-testid="totp-password" />
              </Field>
            ) : null}
            {needsCode ? (
              <Field label={setup ? t('newCode') : t('currentCode')} htmlFor="totp-code">
                <Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus={!needsPassword} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="font-mono tracking-[0.3em]" data-testid="totp-code" />
              </Field>
            ) : null}
            {error ? <Alert>{error}</Alert> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setMode(null)}>
                {tc('cancel')}
              </Button>
              <Button type="submit" loading={busy} disabled={!ready} variant={mode === 'disable' ? 'danger' : 'primary'}>
                {mode === 'disable' ? t('disable') : setup ? t(mode === 'enable' ? 'enableConfirm' : 'confirm') : t('continue')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Rough "Chrome on Windows" from the user agent. */
function device(ua: string | null) {
  if (!ua) return '—';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

function Sessions({ account }: { account: AdminAccount }) {
  const t = useTranslations('account.sessions');
  const f = useFmt();
  const qc = useQueryClient();
  const errorText = useErrorText();
  const end = async (target: string) => {
    try {
      qc.setQueryData(['account'], await adminApi<AdminAccount>(`/admin/account/sessions/${target}`, { method: 'DELETE' }));
      toast.success(t('ended'));
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const others = account.sessions.filter((s) => !s.current).length;

  return (
    <>
      <ul className="divide-y divide-line" data-testid="sessions">
        {account.sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                {device(s.userAgent)}
                {s.current ? <Badge tone="brand">{t('current')}</Badge> : null}
              </p>
              <p className="text-xs text-ink-faint">
                {s.ip ?? '—'} · {t('active', { when: f.ago(s.lastUsedAt) })}
              </p>
            </div>
            {!s.current ? (
              <Button size="sm" variant="ghost" onClick={() => void end(s.id)}>
                {t('end')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <div className="border-t border-line p-3 text-right">
          <Button size="sm" variant="secondary" onClick={() => void end('others')}>
            <LogOut aria-hidden="true" />
            {t('endOthers', { count: others })}
          </Button>
        </div>
      ) : null}
    </>
  );
}
